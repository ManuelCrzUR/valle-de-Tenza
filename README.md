# Valle Directo

Web app para armar un itinerario al Valle de Tenza (Boyacá). Vite + React + TypeScript; se publica en GitHub Pages.

## Desarrollo

```
npm install
npm run dev       # servidor local
npm run build     # compila a dist/
npm run preview   # sirve dist/ para revisar
```

## Dónde cambiar cosas

- **Contacto, horario y redes:** `src/config.ts` (reemplaza los valores `[ENTRE CORCHETES]`).
- **Planes, lugares y hospedajes:** `src/data/planes.ts`.
- **Respuestas del chatbot:** `src/data/respuestas.ts`.
- **Colores, tipografía y espacios:** vienen del sistema de marca (`scripts/tokens.json`). Tras cambiarlos: `node scripts/gen-tokens.mjs`.

## Chatbot (Auren AI)

El chat llama a `/api/chat` (`api/chat.ts`, función de Vercel), que reenvía la pregunta al endpoint de demo de Auren AI. Auren es quien llama a OpenAI; este proyecto no usa ninguna llave de OpenAI.

| Variable | Qué es |
| --- | --- |
| `AUREN_DEMO_TOKEN` | Token de la demo de Auren con el conocimiento del Valle (obligatoria) |
| `AUREN_BASE_URL` | Opcional; por defecto `https://app.getaurenai.com` |

- **Desarrollo:** copia `.env.example` a `.env.local`, completa el token y corre `npm run dev` (sirve `/api/chat` con la misma función).
- **Vercel:** *Settings → Environment Variables*.
- **Sin backend** (por ejemplo en GitHub Pages) o si Auren falla, el chat responde con las reglas locales de `src/data/respuestas.ts`.
- Límites: 500 caracteres por mensaje y 20 mensajes cada 10 minutos por IP (de mejor esfuerzo).
- El contenido que debe conocer el bot está en [docs/auren-conocimiento-valle.md](docs/auren-conocimiento-valle.md).

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

## Publicación

Cada push a `main` ejecuta `.github/workflows/deploy.yml` y publica en GitHub Pages. En el repositorio: *Settings → Pages → Source: GitHub Actions*. Las rutas usan hash (`/#/mapa`) porque GitHub Pages no tiene fallback para SPA.

`mvp/` conserva el HTML original como referencia.
