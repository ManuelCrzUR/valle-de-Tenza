"""OpenStreetMap vía Overpass: lugares con coordenadas dentro de cada municipio."""
import json
import sys
import time
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scrapling.fetchers import Fetcher

from categorias import categoria_osm
from municipios import MUNICIPIOS, buscar
from util import HEADERS, con_cache, esperar

# El servidor principal suele dar 406/504; se prueba con espejos en orden.
ESPEJOS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
RONDAS = 3  # vueltas completas por los espejos, con espera creciente entre una y otra

CONSULTA = """
[out:json][timeout:90];
area["name"="Boyacá"]["admin_level"="4"]->.b;
rel(area.b)["boundary"="administrative"]["admin_level"="6"]["name"="{nombre}"]->.m;
.m out bb;
.m map_to_area->.a;
(
  nwr(area.a)["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|atm|bank|fuel|hospital|clinic|doctors|pharmacy|place_of_worship|marketplace|townhall|police|library|bus_station|post_office)$"];
  nwr(area.a)["shop"~"^(supermarket|convenience|general|bakery|greengrocer|butcher|farm)$"];
  nwr(area.a)["tourism"];
  nwr(area.a)["historic"];
  nwr(area.a)["leisure"~"^(park|garden|nature_reserve|sports_centre|swimming_pool|playground)$"];
  nwr(area.a)["natural"~"^(peak|waterfall|cave_entrance|spring|hot_spring)$"];
  nwr(area.a)["waterway"="waterfall"];
  way(area.a)["highway"~"^(path|footway|track)$"]["name"];
  nwr(area.a)["place"~"^(town|village|hamlet|locality|neighbourhood|isolated_dwelling)$"]["name"];
);
out tags center;
"""


def _consultar(nombre: str) -> dict:
    q = CONSULTA.replace("{nombre}", nombre)
    errores = []
    for ronda in range(RONDAS):
        for url in ESPEJOS:
            esperar(url, 2)
            try:
                r = Fetcher.post(url, data={"data": q}, headers=HEADERS, timeout=120, retries=1, stealthy_headers=False)
                if r.status == 200:
                    return json.loads(r.body)
                errores.append(f"{url} → {r.status}")
            except Exception as e:  # red caída, tiempo agotado…
                errores.append(f"{url} → {e}")
        if ronda < RONDAS - 1:
            espera = 30 * (ronda + 1)
            print(f"    servidores ocupados, reintento en {espera}s…", flush=True)
            time.sleep(espera)
    raise RuntimeError("Overpass no respondió: " + "; ".join(errores[-3:]))


def _lugar(e: dict):
    """Elemento OSM -> lugar crudo, o None si no sirve (sin coordenadas, sin categoría o sin nombre)."""
    t = e.get("tags", {})
    c = e.get("center") or {}
    lat = e["lat"] if e.get("lat") is not None else c.get("lat")
    lon = e["lon"] if e.get("lon") is not None else c.get("lon")
    cat = categoria_osm(t)
    # Sin nombre solo conservamos lo que un viajero busca por tipo: cajero, gasolinera, hospital, clínica, farmacia.
    util_sin_nombre = cat and (cat[0] in ("cajero", "gasolinera") or cat[1] in ("hospital", "clinic", "pharmacy"))
    if lat is None or lon is None or not cat or not (t.get("name") or util_sin_nombre):
        return None
    return {"osm": f"{e['type']}/{e['id']}", "nombre": t.get("name", ""), "categoria": cat[0], "subtipo": cat[1],
            "lat": lat, "lon": lon, "direccion": _direccion(t), "tags": {k: t[k] for k in ("operator", "brand", "website", "opening_hours") if k in t}}


def _direccion(t: dict) -> str:
    calle = " ".join(x for x in (t.get("addr:street"), t.get("addr:housenumber")) if x)
    return calle or t.get("addr:full", "")


def _interpretar(datos: dict) -> dict:
    """Respuesta de Overpass de UN municipio -> lugares, sitios (veredas, cabecera) y límites."""
    limites, lugares, sitios = None, [], []
    for e in datos.get("elements", []):
        t = e.get("tags", {})
        if e["type"] == "relation" and "bounds" in e and t.get("admin_level") == "6":
            b = e["bounds"]
            limites = [b["minlat"], b["minlon"], b["maxlat"], b["maxlon"]]
            continue
        if t.get("place") and t.get("name"):
            c = e.get("center") or {}
            lat = e["lat"] if e.get("lat") is not None else c.get("lat")
            lon = e["lon"] if e.get("lon") is not None else c.get("lon")
            if lat is not None and lon is not None:
                sitios.append({"nombre": t["name"], "tipo": t["place"], "lat": lat, "lon": lon})
        lugar = _lugar(e)
        if lugar:
            lugares.append(lugar)
    return {"lugares": lugares, "sitios": sitios, "limites": limites}


def descargar(refrescar: bool = False) -> dict:
    """RED. Por municipio: lugares crudos, sitios 'place' y límites. Guarda cada respuesta en cache/."""
    salida = {}
    for m in MUNICIPIOS:
        print(f"  OSM · {m['nombre']}…", flush=True)
        datos = con_cache(f"osm-{m['slug']}", lambda m=m: _consultar(m["osm"]), refrescar)
        salida[m["slug"]] = _interpretar(datos)
    return salida


def desde_volcado(ruta) -> dict:
    """SIN RED. Lee un volcado de Overpass con todos los municipios; cada elemento pertenece al
    municipio cuya relación administrativa aparece justo antes (así salió de la consulta con foreach)."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    salida = {m["slug"]: {"lugares": [], "sitios": [], "limites": None} for m in MUNICIPIOS}
    actual = None
    for e in datos.get("elements", []):
        t = e.get("tags", {})
        if e["type"] == "relation" and t.get("admin_level") == "6":
            m = buscar(t.get("name", ""))
            actual = m["slug"] if m else None
            continue
        lugar = _lugar(e) if actual else None
        if lugar:
            salida[actual]["lugares"].append(lugar)
    return salida


if __name__ == "__main__":
    d = desde_volcado(Path(__file__).resolve().parents[1] / "datos" / "osm_inicial.json")
    for slug, v in d.items():
        print(slug, "lugares:", len(v["lugares"]))
