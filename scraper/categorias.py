"""Categorías del mapa: id, etiqueta, ícono (de la marca o Lucide), plan al que sirven y si son servicio.

`plan` = tipo de plan al que aporta paradas (aventura | gastro | cultura) o None.
`servicio` = utilidad para el viaje (no es una parada del plan): cajero, gasolina, salud...
"""
CATEGORIAS = {
    "alojamiento": {"etiqueta": "Alojamiento", "icono": "hospedaje", "plan": None, "servicio": False},
    "restaurante": {"etiqueta": "Restaurantes y cafés", "icono": "gastronomia", "plan": "gastro", "servicio": False},
    "comercio": {"etiqueta": "Tiendas y supermercados", "icono": "tienda", "plan": None, "servicio": True},
    "atraccion": {"etiqueta": "Atracciones y miradores", "icono": "atraccion", "plan": "aventura", "servicio": False},
    "monumento": {"etiqueta": "Monumentos e iglesias", "icono": "cultura", "plan": "cultura", "servicio": False},
    "naturaleza": {"etiqueta": "Parques, cerros y senderos", "icono": "naturaleza", "plan": "aventura", "servicio": False},
    "operador": {"etiqueta": "Guías y agencias", "icono": "ruta", "plan": "aventura", "servicio": False},
    "cajero": {"etiqueta": "Cajeros y bancos", "icono": "cajero", "plan": None, "servicio": True},
    "gasolinera": {"etiqueta": "Gasolineras", "icono": "gasolina", "plan": None, "servicio": True},
    "salud": {"etiqueta": "Salud", "icono": "salud", "plan": None, "servicio": True},
    "servicio": {"etiqueta": "Alcaldía y servicios", "icono": "servicio", "plan": None, "servicio": True},
}

# Prioridad al clasificar un elemento de OSM con varias etiquetas (la primera que coincida gana).
def categoria_osm(t: dict):
    """Devuelve (categoria, subtipo) para las etiquetas de OSM de un lugar, o None si no nos sirve."""
    a, s, tu, h, le, na = (t.get(k, "") for k in ("amenity", "shop", "tourism", "historic", "leisure", "natural"))
    if a in ("restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream"):
        return "restaurante", a
    if tu in ("hotel", "guest_house", "hostel", "motel", "apartment", "chalet", "camp_site", "caravan_site"):
        return "alojamiento", tu
    if a == "atm":
        return "cajero", "cajero automático"
    if a == "bank":
        return "cajero", "banco"
    if a == "fuel":
        return "gasolinera", "estación de servicio"
    if a in ("hospital", "clinic", "doctors", "pharmacy"):
        return "salud", a
    if a == "marketplace":
        return "restaurante", "plaza de mercado"   # sirve a planes de gastronomía
    if s in ("supermarket", "convenience", "general", "bakery", "greengrocer", "butcher", "farm"):
        return "comercio", s
    if tu in ("museum", "gallery", "artwork"):
        return "monumento", tu
    if tu in ("attraction", "viewpoint", "theme_park", "zoo", "picnic_site"):
        return "atraccion", tu
    if h:
        return "monumento", h
    if a == "place_of_worship":
        return "monumento", "iglesia"
    if na in ("waterfall", "cave_entrance", "hot_spring", "spring", "peak") or t.get("waterway") == "waterfall":
        return "naturaleza", "cascada" if "waterfall" in (na, t.get("waterway")) else na
    if le in ("park", "garden", "nature_reserve", "sports_centre", "swimming_pool", "playground"):
        return "naturaleza", le
    if t.get("highway") in ("path", "footway", "track") and t.get("name"):
        return "naturaleza", "sendero"
    if t.get("route") in ("hiking", "foot"):
        return "naturaleza", "sendero"
    if a in ("townhall", "police", "library", "bus_station", "post_office", "courthouse"):
        return "servicio", a
    return None
