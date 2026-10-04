"""Lugares agregados a mano (tú o los embajadores) en datos/lugares_manual.csv."""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from categorias import CATEGORIAS
from municipios import buscar
from util import DATOS

ARCHIVO = DATOS / "lugares_manual.csv"
COLUMNAS = ["nombre", "categoria", "municipio", "lat", "lon", "direccion", "descripcion", "fuente"]


def leer(ruta=ARCHIVO) -> tuple[list[dict], list[str]]:
    """Devuelve (candidatos, errores). Una fila con error se salta y se reporta con su número de línea."""
    cands, errores = [], []
    if not Path(ruta).exists():
        return cands, errores
    with open(ruta, newline="", encoding="utf-8") as fh:
        for n, fila in enumerate(csv.DictReader(fh), start=2):
            if not any((v or "").strip() for v in fila.values()):
                continue
            m, cat, nombre = buscar(fila.get("municipio", "")), (fila.get("categoria") or "").strip().lower(), (fila.get("nombre") or "").strip()
            if not nombre:
                errores.append(f"línea {n}: falta el nombre")
            elif cat not in CATEGORIAS:
                errores.append(f"línea {n} ({nombre}): categoría '{cat}' no válida; usa una de {', '.join(CATEGORIAS)}")
            elif not m:
                errores.append(f"línea {n} ({nombre}): municipio '{fila.get('municipio')}' no es uno de los 7")
            else:
                try:
                    lat = float(fila["lat"]) if (fila.get("lat") or "").strip() else None
                    lon = float(fila["lon"]) if (fila.get("lon") or "").strip() else None
                except ValueError:
                    errores.append(f"línea {n} ({nombre}): lat/lon deben ser números con punto decimal")
                    continue
                if (lat is None) != (lon is None):
                    errores.append(f"línea {n} ({nombre}): falta lat o lon")
                    continue
                cands.append({"nombre": nombre, "categoria": cat, "subtipo": "", "municipio": m["slug"], "direccion": (fila.get("direccion") or "").strip(),
                              "vereda": "", "lat": lat, "lon": lon, "precision": "exacta" if lat is not None else None,
                              "fuentes": [(fila.get("fuente") or "Manual").strip() or "Manual"], "rnt": None, "anonimo": False, "contacto": {},
                              "extra": {"descripcion": (fila.get("descripcion") or "").strip()} if (fila.get("descripcion") or "").strip() else {}})
    return cands, errores
