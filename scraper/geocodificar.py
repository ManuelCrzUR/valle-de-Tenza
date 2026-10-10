"""Ubica en el mapa lo que solo trae dirección (RNT, salud, cajeros, manual).

Cascada, de más a menos precisa; si ninguna aplica el lugar queda SIN ubicación (no se inventa):
  1. vereda      nombre de la vereda -> punto 'place' de OpenStreetMap con ese nombre   (precision 'vereda')
  2. direccion   calle y número -> Nominatim, solo si cae dentro del municipio          (precision 'direccion')
  3. nombre      el nombre del negocio -> Nominatim, solo si es un lugar con nombre parecido (precision 'direccion')
  4. cabecera    dirección urbana sin más datos -> la alcaldía del municipio             (precision 'cabecera')

Nominatim (OpenStreetMap): máximo 1 petición por segundo, User-Agent propio y todo se guarda en cache/.
Las funciones puras (sin red) se prueban en probar.py.
"""
import json
import re
import sys
import urllib.parse
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from municipios import POR_SLUG
from util import HEADERS, con_cache, esperar, norm

NOMINATIM = "https://nominatim.openstreetmap.org/search"
consultas_a_la_red = 0   # cuántas peticiones reales a Nominatim se hicieron (las de caché no cuentan)
_TIPOS_VEREDA = {"locality", "hamlet", "neighbourhood", "isolated_dwelling", "village"}
_RURAL = re.compile(r"\b(km|kil[oó]metro|finca|vereda|v[ií]a|sector|lote|hacienda|predio|parcela|carretera|corregimiento|rural)\b", re.I)
_CALLE = re.compile(r"\b(calle|cl|carrera|cra|cr|kr|kra|avenida|av|diagonal|dg|transversal|tv|circular)\b", re.I)
_ABREV = [(r"\b(cl|cll)\b\.?", "Calle"), (r"\b(kr|kra|cra|cr)\b\.?", "Carrera"), (r"\bav\b\.?", "Avenida"), (r"\bdg\b\.?", "Diagonal"),
          (r"\btv\b\.?", "Transversal"), (r"\b(no|nro|n°|num)\b\.?", ""), (r"\besq\b\.?", "esquina"), (r"#", " ")]


def normalizar_direccion(d: str) -> str:
    """'Cl 7 Kr 4 Esq' -> 'Calle 7 Carrera 4 esquina' (Nominatim entiende mejor las palabras completas)."""
    d = d or ""
    for patron, rep in _ABREV:
        d = re.sub(patron, rep, d, flags=re.I)
    return re.sub(r"\s+", " ", d).strip(" ,-")


def es_calle(direccion: str) -> bool:
    """¿Parece una dirección de calle (nomenclatura urbana con número)?"""
    return bool(_CALLE.search(direccion or "")) and bool(re.search(r"\d", direccion or "")) and not _RURAL.search(direccion or "")


def es_urbana(direccion: str) -> bool:
    """Sin pistas de zona rural: calle con número, o solo un barrio/'Centro'."""
    d = direccion or ""
    return bool(d.strip()) and not _RURAL.search(d)


def dentro(caja, lat: float, lon: float, margen: float = 0.0) -> bool:
    """¿Cae dentro de la caja [minlat, minlon, maxlat, maxlon] del municipio (con margen en grados)?"""
    return bool(caja) and caja[0] - margen <= lat <= caja[2] + margen and caja[1] - margen <= lon <= caja[3] + margen


def buscar_vereda(nombre: str, sitios: list[dict]):
    """Punto 'place' de OSM para el nombre de una vereda, o None. Exige coincidencia clara y sin ambigüedad."""
    n = norm(nombre)
    if not n:
        return None
    cand = [s for s in sitios if s["tipo"] in _TIPOS_VEREDA]
    exactos = [s for s in cand if norm(s["nombre"]) == n]
    if len(exactos) >= 1:
        return exactos[0]
    parecidos = [s for s in cand if SequenceMatcher(None, norm(s["nombre"]), n).ratio() >= 0.88]
    if len(parecidos) == 1:
        return parecidos[0]
    # El nombre de OSM contiene al de la vereda (o al revés) y solo hay uno: 'Tablón' ~ 'El Tablón'
    contenidos = [s for s in cand if len(n) >= 5 and (f" {n} " in f" {norm(s['nombre'])} " or f" {norm(s['nombre'])} " in f" {n} ")]
    return contenidos[0] if len(contenidos) == 1 else None


