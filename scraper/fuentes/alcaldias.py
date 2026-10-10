"""Portales de las alcaldías (plataforma gov.co 'Territoriales', hecha en Angular).

El contenido llega por JavaScript, así que se renderiza con el Chrome instalado (DynamicSession, sin descargar navegador).
Estos portales son administrativos: 'turismo' son noticias y 'municipio' es historia y datos generales. NO son listas de lugares,
así que el resultado es material para REVISAR (contexto para el chatbot y frases que mencionan sitios), no datos para el mapa.

`descargar` usa la RED. `quitar_repetido`, `frases_de_lugares` y `permitido` son puras (se prueban en probar.py).
"""
import json
import re
import sys
from pathlib import Path
from urllib.robotparser import RobotFileParser

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from municipios import MUNICIPIOS
from util import HEADERS, USER_AGENT, con_cache, esperar, norm

TEMAS = ("/tema/turismo", "/tema/municipio")          # secciones con contenido sobre el lugar
MAX_ARTICULOS = 6                                      # por sección y municipio (cortesía con el servidor)
CLAVES = {  # palabra -> tipo sugerido, para ordenar lo que una persona revisa
    "cascada": "naturaleza", "mirador": "atraccion", "laguna": "naturaleza", "embalse": "atraccion", "represa": "atraccion", "quebrada": "naturaleza",
    "cerro": "naturaleza", "sendero": "naturaleza", "parque": "naturaleza", "iglesia": "monumento", "templo": "monumento", "capilla": "monumento",
    "monumento": "monumento", "museo": "monumento", "plaza": "monumento", "casa de la cultura": "monumento", "hacienda": "atraccion", "finca": "atraccion",
    "festival": "evento", "feria": "evento", "fiestas": "evento", "esmeralda": "atraccion", "restaurante": "restaurante", "hotel": "alojamiento",
}


def permitido(robots_txt: str, ruta: str) -> bool:
    """¿Nos deja robots.txt entrar a `ruta`? Un robots vacío, o una página HTML en su lugar, se toma como 'todo permitido'."""
    t = (robots_txt or "").strip()
    if not t or t.lower().startswith(("<!doctype", "<html")):
        return True
    rp = RobotFileParser()
    rp.parse(t.splitlines())
    return rp.can_fetch(USER_AGENT, ruta)


def quitar_repetido(paginas: list[list[str]], minimo: int = 3) -> list[list[str]]:
    """Quita las líneas que se repiten en `minimo` páginas o más (menús, pie de página, 'Saltar a contenido')."""
    cuenta: dict[str, int] = {}
    for lineas in paginas:
        for l in set(lineas):
            cuenta[l] = cuenta.get(l, 0) + 1
    return [[l for l in lineas if cuenta[l] < minimo] for lineas in paginas]


def frases_de_lugares(texto: str) -> list[dict]:
    """Frases que nombran un sitio o evento (cascada, iglesia, festival…) y traen algún nombre propio. Para revisión humana."""
    salida = []
    for frase in re.split(r"(?<=[.!?])\s+|\n+", texto or ""):
        frase = re.sub(r"\s+", " ", frase).strip()
        if not 25 <= len(frase) <= 400:
            continue
        n = norm(frase)
        clave = next((k for k in CLAVES if re.search(rf"\b{k}s?\b", n)), None)
        propios = re.findall(r"(?<![.¿¡]\s)(?<!^)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+(?:de|del|la|las|los|el)?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*", frase)
        if clave and propios:
            salida.append({"tipo": CLAVES[clave], "clave": clave, "frase": frase})
    return salida


def _lineas(pagina) -> list[str]:
    return [re.sub(r"\s+", " ", x).strip() for x in re.split(r"\n+", pagina.get_all_text() or "") if x.strip()]


def descargar(refrescar: bool = False) -> dict:
    """RED + Chrome. Por municipio: páginas de las secciones y sus artículos, ya sin menús repetidos."""
    from scrapling.fetchers import DynamicSession
    salida = {}
    with DynamicSession(headless=True, real_chrome=True, network_idle=True, timeout=45000) as sesion:
        for m in MUNICIPIOS:
            base = m["sitio"].rstrip("/")
            print(f"  Alcaldía · {m['nombre']}…", flush=True)

            def traer(m=m, base=base):
                esperar(base, 1.0)
                robots = ""
                try:
                    from scrapling.fetchers import Fetcher
                    robots = (Fetcher.get(base + "/robots.txt", headers=HEADERS, timeout=20, stealthy_headers=False).body or b"").decode("utf-8", "ignore")
                except Exception:
                    pass
                paginas = []
                for tema in TEMAS:
                    if not permitido(robots, tema):
                        continue
                    esperar(base, 1.0)
                    p = sesion.fetch(base + tema)
                    if p.status != 200:
                        continue
                    paginas.append({"url": base + tema, "tipo": "seccion", "lineas": _lineas(p)})
                    rutas = sorted({a.attrib.get("href", "").split("?")[0] for a in p.css("a")
                                    if re.match(rf"^(https?://[^/]*)?/{tema.split('/')[-1]}/[\w-]+", a.attrib.get("href", ""))})
                    for ruta in [r.replace(base, "") for r in rutas][:MAX_ARTICULOS]:
                        if not permitido(robots, ruta):
                            continue
                        esperar(base, 1.0)
                        art = sesion.fetch(base + ruta)
                        if art.status == 200:
                            titulo = next((x.text.strip() for x in art.css("h2") if x.text and x.text.strip()), "")
                            paginas.append({"url": base + ruta, "tipo": "articulo", "titulo": titulo, "lineas": _lineas(art)})
                limpias = quitar_repetido([p["lineas"] for p in paginas])
                for p, l in zip(paginas, limpias):
                    p["lineas"] = l
                return paginas

            salida[m["slug"]] = con_cache(f"alcaldia-{m['slug']}", traer, refrescar)
    return salida


def cargar_en_cache() -> dict:
    """SIN RED: lo que ya se descargó de las alcaldías, o {}."""
    from util import CACHE
    return {m["slug"]: json.loads(a[0].read_text(encoding="utf-8")) for m in MUNICIPIOS if (a := sorted(CACHE.glob(f"alcaldia-{m['slug']}-*.json")))}
