"""Une las fuentes en un esquema único: categoría, plan, id estable, duplicados y salida pública sin datos personales."""
import hashlib
from difflib import SequenceMatcher

from categorias import CATEGORIAS
from util import metros, norm, slug

PRECISIONES = ("exacta", "direccion", "vereda", "cabecera")  # las que se dibujan en el mapa
_SIN_PLAN = {"sports_centre", "swimming_pool", "playground"}   # recreación local: no es parada de plan
_COMIDA_LOCAL = {"bakery", "greengrocer", "butcher", "farm"}
_GENERICAS = {"de", "del", "la", "el", "los", "las", "y", "cajero", "automatico", "colombia", "servicio", "servicios", "estacion"}
_NOMBRE_POR_DEFECTO = {"cajero automático": "Cajero automático", "estación de servicio": "Estación de servicio",
                       "hospital": "Hospital", "clinic": "Centro de salud", "pharmacy": "Droguería"}


def _tokens(nombre: str) -> frozenset:
    return frozenset(t for t in norm(nombre).split() if t not in _GENERICAS)


def _parecidos(a: dict, b: dict) -> bool:
    """¿Son el mismo lugar? Mismo municipio y categoría, nombre parecido y (cerca o sin coordenadas)."""
    if a["municipio"] != b["municipio"] or a["categoria"] != b["categoria"]:
        return False
    ta, tb = _tokens(a["nombre"]), _tokens(b["nombre"])
    corto, largo = sorted((ta, tb), key=len)
    mismo = SequenceMatcher(None, norm(a["nombre"]), norm(b["nombre"])).ratio() >= 0.85 or (len(corto) >= 2 and corto <= largo)
    if not mismo:
        return False
    if a["lat"] is not None and b["lat"] is not None:
        return metros((a["lat"], a["lon"]), (b["lat"], b["lon"])) < 75
    return bool(ta) and bool(tb)


def _fusionar(base: dict, otro: dict) -> dict:
    """Conserva el que tiene coordenadas y suma fuentes, RNT y datos extra."""
    a, b = (base, otro) if base["lat"] is not None or otro["lat"] is None else (otro, base)
    a["fuentes"] = sorted(set(a["fuentes"]) | set(b["fuentes"]))
    a["rnt"] = a["rnt"] or b["rnt"]
    a["direccion"] = a["direccion"] or b["direccion"]
    a["extra"] = {**b["extra"], **a["extra"]}
    a["contacto"] = {**b["contacto"], **a["contacto"]}
    a["anonimo"] = a["anonimo"] and b["anonimo"]
    return a


def normalizar(candidatos: list[dict]) -> list[dict]:
    lugares: list[dict] = []
    for c in candidatos:
        c = dict(c)
        c["nombre"] = c["nombre"] or _NOMBRE_POR_DEFECTO.get(c["subtipo"], "")
        if not c["nombre"] or c["categoria"] not in CATEGORIAS:
            continue
        if c["lat"] is not None and not c["precision"]:
            c["precision"] = "exacta"
        for i, previo in enumerate(lugares):
            if _parecidos(previo, c):
                lugares[i] = _fusionar(previo, c)
                break
        else:
            lugares.append(c)
    for c in lugares:
        cfg = CATEGORIAS[c["categoria"]]
        plan = cfg["plan"]
        if c["subtipo"] in _SIN_PLAN:
            plan = None
        elif c["categoria"] == "comercio" and c["subtipo"] in _COMIDA_LOCAL:
            plan = "gastro"
        c["plan"], c["esServicio"] = plan, cfg["servicio"]
        semilla = c.get("osm") or c["rnt"] or f"{c['nombre']}|{c['direccion']}"
        c["id"] = f"{c['municipio']}-{c['categoria']}-{slug(c['nombre'])[:36]}-{hashlib.md5(str(semilla).encode()).hexdigest()[:5]}"
    lugares.sort(key=lambda c: (c["municipio"], c["categoria"], norm(c["nombre"])))
    return lugares


def publico(c: dict) -> dict:
    """Lo único que viaja al sitio: sin teléfonos, correos ni razón social de personas."""
    extra = dict(c["extra"])
    web = (c.get("tags") or {}).get("website")
    horario = (c.get("tags") or {}).get("opening_hours")
    if web:
        extra["web"] = web
    if horario:
        extra["horario"] = horario
    sal = {"id": c["id"], "nombre": c["nombre"], "categoria": c["categoria"], "subtipo": c["subtipo"], "municipio": c["municipio"],
           "lat": round(c["lat"], 6) if c["lat"] is not None else None, "lon": round(c["lon"], 6) if c["lon"] is not None else None,
           "precision": c["precision"], "direccion": c["direccion"], "plan": c["plan"], "esServicio": c["esServicio"],
           "conRegistro": "RNT" in c["fuentes"], "fuentes": c["fuentes"]}
    if c["vereda"]:
        sal["vereda"] = c["vereda"]
    if extra:
        sal["extra"] = extra
    return sal
