"""Los 14 municipios del Valle de Tenza (Boyacá). `dane` es el código DANE (lo usa RNT); `osm` es el nombre exacto en OpenStreetMap."""
MUNICIPIOS = [
    {"slug": "guayata", "nombre": "Guayatá", "dane": "15325", "osm": "Guayatá", "sitio": "https://www.guayata-boyaca.gov.co/"},
    {"slug": "somondoco", "nombre": "Somondoco", "dane": "15761", "osm": "Somondoco", "sitio": "https://www.somondoco-boyaca.gov.co/"},
    {"slug": "tenza", "nombre": "Tenza", "dane": "15798", "osm": "Tenza", "sitio": "https://www.tenza-boyaca.gov.co/"},
    {"slug": "sutatenza", "nombre": "Sutatenza", "dane": "15778", "osm": "Sutatenza", "sitio": "https://www.sutatenza-boyaca.gov.co/"},
    {"slug": "almeida", "nombre": "Almeida", "dane": "15022", "osm": "Almeida", "sitio": "https://www.almeida-boyaca.gov.co/"},
    {"slug": "chivor", "nombre": "Chivor", "dane": "15236", "osm": "Chivor", "sitio": "https://www.chivor-boyaca.gov.co/"},
    {"slug": "la-capilla", "nombre": "La Capilla", "dane": "15380", "osm": "La Capilla", "sitio": "https://www.lacapilla-boyaca.gov.co/"},
    # Ampliación (Fase 4): Guateque y Garagoa primero (nodos de transporte y servicios).
    {"slug": "guateque", "nombre": "Guateque", "dane": "15322", "osm": "Guateque", "sitio": "https://www.guateque-boyaca.gov.co/"},
    {"slug": "garagoa", "nombre": "Garagoa", "dane": "15299", "osm": "Garagoa", "sitio": "https://www.garagoa-boyaca.gov.co/"},
    {"slug": "chinavita", "nombre": "Chinavita", "dane": "15172", "osm": "Chinavita", "sitio": "https://www.chinavita-boyaca.gov.co/"},
    {"slug": "macanal", "nombre": "Macanal", "dane": "15425", "osm": "Macanal", "sitio": "https://www.macanal-boyaca.gov.co/"},
    {"slug": "pachavita", "nombre": "Pachavita", "dane": "15511", "osm": "Pachavita", "sitio": "https://www.pachavita-boyaca.gov.co/"},  # 15518 es Pajarito
    {"slug": "santa-maria", "nombre": "Santa María", "dane": "15690", "osm": "Santa María", "sitio": "https://www.santamaria-boyaca.gov.co/"},
    {"slug": "san-luis-de-gaceno", "nombre": "San Luis de Gaceno", "dane": "15667", "osm": "San Luís de Gaceno", "sitio": "https://www.sanluisdegaceno-boyaca.gov.co/"},  # en OSM el nombre lleva tilde: «San Luís de Gaceno»
]
POR_SLUG = {m["slug"]: m for m in MUNICIPIOS}
POR_DANE = {m["dane"]: m for m in MUNICIPIOS}


def buscar(nombre: str):
    """Municipio a partir de un nombre con o sin acentos/mayúsculas ('GUAYATA', 'Guayatá')."""
    from util import norm
    n = norm(nombre)
    return next((m for m in MUNICIPIOS if norm(m["nombre"]) == n), None)
