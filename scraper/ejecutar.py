"""Orquesta el scraper y escribe lo que usa la app.

    python ejecutar.py                 SIN RED: usa cache/ y datos/osm_inicial.json
    python ejecutar.py --descargar     CON RED: baja OSM y datos.gov.co (guarda en cache/)
    python ejecutar.py --descargar --refrescar    ignora la caché y vuelve a bajar todo
"""
import argparse
import csv
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from categorias import CATEGORIAS
import geocodificar
from fuentes import alcaldias, datos_gov, manual, osm
from municipios import MUNICIPIOS
from normalizar import PRECISIONES, normalizar, publico
from util import APP_JSON, CACHE, DATOS, SALIDA, norm


def _osm_desde_cache():
    if all(list(CACHE.glob(f"osm-{m['slug']}-*.json")) for m in MUNICIPIOS):
        return osm.descargar(), "caché (cache/osm-*.json)"   # todo en caché: no toca la red
    return osm.desde_volcado(DATOS / "osm_inicial.json"), "volcado inicial (datos/osm_inicial.json)"


def escribir_alcaldias(alc: dict) -> dict:
    """Material de REVISIÓN con lo raspado de las alcaldías (no va al mapa): frases que nombran sitios y resumen por municipio."""
    if not alc:
        return {}
    SALIDA.mkdir(exist_ok=True)
    nombre = {m["slug"]: m["nombre"] for m in MUNICIPIOS}
    filas, vistas, md = [], set(), ["# Alcaldías: material para revisar", "",
                                     "Sale de los portales oficiales. **No está en el mapa**: son noticias e historia, no listas de lugares. "
                                     "Si una frase nombra un sitio real, agrégalo a `datos/lugares_manual.csv` con su ubicación.", ""]
    for slug, paginas in alc.items():
        md += [f"## {nombre[slug]}", ""]
        for p in paginas:
            titulo = p.get("titulo") or p["url"].rsplit("/", 1)[-1].replace("-", " ")
            md.append(f"- [{p['tipo']}] {titulo} — {p['url']}")
            for c in alcaldias.frases_de_lugares("\n".join(p["lineas"])):
                if (slug, c["frase"]) not in vistas:
                    vistas.add((slug, c["frase"]))
                    filas.append({"municipio": nombre[slug], "tipo": c["tipo"], "clave": c["clave"], "frase": c["frase"], "fuente": p["url"]})
        md.append("")
    with open(SALIDA / "candidatos_alcaldias.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["municipio", "tipo", "clave", "frase", "fuente"])
        w.writeheader()
        w.writerows(sorted(filas, key=lambda f: (f["municipio"], f["tipo"])))
    (SALIDA / "alcaldias_resumen.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return {"municipios": len(alc), "paginas": sum(len(p) for p in alc.values()), "frases": len(filas), "por_municipio": Counter(f["municipio"] for f in filas)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--descargar", action="store_true", help="usa la red")
    ap.add_argument("--refrescar", action="store_true", help="ignora la caché (con --descargar o --alcaldias)")
    ap.add_argument("--alcaldias", action="store_true", help="descarga los portales de las alcaldías (usa el Chrome instalado; ~6 min)")
    a = ap.parse_args()
    notas = []

    if a.descargar:
        print("Descargando OpenStreetMap…")
        osm_datos, origen_osm = osm.descargar(a.refrescar), "descarga nueva"
        print("Descargando datos.gov.co…")
        datos_gov.descargar_rnt(a.refrescar), datos_gov.descargar_salud(a.refrescar), datos_gov.descargar_cajeros(a.refrescar)
    else:
        osm_datos, origen_osm = _osm_desde_cache()
    abiertos = datos_gov.cargar_en_cache()
    if a.alcaldias:
        print("Descargando portales de las alcaldías (Chrome)…")
    alc = alcaldias.descargar(a.refrescar) if a.alcaldias else alcaldias.cargar_en_cache()
    alc_stats = escribir_alcaldias(alc)
    manual_c, errores_manual = manual.leer()

    candidatos = [dict(l, municipio=slug, fuentes=["OpenStreetMap"], rnt=None, anonimo=False, contacto={}, extra={}, vereda="", precision="exacta")
                  for slug, v in osm_datos.items() for l in v["lugares"]]
    candidatos += abiertos["rnt"] + abiertos["salud"] + abiertos["cajeros"] + manual_c
    for nombre in ("rnt", "salud", "cajeros"):
        if not abiertos[nombre]:
            notas.append(f"Fuente **{nombre}** no cargada (sin datos en caché; se obtiene con `--descargar`).")

    # Contexto de cada municipio para ubicar direcciones: veredas (OSM), límites y centro (la alcaldía).
    contexto = {}
    for m in MUNICIPIOS:
        v = osm_datos[m["slug"]]
        pts = [(l["lat"], l["lon"]) for l in v["lugares"]]
        alc = next((l for l in v["lugares"] if l["categoria"] == "servicio" and l["subtipo"] == "townhall"), None)
        cab = next((x for x in v.get("sitios", []) if x["tipo"] in ("town", "village") and norm(x["nombre"]) == norm(m["nombre"])), None)
        centro = [alc["lat"], alc["lon"]] if alc else [cab["lat"], cab["lon"]] if cab else ([sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)] if pts else None)
        limites = v.get("limites") or ([min(p[0] for p in pts) - .03, min(p[1] for p in pts) - .03, max(p[0] for p in pts) + .03, max(p[1] for p in pts) + .03] if pts else None)
        contexto[m["slug"]] = {"sitios": v.get("sitios", []), "limites": limites, "centro": centro}
    pendientes = [c for c in candidatos if c["lat"] is None]
    geo = geocodificar.aplicar(pendientes, contexto, red=a.descargar) if pendientes else {}
    if pendientes:
        print(f"Ubicación de {len(pendientes)} lugares sin coordenadas: " + ", ".join(f"{k} {v}" for k, v in geo.items() if v))

    lugares = normalizar(candidatos)
    pub = [publico(l) for l in lugares]

    # Centro de cada municipio: la alcaldía si está en OSM; si no, el promedio de sus puntos.
    municipios = []
    for m in MUNICIPIOS:
        pts = [l for l in lugares if l["municipio"] == m["slug"] and l["lat"] is not None]
        alc = next((l for l in pts if l["categoria"] == "servicio" and l["subtipo"] == "townhall"), None)
        if pts:
            centro = [alc["lat"], alc["lon"]] if alc else [sum(p["lat"] for p in pts) / len(pts), sum(p["lon"] for p in pts) / len(pts)]
            lats, lons = [p["lat"] for p in pts], [p["lon"] for p in pts]
            caja = [min(lats) - .01, min(lons) - .01, max(lats) + .01, max(lons) + .01]
        else:
            centro, caja = None, None
        municipios.append({"slug": m["slug"], "nombre": m["nombre"], "centro": [round(centro[0], 6), round(centro[1], 6)] if centro else None,
                           "caja": [round(x, 5) for x in caja] if caja else None})

    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps({"generado": date.today().isoformat(), "atribucion": "© Colaboradores de OpenStreetMap (ODbL); datos.gov.co",
                                    "municipios": municipios, "lugares": pub}, ensure_ascii=False, indent=1), encoding="utf-8")

    SALIDA.mkdir(exist_ok=True)
    cols = ["id", "nombre", "categoria", "subtipo", "municipio", "lat", "lon", "precision", "direccion", "vereda", "plan", "fuentes", "rnt",
            "tel_privado", "correo_privado", "razon_social_privada"]
    with open(SALIDA / "lugares_completo.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for l in lugares:
            ct = l["contacto"]
            w.writerow({"id": l["id"], "nombre": l["nombre"], "categoria": l["categoria"], "subtipo": l["subtipo"], "municipio": l["municipio"],
                        "lat": l["lat"], "lon": l["lon"], "precision": l["precision"], "direccion": l["direccion"], "vereda": l["vereda"],
                        "plan": l["plan"], "fuentes": "; ".join(l["fuentes"]), "rnt": l["rnt"],
                        "tel_privado": " / ".join(x for x in (ct.get("telefono"), ct.get("celular")) if x), "correo_privado": ct.get("correo", ""),
                        "razon_social_privada": ct.get("razon_social", "")})

    reporte(pub, municipios, origen_osm, notas, errores_manual, abiertos["descartados"], geo, alc_stats)
    print(f"{len(pub)} lugares → {APP_JSON.relative_to(APP_JSON.parents[2])}")
    print(f"Reporte: {SALIDA / 'reporte.md'}")


def reporte(pub, municipios, origen_osm, notas, errores_manual, descartados, geo=None, alc_stats=None):
    nombre = {m["slug"]: m["nombre"] for m in municipios}
    cats = list(CATEGORIAS)
    L = [f"# Reporte del scraper ({date.today().isoformat()})", "", f"- OpenStreetMap: **{origen_osm}**", f"- Lugares: **{len(pub)}**", ""]
    L += ["## Por municipio y categoría", "", "| Municipio | Total | " + " | ".join(CATEGORIAS[c]["etiqueta"] for c in cats) + " |", "|---|---|" + "---|" * len(cats)]
    for m in municipios:
        fila = [l for l in pub if l["municipio"] == m["slug"]]
        cnt = Counter(l["categoria"] for l in fila)
        L.append(f"| {m['nombre']} | {len(fila)} | " + " | ".join(str(cnt.get(c, 0)) for c in cats) + " |")
    L += ["", "## Ubicación en el mapa", ""]
    pr = Counter(l["precision"] or "sin ubicación" for l in pub)
    for k, v in pr.most_common():
        L.append(f"- {k}: {v}" + ("  *(no se dibuja en el mapa; aparece en la lista)*" if k == "sin ubicación" else ""))
    if geo:
        L += ["", "### Cómo se ubicaron los que venían sin coordenadas", ""]
        etiqueta = {"vereda": "por nombre de vereda (centro de la vereda)", "direccion": "por dirección de calle (Nominatim)", "nombre": "por nombre del negocio (Nominatim)",
                    "cabecera": "zona urbana (la alcaldía)", "sin ubicación": "**sin ubicación** (quedan en la lista, no en el mapa)", "consultas": "consultas nuevas a Nominatim"}
        L += [f"- {etiqueta[k]}: {v}" for k, v in geo.items()]
        sin = [l for l in pub if l["precision"] is None]
        if sin:
            L += ["", "Sin ubicación: " + "; ".join(f"{l['nombre']} ({nombre[l['municipio']]})" for l in sin)]
    L += ["", "## Fuentes", ""] + [f"- {k}: {v}" for k, v in Counter(f for l in pub for f in l["fuentes"]).most_common()]
    L += ["", "## Para los planes", ""]
    for plan in ("aventura", "gastro", "cultura"):
        cnt = Counter(nombre[l["municipio"]] for l in pub if l["plan"] == plan and l["lat"] is not None)
        L.append(f"- **{plan}**: {sum(cnt.values())} paradas con ubicación (" + ", ".join(f"{k} {v}" for k, v in sorted(cnt.items())) + ")")
    flojos = [nombre[m["slug"]] for m in municipios if sum(1 for l in pub if l["municipio"] == m["slug"] and l["plan"]) < 3]
    if flojos:
        L.append(f"- ⚠️ Con menos de 3 paradas de plan: **{', '.join(flojos)}**. Completar en `datos/lugares_manual.csv`.")
    pub_priv = [l for l in pub if l["conRegistro"] and not any(x in l["nombre"].lower() for x in ("vivienda", "finca", "guía", "cabaña", "casa"))]
    if pub_priv:
        L += ["", "## Nombres de prestadores publicados (revisar que no sean personas)", ""] + [f"- {l['nombre']} ({nombre[l['municipio']]})" for l in pub_priv]
    if alc_stats:
        L += ["", "## Alcaldías (material para revisar)", "",
              f"- {alc_stats['paginas']} páginas de {alc_stats['municipios']} portales → **{alc_stats['frases']} frases** que nombran sitios: " + ", ".join(f"{k} {v}" for k, v in sorted(alc_stats["por_municipio"].items())),
              "- Revísalas en `salida/candidatos_alcaldias.csv`; el contexto por municipio está en `salida/alcaldias_resumen.md`.",
              "- Tenza publica una **guía turística en PDF** (6 MB): https://www.tenza-boyaca.gov.co/turismo/guia-turistica — no se descargó; conviene leerla a mano."]
    if descartados:
        L += ["", "## Categorías del RNT que no usamos", ""] + [f"- {k}: {v}" for k, v in descartados.items()]
    if errores_manual:
        L += ["", "## Errores en datos/lugares_manual.csv", ""] + [f"- {e}" for e in errores_manual]
    if notas:
        L += ["", "## Notas", ""] + [f"- {n}" for n in notas]
    (SALIDA / "reporte.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
