"""Los 7 municipios. `dane` es el código DANE (lo usa RNT); `osm` es el nombre exacto en OpenStreetMap."""
MUNICIPIOS = [
    {"slug": "guayata", "nombre": "Guayatá", "dane": "15325", "osm": "Guayatá", "sitio": "https://www.guayata-boyaca.gov.co/"},
    {"slug": "somondoco", "nombre": "Somondoco", "dane": "15761", "osm": "Somondoco", "sitio": "https://www.somondoco-boyaca.gov.co/"},
    {"slug": "tenza", "nombre": "Tenza", "dane": "15798", "osm": "Tenza", "sitio": "https://www.tenza-boyaca.gov.co/"},
    {"slug": "sutatenza", "nombre": "Sutatenza", "dane": "15778", "osm": "Sutatenza", "sitio": "https://www.sutatenza-boyaca.gov.co/"},
    {"slug": "almeida", "nombre": "Almeida", "dane": "15022", "osm": "Almeida", "sitio": "https://www.almeida-boyaca.gov.co/"},
    {"slug": "chivor", "nombre": "Chivor", "dane": "15236", "osm": "Chivor", "sitio": "https://www.chivor-boyaca.gov.co/"},
    {"slug": "la-capilla", "nombre": "La Capilla", "dane": "15380", "osm": "La Capilla", "sitio": "https://www.lacapilla-boyaca.gov.co/"},
]
POR_SLUG = {m["slug"]: m for m in MUNICIPIOS}
POR_DANE = {m["dane"]: m for m in MUNICIPIOS}


def buscar(nombre: str):
    """Municipio a partir de un nombre con o sin acentos/mayúsculas ('GUAYATA', 'Guayatá')."""
    from util import norm
    n = norm(nombre)
    return next((m for m in MUNICIPIOS if norm(m["nombre"]) == n), None)
