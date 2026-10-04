# Lugares manuales

Agrega una fila por lugar a `lugares_manual.csv` (se abre con Excel o Numbers; guarda como CSV UTF-8).

| Columna | Qué poner |
| --- | --- |
| nombre | Nombre del lugar |
| categoria | `alojamiento`, `restaurante`, `comercio`, `atraccion`, `monumento`, `naturaleza`, `operador`, `cajero`, `gasolinera`, `salud` o `servicio` |
| municipio | Guayatá, Somondoco, Tenza, Sutatenza, Almeida, Chivor o La Capilla |
| lat, lon | Opcionales. Con punto decimal (`5.0123`, `-73.4567`). Sin coordenadas el lugar aparece en la lista pero no en el mapa. |
| direccion | Calle o vereda |
| descripcion | Una frase, solo con datos que puedas confirmar |
| fuente | De dónde salió el dato (ej. "visita", "alcaldía", "dueño del negocio") |

Cómo sacar las coordenadas: en openstreetmap.org, clic derecho sobre el lugar → *Mostrar dirección* / *Copiar coordenadas*.

Después de editar: `scraper/.venv/bin/python scraper/ejecutar.py` (sin red).
