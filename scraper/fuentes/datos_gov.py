"""Datos abiertos de Colombia (datos.gov.co) por la API Socrata, vía Scrapling.

`descargar_*` usan la RED (solo se llaman con --descargar). `*_a_candidatos` son funciones puras
que convierten filas ya descargadas: se pueden probar sin red (ver probar.py).
Ninguna de estas fuentes trae coordenadas: sus lugares quedan 'sin ubicación' hasta geocodificarlos.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from municipios import MUNICIPIOS, POR_DANE, buscar
from util import HEADERS, con_cache, esperar, norm, titulo

BASE = "https://www.datos.gov.co/resource/{}.json"
RNT, SALUD, CAJEROS = "thwd-ivmp", "8byh-6agx", "cx4p-wx4m"
_NOMBRES = "('GUAYATA','GUAYATÁ','SOMONDOCO','TENZA','SUTATENZA','ALMEIDA','CHIVOR','LA CAPILLA')"


def _get(recurso: str, **params) -> list[dict]:
    from scrapling.fetchers import Fetcher
    url = BASE.format(recurso)
    esperar(url, 1)
    r = Fetcher.get(url, params=params, headers=HEADERS, timeout=60, retries=2)
    if r.status != 200:
        raise RuntimeError(f"{recurso}: HTTP {r.status}")
    return json.loads(r.body)


def descargar_rnt(refrescar=False):
    dane = ",".join(f"'{m['dane']}'" for m in MUNICIPIOS)
    return con_cache("rnt", lambda: _get(RNT, **{"$where": f"cod_mun in({dane}) AND estado_rnt='ACTIVO'", "$limit": "500"}), refrescar)


def descargar_salud(refrescar=False):
    return con_cache("salud", lambda: _get(SALUD, **{"$where": f"upper(municipio) in{_NOMBRES}", "$limit": "500"}), refrescar)


def descargar_cajeros(refrescar=False):
    return con_cache("cajeros", lambda: _get(CAJEROS, **{"$where": f"upper(ciudad) in{_NOMBRES}", "$limit": "200"}), refrescar)


def _t(texto: str) -> str:
    """Título legible y con la tilde de Guayatá (los datos abiertos la traen sin tilde)."""
    return re.sub(r"\bGuayata\b", "Guayatá", titulo(texto))


def _sub_publico(sub: str) -> str:
    """'FINCA TURISTICA (ALOJAMIENTO RURAL)' -> 'Finca turística' (sin paréntesis, en minúscula salvo la inicial)."""
    base = re.sub(r"\s*\(.*?\)", "", sub or "").strip().lower().replace("turistica", "turística").replace("turistico", "turístico")
    return base[:1].upper() + base[1:]


def _candidato(**k) -> dict:
    base = {"nombre": "", "categoria": "", "subtipo": "", "municipio": "", "direccion": "", "vereda": "", "lat": None, "lon": None,
            "precision": None, "fuentes": [], "rnt": None, "anonimo": False, "contacto": {}, "extra": {}}
    base.update(k)
    return base


def _vereda(direccion: str) -> str:
    m = re.search(r"(?i)\bvereda\s+([^,;\n]+)", direccion or "")
    return titulo(m.group(1)) if m else ""


def _num(x) -> int:
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return 0


def rnt_a_candidatos(filas: list[dict]) -> tuple[list[dict], dict]:
    """Registro Nacional de Turismo -> alojamientos y operadores. Devuelve (candidatos, descartados por categoría).

    Privacidad: el nombre solo se publica si es un establecimiento de un comerciante. Viviendas,
    guías y personas naturales salen por tipo + vereda, y nunca llevan teléfono ni correo públicos."""
    cands, descartados = [], {}
    for f in filas:
        if (f.get("estado_rnt") or "").upper() != "ACTIVO":
            continue
        m = POR_DANE.get(str(f.get("cod_mun")))
        if not m:
            continue
        cat_txt = norm(f.get("categoria", ""))
        if "alojamiento" in cat_txt or "vivienda" in cat_txt:
            cat = "alojamiento"
        elif "agencia" in cat_txt or "guia" in cat_txt or "operador" in cat_txt:
            cat = "operador"
        elif "gastronom" in cat_txt:
            cat = "restaurante"
        else:
            descargado = f.get("categoria") or "(sin categoría)"
            descartados[descargado] = descartados.get(descargado, 0) + 1
            continue
        sub = titulo(f.get("sub_categoria", ""))
        dir_raw = f.get("direcci_n_comercial_establecimiento", "")
        vereda = _vereda(dir_raw)
        publico = f.get("tipo_rnt") == "ESTABLECIMIENTO" and f.get("tipo_prestador") == "Comerciante"
        if publico:
            nombre, direccion = _t(f.get("razon_social_establecimiento", "")), re.sub(r"\s+", " ", _t(dir_raw))
        elif "guia" in cat_txt or f.get("tipo_rnt") == "GUÍA DE TURISMO":
            nombre, direccion = "Guía de turismo", ""
        else:
            nombre = (_sub_publico(f.get("sub_categoria", "")) or "Alojamiento") + (f" · vereda {vereda}" if vereda else "")
            direccion = f"Vereda {vereda}" if vereda else ""
        extra = {}
        if _num(f.get("habitaciones")):
            extra["habitaciones"] = _num(f["habitaciones"])
        if _num(f.get("camas")):
            extra["camas"] = _num(f["camas"])
        cands.append(_candidato(
            nombre=nombre, categoria=cat, subtipo=sub.lower(), municipio=m["slug"], direccion=direccion, vereda=vereda,
            fuentes=["RNT"], rnt=str(f.get("codigo_rnt") or ""), anonimo=not publico, extra=extra,
            contacto={"telefono": f.get("n_m_tel_fono"), "celular": f.get("num_celular"), "correo": f.get("correo_establecimiento"),
                      "razon_social": f.get("razon_social_establecimiento"), "direccion_completa": dir_raw}))
    return cands, descartados


_SALUD_OK = re.compile(r"centro de salud|hospital|\bese\b|e\.s\.e|empresa social|puesto de salud|cl[ií]nica|farmacia|droguer[ií]a|unidad (b[aá]sica|m[eé]dica)", re.I)


def salud_a_candidatos(filas: list[dict]) -> list[dict]:
    """Red de prestadores de salud de Boyacá -> solo instituciones (no consultorios de personas naturales)."""
    cands = []
    for f in filas:
        m = buscar(f.get("municipio", ""))
        nombre = (f.get("nombre_de_sede") or "").strip()
        if not m or not nombre or not (_SALUD_OK.search(nombre) or f.get("nivel")):
            continue
        n = norm(nombre)
        sub = "hospital" if "hospital" in n else "farmacia" if ("farmacia" in n or "drogueria" in n) else "centro de salud"
        extra = {"nivel": f["nivel"]} if f.get("nivel") else {}
        cands.append(_candidato(nombre=_t(nombre), categoria="salud", subtipo=sub, municipio=m["slug"],
                                direccion=_t(f.get("direccion", "")), fuentes=["Red de salud de Boyacá"], extra=extra))
    return cands


def cajeros_a_candidatos(filas: list[dict]) -> list[dict]:
    cands = []
    for f in filas:
        m = buscar(f.get("ciudad", ""))
        if m:
            cands.append(_candidato(nombre="Cajero Banco Agrario", categoria="cajero", subtipo="cajero automático", municipio=m["slug"],
                                    direccion=_t(f.get("direccion", "")), fuentes=["Banco Agrario"]))
    return cands


def cargar_en_cache() -> dict:
    """SIN RED. Candidatos de las fuentes cuyas respuestas ya están en cache/; las que no, se omiten."""
    from util import CACHE
    out = {"rnt": [], "salud": [], "cajeros": [], "descartados": {}}
    for clave, fn in (("rnt", None), ("salud", salud_a_candidatos), ("cajeros", cajeros_a_candidatos)):
        archivos = sorted(CACHE.glob(f"{clave}-*.json"))
        if not archivos:
            continue
        filas = json.loads(archivos[0].read_text(encoding="utf-8"))
        if clave == "rnt":
            out["rnt"], out["descartados"] = rnt_a_candidatos(filas)
        else:
            out[clave] = fn(filas)
    return out
