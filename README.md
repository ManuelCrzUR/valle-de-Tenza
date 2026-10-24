# Valle Directo

Web app para armar un itinerario al Valle de Tenza (Boyacá). Vite + React + TypeScript; se publica en Vercel.

## Desarrollo

```
npm install
npm run dev       # servidor local
npm run build     # compila a dist/
npm run preview   # sirve dist/ para revisar
```

## Dónde cambiar cosas

- **Contacto, horario y redes:** `src/config.ts` (reemplaza los valores `[ENTRE CORCHETES]`).
- **Planes (metadatos):** `src/data/planes.ts`.
- **Lugares reales:** `src/data/lugares.json` (lo genera el scraper) y el generador de itinerarios en `src/data/generarPlan.ts`.
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
- **Sin backend** (por ejemplo en desarrollo local sin `.env.local`) o si Auren falla, el chat responde con las reglas locales de `src/data/respuestas.ts`.
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

## Prestadores y reservas (modo demo)

- **Prestadores:** entran en `/prestadores/entrar` y administran su negocio desde `/prestadores/panel`. Pueden registrar restaurante, caminata, actividad u hotel, reclamar un lugar del mapa o crear uno nuevo, y definir un cupo diario.
- **Viajeros:** reservan sin cuenta desde `/reservar/<id>` (botón «Reservar» en Lugares, Mapa e Itinerario) y ven sus solicitudes en `/reservas`.
- **Confirmación:** el prestador confirma o rechaza cada solicitud desde su panel.
- **Almacenamiento:** todo se guarda en el `localStorage` del navegador (`src/state/demo.ts`). Es una **DEMO**: no es segura, no se comparte entre dispositivos y las contraseñas no deben ser reales.
- **Para operar de verdad:** reemplaza solo `src/state/demo.ts` por un backend (por ejemplo, Supabase).

## Pruebas

```
npm run test      # vitest (generador de itinerarios)
npm run e2e       # Playwright: prueba de cierre de la Fase 1 (reservas de punta a punta)
```

La prueba e2e necesita Supabase local en marcha (`npx supabase start`, con el seed). Las variables salen de `npx supabase status -o env`:

```
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|MAILPIT_URL|INBUCKET_URL)=')"
VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY npm run e2e
```

Levanta Vite en el puerto 5186 (o reutiliza uno ya abierto con las mismas variables), entra como `prestador@prueba.local` con el enlace leído de Mailpit y borra con la `service_role` las reservas que crea.

## Base de datos (Supabase)

```
npx supabase start                              # Postgres local en Docker
npx supabase db reset && npx supabase test db   # migraciones + pruebas pgTAP
```

Después de cada corrida del scraper, carga los lugares en Supabase (upsert idempotente por `id`):

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cargar
```

La `service_role` solo va en la terminal o en secretos; nunca en el front ni en el repo.

**Secretos de GitHub** (*Settings → Secrets and variables → Actions*), usados por los workflows de `.github/workflows/`:

- `SUPABASE_URL`: URL del proyecto (ping y respaldo).
- `SUPABASE_ANON_KEY`: llave anon (ping cada 3 días).
- `SUPABASE_DB_URL`: cadena de conexión a Postgres (respaldo diario, artifact de 30 días).

## Logística

Tiempos por carretera (OSRM) y pronóstico (Open-Meteo) se calculan solo desde scripts, nunca desde el navegador, y se guardan en `tramos` y `clima`:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run tramos   # solo pares nuevos; `-- --todo` recalcula todos
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run clima    # 7 días por municipio con centro
```

`tramos` respeta el servidor demo de OSRM (≤ 50 coordenadas por petición, 1 petición por segundo) y se corre a mano o con el workflow `Tramos (OSRM)` cuando cambia el catálogo. `clima` corre cada 3 horas con el workflow `Clima`. Ambos workflows necesitan los secretos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (la `service_role` solo vive en secretos). Atribución: rutas © OSRM y colaboradores de OpenStreetMap (ODbL); clima Open-Meteo (CC-BY 4.0).

## Publicación

El despliegue es único, en **Vercel**. `vercel.json` define las cabeceras de caché para `/assets/*` y `/fotos/*`. Variables en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `AUREN_DEMO_TOKEN`. Las rutas usan hash (`/#/mapa`).

`mvp/` conserva el HTML original como referencia.