def _buscar(q: str, caja, refrescar=False) -> list[dict]:
    """RED (con caché): Nominatim limitado al municipio."""
    from scrapling.fetchers import Fetcher
    params = _params(q, caja)

    def pedir():
        global consultas_a_la_red
        consultas_a_la_red += 1
        esperar(NOMINATIM, 1.1)
        r = Fetcher.get(NOMINATIM, params=params, headers=HEADERS, timeout=40, retries=2, stealthy_headers=False)
        if r.status != 200:
            raise RuntimeError(f"Nominatim HTTP {r.status}")
        return json.loads(r.body)
    return con_cache("nominatim|" + urllib.parse.urlencode(params), pedir, refrescar)


def _params(q: str, caja) -> dict:
    params = {"q": q, "format": "jsonv2", "limit": "3", "countrycodes": "co", "addressdetails": "0"}
    if caja:
        params.update({"viewbox": f"{caja[1]},{caja[2]},{caja[3]},{caja[0]}", "bounded": "1"})
    return params


def _en_cache(q: str, caja) -> bool:
    from util import CACHE, slug
    import hashlib
    clave = "nominatim|" + urllib.parse.urlencode(_params(q, caja))
    return (CACHE / f"{slug(clave)[:80]}-{hashlib.md5(clave.encode()).hexdigest()[:8]}.json").exists()


def elegir_resultado(resultados: list[dict], caja, nombre: str = "") -> dict | None:
    """Primer resultado dentro del municipio. Con `nombre`, exige que sea un lugar con nombre parecido."""
    for r in resultados or []:
        lat, lon = float(r["lat"]), float(r["lon"])
        if not dentro(caja, lat, lon, 0.002):
            continue
        if nombre:
            nombre_osm = (r.get("name") or r.get("display_name", "").split(",")[0]).strip()
            if r.get("category") not in ("tourism", "amenity", "shop", "leisure", "historic", "building", "office") or \
               SequenceMatcher(None, norm(nombre_osm), norm(nombre)).ratio() < 0.8:
                continue
        return {"lat": lat, "lon": lon, "tipo": r.get("type")}
    return None


def aplicar(cands: list[dict], contexto: dict, red: bool = False) -> dict:
    """Ubica los candidatos sin coordenadas (los modifica). `contexto[slug]` = {sitios, limites, centro}.
    Con red=False solo usa lo que no necesita Nominatim (veredas, cabecera) y lo que ya esté en caché."""
    stats = {"vereda": 0, "direccion": 0, "nombre": 0, "cabecera": 0, "sin ubicación": 0, "consultas": 0}

    def consultar(q, caja, nombre=""):
        try:
            if not red and not _en_cache(q, caja):
                return None          # sin red solo se usa lo que ya está en caché
            return elegir_resultado(_buscar(q, caja), caja, nombre)
        except Exception as e:       # red caída, límite de uso…
            print(f"    Nominatim falló para «{q[:50]}»: {str(e)[:80]}")
            return None

    for c in cands:
        if c["lat"] is not None:
            continue
        ctx = contexto.get(c["municipio"], {})
        caja, mun = ctx.get("limites"), POR_SLUG[c["municipio"]]["nombre"]
        dir_privada = (c.get("contacto") or {}).get("direccion_completa") or c["direccion"]
        punto, precision, via = None, None, None

        if c["vereda"]:
            v = buscar_vereda(c["vereda"], ctx.get("sitios", []))
            if v:
                punto, precision, via = v, "vereda", "vereda"
        if not punto and es_calle(c["direccion"]):
            punto = consultar(f"{normalizar_direccion(c['direccion'])}, {mun}, Boyacá", caja)
            precision, via = ("direccion", "direccion") if punto else (None, None)
        if not punto and not c["anonimo"] and c["nombre"] and not c["vereda"]:
            punto = consultar(f"{c['nombre']}, {mun}, Boyacá", caja, nombre=c["nombre"])
            precision, via = ("direccion", "nombre") if punto else (None, None)
        if not punto and not c["vereda"] and (es_urbana(c["direccion"]) or not c["direccion"]) and ctx.get("centro") and \
                not _RURAL.search(dir_privada or ""):
            punto, precision, via = {"lat": ctx["centro"][0], "lon": ctx["centro"][1]}, "cabecera", "cabecera"

        if punto:
            c["lat"], c["lon"], c["precision"] = punto["lat"], punto["lon"], precision
            stats[via] += 1
        else:
            stats["sin ubicación"] += 1
    stats["consultas"] = consultas_a_la_red
    return stats
