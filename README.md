# Valle Directo

Web app para armar un plan al Valle de Tenza (Boyacá) con el catálogo real de siete municipios y enviar una **solicitud**, que no confirma reserva. Vite + React + TypeScript. El sitio público actual está en Vercel; este repositorio no despliega solo.

Configuración de Supabase, OpenAI y Resend: [docs/configuracion-mvp.md](docs/configuracion-mvp.md). Las claves son de servidor (sin prefijo `VITE_`). Sin ellas, la interfaz muestra modo demostración y no afirma un envío real.

## Desarrollo

```
npm install
npm run dev       # servidor local
npm run build     # compila a dist/
npm run preview   # sirve dist/ para revisar
```

## Dónde cambiar cosas

- **Planes (metadatos):** `src/data/planes.ts`.
- **Lugares reales:** `src/data/lugares.json` (lo genera el scraper) y el generador de itinerarios en `src/data/generarPlan.ts`.
- **Claves y correo:** [docs/configuracion-mvp.md](docs/configuracion-mvp.md) y `.env.example`.
- **Colores, tipografía y espacios:** vienen del sistema de marca (`scripts/tokens.json`). Tras cambiarlos: `node scripts/gen-tokens.mjs`.

## Plan, voz y solicitud

- `POST /api/itinerario` arma el plan. Sin `OPENAI_API_KEY` usa el catálogo en el servidor (`modo: demo`). Con clave, llama a la Responses API y el servidor valida los ids.
- `POST /api/transcribir` recibe un audio corto (webm u otro tipo permitido, máximo 3,5 MB).
- `POST /api/voz` lee el resumen solo si la persona lo pide. Es voz sintética.
- `POST /api/solicitudes` valida, guarda en Supabase si hay service role y después intenta el comprobante con Resend. Sin Supabase no guarda. Sin Resend deja el comprobante en `omitido_sin_configuracion`.

Pruebas: `npm test` (no llama a proveedores reales). Reintento de correos ya guardados: `npm run reintentar-correo`.

## Chat heredado (Auren)

`/api/chat` sigue en el repo, pero la interfaz ya no lo usa: `/chat` abre el plan. El documento `docs/auren-conocimiento-valle.md` describe municipios y hospedajes que no están en el catálogo; no lo uses como fuente del plan nuevo.

## Lugares reales y mapa

La pantalla **Mapa** muestra lugares reales de Guayatá, Somondoco, Tenza, Sutatenza, Almeida, Chivor y La Capilla (Leaflet + teselas de OpenStreetMap, sin llave de API). Los datos salen de `src/data/lugares.json`, que genera el scraper de `scraper/` (Python + [Scrapling](https://github.com/D4Vinci/Scrapling)).

```
python3.12 -m venv scraper/.venv && scraper/.venv/bin/pip install -r scraper/requirements.txt   # una vez
scraper/.venv/bin/python scraper/ejecutar.py                    # SIN red: usa cache/ y datos/osm_inicial.json
scraper/.venv/bin/python scraper/ejecutar.py --descargar        # CON red: OpenStreetMap, datos.gov.co y Nominatim (geocodificación)
scraper/.venv/bin/python scraper/ejecutar.py --alcaldias        # CON red + Chrome: portales de las 7 alcaldías (~6 min)
scraper/.venv/bin/python scraper/probar.py                      # pruebas sin red
```

- **Fuentes:** OpenStreetMap (Overpass), Registro Nacional de Turismo, red de salud de Boyacá y cajeros del Banco Agrario (datos.gov.co), y `scraper/datos/lugares_manual.csv` para lo que falte (ver `scraper/datos/LEEME.md`).
- **Hoy:** 152 lugares, 136 con ubicación en el mapa; 42 alojamientos. Las direcciones sin coordenadas se ubican en cascada y cada lugar guarda qué tan precisa es su posición: `exacta` > `direccion` (Nominatim) > `vereda` (centro de la vereda) > `cabecera` (zona urbana). Lo que no se puede ubicar con una base honesta queda **sin ubicación**: aparece en la lista pero no en el mapa.
- **Alcaldías:** los portales (gov.co, hechos en Angular) se renderizan con el Chrome instalado. Son administrativos: dan noticias e historia, no listas de lugares. Por eso no van al mapa: generan material de **revisión** en `scraper/salida/` (`candidatos_alcaldias.csv`, `alcaldias_resumen.md`).
- **Privacidad:** el JSON público no lleva teléfonos ni correos. Las viviendas turísticas y guías salen por tipo y vereda, sin nombre de persona ni de finca.
- **Cortesía:** respeta `robots.txt`, máximo 1 petición por segundo por servidor y todo se guarda en caché (`scraper/cache/`, fuera de git).
- **Reporte:** cada corrida escribe `scraper/salida/reporte.md` (por municipio y categoría, precisión de ubicación, paradas por tipo de plan y lo que falta completar).
- **Datos:** © Colaboradores de OpenStreetMap, licencia ODbL; datos abiertos de datos.gov.co.

## Solicitud

La persona viaja sin cuenta. En `/plan` envía nombre, correo, fecha y el plan ya validado. No hay cuentas de prestador en el navegador ni cupo verificado. El estado visible separa «no guardada», «guardada» y «correo enviado». Ninguno de esos estados es una reserva confirmada.

## Publicación

La app usa rutas con hash (`/#/plan`). Vercel también reescribe el resto de rutas a `index.html` (`vercel.json`), sin tocar `/api`. El workflow de GitHub Pages sigue en `.github/workflows/deploy.yml`; en octubre de 2026 esos jobs fallaban antes de publicar. El sitio que responde hoy es el de Vercel, y este cambio no lo actualiza.

`mvp/` conserva el HTML original como referencia.
