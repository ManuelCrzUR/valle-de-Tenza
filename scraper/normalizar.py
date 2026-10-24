"""Une las fuentes en un esquema único: categoría, plan, id estable, duplicados y salida pública sin datos personales."""
import hashlib
import re
from difflib import SequenceMatcher

from categorias import CATEGORIAS
from util import metros, norm, slug

PRECISIONES = ("exacta", "direccion", "vereda", "cabecera")  # las que se dibujan en el mapa
_SIN_PLAN = {"sports_centre", "swimming_pool", "playground"}   # recreación local: no es parada de plan
_COMIDA_LOCAL = {"bakery", "greengrocer", "butcher", "farm"}
_GENERICAS = {"de", "del", "la", "el", "los", "las", "y", "cajero", "automatico", "colombia", "servicio", "servicios", "estacion"}
_NOMBRE_POR_DEFECTO = {"cajero automático": "Cajero automático", "estación de servicio": "Estación de servicio",
                       "hospital": "Hospital", "clinic": "Centro de salud", "pharmacy": "Droguería"}


# ---- Nombres: mayúsculas de título en español ---------------------------------------------------------
_PARTICULAS = {"de", "del", "la", "las", "el", "los", "y", "e", "en", "al", "con", "por", "para", "sin"}
_SIGLAS = {"atm", "eds", "ips", "ese", "eps", "sena", "cai", "umata", "jac", "rnt", "tv", "dj", "bbva", "gnv", "gnc", "ii", "iii", "iv", "vi", "vii"}
_TILDES = {"jardin": "jardín", "cafe": "café", "estacion": "estación", "panaderia": "panadería", "drogueria": "droguería", "hosteria": "hostería",
           "alcaldia": "alcaldía", "pension": "pensión", "pasteleria": "pastelería", "carniceria": "carnicería", "ferreteria": "ferretería",
           "cabana": "cabaña", "montana": "montaña", "comunion": "comunión", "belen": "belén", "maria": "maría", "jose": "josé", "tia": "tía"}
_PALABRA = re.compile(r"^([^\wÁÉÍÓÚÜÑáéíóúüñ]*)(.*?)([^\wÁÉÍÓÚÜÑáéíóúüñ]*)$", re.S)


def _palabra_es(p: str, inicio: bool) -> str:
    pre, nucleo, post = _PALABRA.match(p).groups()
    if not nucleo:
        return p
    # Palabras con mayúsculas internas ('McDonald', 'iFood') o con dígitos y letras ('4x4') se respetan.
    if re.search(r"[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]", nucleo) or (re.search(r"\d", nucleo) and re.search(r"[A-Za-z]", nucleo)):
        return p
    partes = []
    for sub in re.split(r"([-/'’])", nucleo):          # 'san-josé' / 'o'connor' se tratan por partes
        b = sub.lower()
        if sub in "-/'’" or not sub:
            partes.append(sub)
        elif b in _SIGLAS and sub.isupper():
            partes.append(sub)
        elif b in _PARTICULAS and not inicio:
            partes.append(b)
        else:
            b = _TILDES.get(b, b)
            partes.append(b[:1].upper() + b[1:])
        inicio = False
    return pre + "".join(partes) + post


def nombre_es(nombre: str) -> str:
    """'antiguo jardin' -> 'Antiguo Jardín'; 'PARQUE PRINCIPAL' -> 'Parque Principal'; 'Iglesia de la Villa' queda igual.
    Partículas (de, del, la, las, el, los, y, en…) en minúscula salvo al inicio; siglas cortas conocidas (ATM, EDS, IPS…) se respetan."""
    palabras = re.sub(r"\s+", " ", (nombre or "").strip()).split(" ")
    return " ".join(_palabra_es(p, i == 0) for i, p in enumerate(palabras)).strip()


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
        if a["precision"] != "exacta" or b["precision"] != "exacta":
            return True   # una posición aproximada (vereda, calle, cabecera) no sirve para medir distancia
        return metros((a["lat"], a["lon"]), (b["lat"], b["lon"])) < 75
    return bool(ta) and bool(tb)


def _fusionar(base: dict, otro: dict) -> dict:
    """Conserva el que tiene coordenadas y suma fuentes, RNT y datos extra."""
    # Se queda el de mejor ubicación: exacta > aproximada > sin ubicación.
    rango = {"exacta": 0, "direccion": 1, "vereda": 2, "cabecera": 3, None: 4}
    a, b = (base, otro) if rango[base["precision"]] <= rango[otro["precision"]] else (otro, base)
    a["fuentes"] = sorted(set(a["fuentes"]) | set(b["fuentes"]))
    a["rnt"] = a["rnt"] or b["rnt"]
    a["direccion"] = a["direccion"] or b["direccion"]
    a["extra"] = {**b["extra"], **a["extra"]}
    a["contacto"] = {**b["contacto"], **a["contacto"]}
    a["anonimo"] = a["anonimo"] and b["anonimo"]
    return a


def _info(c: dict) -> int:
    """Cuánta información trae un lugar (para elegir cuál conservar entre duplicados)."""
    return (3 * bool(c["rnt"]) + 2 * bool(c["direccion"]) + len(c["fuentes"]) + bool(c["vereda"]) + bool(c.get("tags")) + len(c["extra"]))


def descartar_duplicados(lugares: list[dict]) -> list[dict]:
    """Un solo registro por (municipio, nombre normalizado). Se conserva el de mejor ubicación y, a igualdad, el de más información,
    y se le suman fuentes, RNT y datos extra del descartado. No se tocan los nombres genéricos por defecto ('Cajero automático'),
    los anónimos del RNT, ni dos lugares con ubicación exacta a más de 1 km (mismo nombre, sitios distintos)."""
    rango = {"exacta": 0, "direccion": 1, "vereda": 2, "cabecera": 3, None: 4}
    genericos = {norm(n) for n in _NOMBRE_POR_DEFECTO.values()}
    vistos: dict[tuple, dict] = {}
    salida: list[dict] = []
    for c in lugares:
        clave = (c["municipio"], norm(c["nombre"]))
        previo = vistos.get(clave)
        if c["anonimo"] or clave[1] in genericos or not clave[1]:
            salida.append(c)
            continue
        if previo is None:
            vistos[clave] = c
            salida.append(c)
            continue
        if (previo["precision"] == "exacta" and c["precision"] == "exacta" and previo["lat"] is not None and c["lat"] is not None
                and metros((previo["lat"], previo["lon"]), (c["lat"], c["lon"])) > 1000):
            salida.append(c)
            continue
        mejor, otro = sorted((previo, c), key=lambda x: (rango[x["precision"]], -_info(x)))
        fusionado = _fusionar(mejor, otro)
        salida[salida.index(previo)] = fusionado
        vistos[clave] = fusionado
    return salida


def normalizar(candidatos: list[dict]) -> list[dict]:
    lugares: list[dict] = []
    for c in candidatos:
        c = dict(c)
        c["nombre"] = nombre_es(c["nombre"]) or _NOMBRE_POR_DEFECTO.get(c["subtipo"], "")
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
    lugares = descartar_duplicados(lugares)
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
