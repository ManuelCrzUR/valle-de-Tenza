"""Pruebas SIN RED. Las filas de ejemplo salen de respuestas reales de datos.gov.co.
    scraper/.venv/bin/python scraper/probar.py
"""
import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fuentes import datos_gov, manual
from normalizar import normalizar, publico

fallos = []


def ok(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond:
        fallos.append(msg)


# ---- RNT -------------------------------------------------------------------
RNT = [
    {"codigo_rnt": "56242", "cod_mun": "15325", "estado_rnt": "ACTIVO", "tipo_rnt": "ESTABLECIMIENTO", "tipo_prestador": "Comerciante",
     "razon_social_establecimiento": "HOTEL ROCA CENTER GUAYATA", "categoria": "ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO", "sub_categoria": "HOTEL",
     "direcci_n_comercial_establecimiento": "CARRERA  4  5 32", "n_m_tel_fono": "3204646081", "num_celular": "3208314297",
     "correo_establecimiento": "julio.roca_68@hotmail.com", "habitaciones": "32", "camas": "56"},
    {"codigo_rnt": "119378", "cod_mun": "15325", "estado_rnt": "ACTIVO", "tipo_rnt": "ESTABLECIMIENTO", "tipo_prestador": "Comerciante",
     "razon_social_establecimiento": "TERRITORIO GUAYATA", "categoria": "AGENCIAS DE VIAJES", "sub_categoria": "AGENCIA DE VIAJES OPERADORAS",
     "direcci_n_comercial_establecimiento": "CARRERA 6 10A 30 FINCA LA CAÑADA", "correo_establecimiento": "gerencia@territoriocolombia.com", "habitaciones": "0"},
    {"codigo_rnt": "154185", "cod_mun": "15022", "estado_rnt": "ACTIVO", "tipo_rnt": "INMUEBLE", "tipo_prestador": "No Comerciante",
     "razon_social_establecimiento": "RODRIGO ANDRES ORTIZ MORENO", "categoria": "VIVIENDAS TURÍSTICAS", "sub_categoria": "FINCA TURISTICA (ALOJAMIENTO RURAL)",
     "direcci_n_comercial_establecimiento": "Vereda Rosal Alto", "num_celular": "3001112233", "correo_establecimiento": "andresortizmoreno@gmail.com", "camas": "4"},
    {"codigo_rnt": "9", "cod_mun": "15798", "estado_rnt": "ACTIVO", "tipo_rnt": "GUÍA DE TURISMO", "tipo_prestador": "No Comerciante",
     "razon_social_establecimiento": "MARIA PEREZ", "categoria": "GUIAS DE TURISMO", "sub_categoria": "", "direcci_n_comercial_establecimiento": ""},
    {"codigo_rnt": "1", "cod_mun": "15798", "estado_rnt": "CANCELADO", "tipo_rnt": "ESTABLECIMIENTO", "tipo_prestador": "Comerciante",
     "razon_social_establecimiento": "HOTEL CERRADO", "categoria": "ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO", "sub_categoria": "HOTEL"},
    {"codigo_rnt": "2", "cod_mun": "15798", "estado_rnt": "ACTIVO", "tipo_rnt": "ESTABLECIMIENTO", "tipo_prestador": "Comerciante",
     "razon_social_establecimiento": "TRANSPORTES X", "categoria": "TRANSPORTE TERRESTRE", "sub_categoria": "X"},
]
c, desc = datos_gov.rnt_a_candidatos(RNT)
por_rnt = {x["rnt"]: x for x in c}
ok(len(c) == 4 and "1" not in por_rnt, "RNT: 4 candidatos; el CANCELADO se excluye")
ok(desc == {"TRANSPORTE TERRESTRE": 1}, f"RNT: categoría no usada queda reportada {desc}")
ok(por_rnt["56242"]["nombre"] == "Hotel Roca Center Guayatá" and not por_rnt["56242"]["anonimo"], "RNT: establecimiento de comerciante conserva su nombre comercial")
ok(por_rnt["56242"]["extra"] == {"habitaciones": 32, "camas": 56}, "RNT: capacidad (habitaciones y camas) disponible para planes")
v = por_rnt["154185"]
ok(v["anonimo"] and v["nombre"] == "Finca turística · vereda Rosal Alto", f"RNT: vivienda turística anonimizada → '{v['nombre']}'")
ok(por_rnt["9"]["nombre"] == "Guía de turismo", "RNT: guía sin nombre propio")
ok(c[0]["municipio"] == "guayata" and v["municipio"] == "almeida", "RNT: código DANE → municipio correcto")

# ---- Salud -----------------------------------------------------------------
SALUD = [
    {"municipio": "ALMEIDA", "nombre_de_sede": "Nelson Romero Urrego", "zona": "URBANA", "direccion": "Calle 2 No 3 - 18"},
    {"municipio": "ALMEIDA", "nombre_de_sede": "CENTRO DE SALUD DE ALMEIDA", "nivel": "2", "zona": "URBANA", "direccion": "Calle 3 # 5-10"},
    {"municipio": "LA CAPILLA", "nombre_de_sede": "EMPRESA SOCIAL DEL ESTADO CENTRO DE SALUD LA CANDELARIA DE LA CAPILLA", "nivel": "1"},
    {"municipio": "TENZA", "nombre_de_sede": "DORELLY VALDERRAMA GUIO", "zona": "URBANA"},
    {"municipio": "GUAYATÁ", "nombre_de_sede": "CENTRO DE SALUD DE GUAYATA", "nivel": "2"},
]
s = datos_gov.salud_a_candidatos(SALUD)
ok([x["nombre"] for x in s] == ["Centro de Salud de Almeida", "Empresa Social del Estado Centro de Salud la Candelaria de la Capilla", "Centro de Salud de Guayatá"],
   "Salud: solo instituciones; se excluyen consultorios de personas naturales")
ok({x["municipio"] for x in s} == {"almeida", "la-capilla", "guayata"}, "Salud: municipios con y sin tilde")

# ---- Cajeros ---------------------------------------------------------------
caj = datos_gov.cajeros_a_candidatos([{"nombre": "TENZA", "ciudad": "TENZA", "direccion": "CALLE 5 #  9 - 27/29"}, {"ciudad": "BOGOTA", "direccion": "x"}])
ok(len(caj) == 1 and caj[0]["municipio"] == "tenza", "Cajeros: solo los de los 7 municipios")

# ---- Normalización: duplicados y privacidad -----------------------------------
osm_banco = {"osm": "node/1", "nombre": "Banco Agrario de Colombia", "categoria": "cajero", "subtipo": "banco", "municipio": "tenza", "lat": 5.07, "lon": -73.42,
             "direccion": "", "vereda": "", "precision": "exacta", "fuentes": ["OpenStreetMap"], "rnt": None, "anonimo": False, "contacto": {}, "extra": {}, "tags": {}}
agr = dict(caj[0])
lugares = normalizar([osm_banco, agr])
ok(len(lugares) == 1 and lugares[0]["fuentes"] == ["Banco Agrario", "OpenStreetMap"] and lugares[0]["lat"] == 5.07,
   "Duplicado: el banco de OSM y el cajero de Banco Agrario se fusionan y conservan coordenadas")
lejos = dict(osm_banco, osm="node/2", lat=5.10, lon=-73.40)
ok(len(normalizar([osm_banco, lejos])) == 2, "Dos bancos con el mismo nombre a más de 75 m NO se fusionan")
dos_municipios = dict(osm_banco, osm="node/3", municipio="guayata")
ok(len(normalizar([osm_banco, dos_municipios])) == 2, "Mismo nombre en municipios distintos NO se fusiona")

todos = normalizar(c + s + caj)
pub = json.dumps([publico(x) for x in todos], ensure_ascii=False)
ok(not re.search(r"@|\b3\d{9}\b|ORTIZ|MARIA PEREZ|Maria Perez", pub), "Privacidad: el JSON público no tiene correos, teléfonos ni nombres de personas")
ok(all(publico(x)["lat"] is None for x in todos), "Sin coordenadas = 'sin ubicación' (no se inventan)")
ok(next(publico(x) for x in todos if x["rnt"] == "56242")["conRegistro"] is True, "Alojamiento con RNT marcado 'conRegistro'")
ok(len({x["id"] for x in todos}) == len(todos), "Los id son únicos")

# ---- CSV manual ------------------------------------------------------------
with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "m.csv"
    f.write_text("nombre,categoria,municipio,lat,lon,direccion,descripcion,fuente\n"
                 "Restaurante Doña Ana,restaurante,Tenza,5.0764,-73.4200,Calle 4,Cocina de campo,visita\n"
                 "Sin municipio,restaurante,Bogotá,,,,,\n"
                 "Categoría mala,pizzería,Tenza,,,,,\n"
                 "Coordenada rota,atraccion,Chivor,abc,-73.3,,,\n"
                 "Solo lat,atraccion,Chivor,4.9,,,,\n"
                 "Sin coordenadas,monumento,La Capilla,,,Plaza,,alcaldía\n", encoding="utf-8")
    ms, err = manual.leer(f)
    ok([x["nombre"] for x in ms] == ["Restaurante Doña Ana", "Sin coordenadas"], "Manual: filas válidas con y sin coordenadas")
    ok(len(err) == 4 and all("línea" in e for e in err), f"Manual: 4 errores reportados con número de línea")
    ok(ms[0]["precision"] == "exacta" and ms[1]["precision"] is None, "Manual: precisión exacta solo si trae coordenadas")

# ---- Geocodificador (sin red) ----------------------------------------------------
import geocodificar as geo
from fuentes.datos_gov import _vereda

ok(geo.normalizar_direccion("Cl 7 Kr 4 Esq") == "Calle 7 Carrera 4 esquina", "Geo: abreviaturas de calle → palabras completas")
ok(geo.es_calle("Carrera 4 5 32") and geo.es_calle("Kr 4 No. 5-88") and geo.es_calle("CALLE 5 #  9 - 27/29"), "Geo: reconoce direcciones de calle")
ok(not any(geo.es_calle(x) for x in ("Km 75 Chivor Via la Playa", "Finca Luna Park", "Centro", "Vereda Umbavita", "Carrera 6 10A 30 Finca La Cañada")),
   "Geo: no toma como calle lo rural ni lo vago (km, finca, vereda, 'Centro')")
ok(geo.es_urbana("Centro") and not geo.es_urbana("Finca Luna Park") and not geo.es_urbana("") and not geo.es_urbana("Km 75 vía"), "Geo: urbano vs rural")
caja = [5.0, -73.5, 5.2, -73.3]
ok(geo.dentro(caja, 5.1, -73.4) and not geo.dentro(caja, 4.0, -73.4) and geo.dentro(caja, 5.201, -73.4, 0.002), "Geo: validación contra el límite del municipio")
sitios = [{"nombre": "Rincón Arriba", "tipo": "locality", "lat": 4.95, "lon": -73.49}, {"nombre": "El Tablón", "tipo": "locality", "lat": 4.97, "lon": -73.48},
          {"nombre": "San José", "tipo": "hamlet", "lat": 4.99, "lon": -73.47}, {"nombre": "Guayatá", "tipo": "town", "lat": 4.96, "lon": -73.49},
          {"nombre": "Chavita Alta", "tipo": "locality", "lat": 4.9, "lon": -73.4}, {"nombre": "Chavita Baja", "tipo": "locality", "lat": 4.91, "lon": -73.41}]
ok(geo.buscar_vereda("Rincon Arriba", sitios)["lat"] == 4.95, "Geo: vereda con/sin tilde")
ok(geo.buscar_vereda("Tablon", sitios)["lat"] == 4.97, "Geo: 'Tablon' encuentra 'El Tablón' (único)")
ok(geo.buscar_vereda("Chavita", sitios) is None, "Geo: nombre ambiguo (Chavita Alta/Baja) NO se adivina")
ok(geo.buscar_vereda("Vereda Inexistente", sitios) is None and geo.buscar_vereda("Guayatá", sitios) is None, "Geo: sin coincidencia, o solo la cabecera (no es vereda) → None")
fixt = [{"lat": "4.0", "lon": "-73.4", "name": "Hotel X", "category": "tourism", "type": "hotel"},
        {"lat": "5.1", "lon": "-73.4", "name": "Hotel Roca Center", "category": "tourism", "type": "hotel", "display_name": "Hotel Roca Center, Guayatá"},
        {"lat": "5.1", "lon": "-73.4", "name": "Calle 4", "category": "highway", "type": "residential"}]
ok(geo.elegir_resultado(fixt, caja)["lat"] == 5.1, "Geo: descarta resultados fuera del municipio")
ok(geo.elegir_resultado(fixt, caja, nombre="Hotel Roca Center") is not None and geo.elegir_resultado(fixt, caja, nombre="Otro Nombre") is None,
   "Geo: por nombre exige un lugar con nombre parecido")

def cand(**k):
    base = dict(nombre="X", categoria="alojamiento", subtipo="", municipio="guayata", direccion="", vereda="", lat=None, lon=None, precision=None,
                fuentes=["RNT"], rnt="1", anonimo=False, contacto={}, extra={})
    base.update(k)
    return base
ctx = {"guayata": {"sitios": sitios, "limites": caja, "centro": [5.05, -73.45]}}
casos = [cand(nombre="Con vereda", vereda="Rincon Arriba", anonimo=True), cand(nombre="Calle sin red", direccion="Carrera 4 5 32"),
         cand(nombre="Rural km", direccion="Km 75 Via la Playa"), cand(nombre="Vereda desconocida", vereda="Inventada", anonimo=True, direccion="Vereda Inventada"),
         cand(nombre="Barrio", direccion="Centro", categoria="salud"), cand(nombre="Ya ubicado", lat=5.0, lon=-73.4, precision="exacta")]
est = geo.aplicar(casos, ctx, red=False)
p = {c["nombre"]: c["precision"] for c in casos}
ok(p == {"Con vereda": "vereda", "Calle sin red": "cabecera", "Rural km": None, "Vereda desconocida": None, "Barrio": "cabecera", "Ya ubicado": "exacta"},
   f"Geo: cascada sin red → {p}")
ok(est["consultas"] == 0 and est["vereda"] == 1 and est["cabecera"] == 2 and est["sin ubicación"] == 2, f"Geo: estadísticas {est}")
ok(casos[0]["lat"] == 4.95 and casos[1]["lat"] == 5.05, "Geo: coordenadas asignadas (vereda y alcaldía)")

# Fusión: la posición aproximada se une a su gemelo exacto aunque estén lejos, y se conserva la exacta
exacto = dict(osm_banco, nombre="Hospital San Rafael", categoria="salud", municipio="guayata", lat=5.0, lon=-73.4, precision="exacta", fuentes=["OpenStreetMap"], osm="node/9")
aprox = cand(nombre="Hospital San Rafael", categoria="salud", lat=5.05, lon=-73.45, precision="cabecera", fuentes=["Red de salud de Boyacá"])
f = normalizar([aprox, exacto])
ok(len(f) == 1 and f[0]["precision"] == "exacta" and f[0]["lat"] == 5.0 and len(f[0]["fuentes"]) == 2, "Fusión: aproximado + exacto → uno solo, con la posición exacta y las dos fuentes")

# Vereda sin datos de más
ok(_vereda("Vereda Rincon Arriba Finca Nuestro Sueño", "Guayatá") == "Rincon Arriba" and _vereda("Vereda Cora Chiquito Tenza", "Tenza") == "Cora Chiquito",
   "Vereda: sin nombre de finca ni municipio pegado")

# ---- Alcaldías (funciones puras) -------------------------------------------------
from fuentes import alcaldias as alc
ok(alc.permitido("", "/tema/turismo") and alc.permitido("<!doctype html><html></html>", "/x"), "Alcaldías: robots vacío o página HTML = permitido")
ok(not alc.permitido("User-agent: *\nDisallow: /tema/", "/tema/turismo") and alc.permitido("User-agent: *\nDisallow: /admin", "/tema/turismo"), "Alcaldías: respeta Disallow de robots.txt")
pags = [["Menú", "Saltar a contenido", f"Artículo {i}"] for i in range(4)]
lim = alc.quitar_repetido(pags)
ok(all(l == [f"Artículo {i}"] for i, l in enumerate(lim)), "Alcaldías: quita menús y textos repetidos en varias páginas")
fr = alc.frases_de_lugares("Visite la Cascada del Hato en la vereda Chaguatoque. Hoy hubo reunión del concejo. Se celebra el Festival de la Mogolla en el Parque Principal.\nMuy corta.")
ok([f["clave"] for f in fr] == ["cascada", "parque"] and fr[0]["tipo"] == "naturaleza", f"Alcaldías: extrae frases con sitios y descarta el resto → {[f['clave'] for f in fr]}")
ok(alc.frases_de_lugares("la cascada es bonita y está lejos de aquí hoy mismo") == [], "Alcaldías: sin nombre propio no es candidata")

print("\n" + ("TODO BIEN" if not fallos else f"{len(fallos)} FALLO(S)"))
sys.exit(1 if fallos else 0)
