"""Utilidades comunes: rutas, caché en disco, límite de velocidad, texto y distancias."""
import hashlib
import json
import math
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "cache"
SALIDA = RAIZ / "salida"
DATOS = RAIZ / "datos"
APP_JSON = RAIZ.parent / "src" / "data" / "lugares.json"

# Identifica el proyecto ante los servicios gratuitos que consultamos (política de OSM/Nominatim).
USER_AGENT = "ValleDirecto-Capstone/0.1 (proyecto universitario; https://github.com/ManuelCrzUR/valle-de-Tenza)"
HEADERS = {"User-Agent": USER_AGENT}

_ultimo: dict[str, float] = {}


def esperar(url: str, segundos: float = 1.0) -> None:
    """Máximo una petición cada `segundos` por servidor."""
    host = urlparse(url).netloc
    falta = segundos - (time.monotonic() - _ultimo.get(host, 0))
    if falta > 0:
        time.sleep(falta)
    _ultimo[host] = time.monotonic()


def con_cache(clave: str, fn, refrescar: bool = False):
    """Devuelve el JSON guardado en cache/ o lo calcula con fn() y lo guarda."""
    CACHE.mkdir(exist_ok=True)
    archivo = CACHE / f"{slug(clave)[:80]}-{hashlib.md5(clave.encode()).hexdigest()[:8]}.json"
    if archivo.exists() and not refrescar:
        return json.loads(archivo.read_text(encoding="utf-8"))
    valor = fn()
    archivo.write_text(json.dumps(valor, ensure_ascii=False), encoding="utf-8")
    return valor


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def norm(s: str) -> str:
    """Minúsculas, sin acentos ni signos: para comparar nombres."""
    return re.sub(r"[^a-z0-9 ]+", " ", sin_acentos(s).lower()).strip()


def slug(s: str) -> str:
    return re.sub(r"\s+", "-", norm(s)) or "x"


def titulo(s: str) -> str:
    """'HOTEL ROCA CENTER' -> 'Hotel Roca Center' (deja en minúscula las partículas)."""
    chica = {"de", "del", "la", "las", "el", "los", "y", "e", "en", "a"}
    palabras = re.sub(r"\s+", " ", (s or "").strip()).lower().split(" ")
    return " ".join(p if (i and p in chica) else p.capitalize() for i, p in enumerate(palabras))


def metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia haversine en metros entre (lat, lon) y (lat, lon)."""
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))
