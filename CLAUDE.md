# Valle Directo — guía para Claude Code

Web app para viajar al Valle de Tenza (Boyacá): itinerarios, mapa de lugares reales, reservas directas con
prestadores locales y logística de viaje. Este archivo es el contexto permanente; el trabajo por hacer está en
`docs/plan/`, una fase por archivo.

## Stack y comandos

- Vite + React 19 + TypeScript, `react-router-dom` (hoy `HashRouter`), Leaflet + `react-leaflet`, `lucide-react`.
- Backend objetivo: **Supabase** (Postgres, Auth, Realtime, Edge Functions) en el plan Free. Hosting: **Vercel Hobby**.
- Scraper de lugares en Python (`scraper/`), genera `src/data/lugares.json`.

```
npm install
npm run dev        # http://localhost:5173 (sirve también /api/chat)
npm run build      # tsc -b && vite build — debe pasar SIEMPRE antes de cerrar una tarea
npm run test       # vitest (se agrega en la Fase 0)
npx supabase start # Postgres local en Docker (Fase 0 en adelante)
npx supabase db reset && npx supabase test db   # migraciones + pruebas pgTAP
```

## Mapa del código

| Ruta | Qué es |
| --- | --- |
| `src/pages/*.tsx` | Una pantalla por ruta, cargadas con `lazy` en `src/App.tsx` |
| `src/state/demo.ts` | Almacén DEMO en `localStorage` (cuentas, negocios, reservas). Se reemplaza en la Fase 1 |
| `src/state/itinerario.tsx` | Contexto del itinerario elegido (plan, municipio, días, semilla) |
| `src/data/lugares.ts` / `lugares.json` | Catálogo de lugares y municipios |
| `src/data/generarPlan.ts` | Generador determinista de itinerarios |
| `src/data/asistente.ts` | Chat por reglas locales; `api/chat.ts` es el proxy opcional a Auren |
| `src/config.ts` | Contacto, horario, redes (hoy con `[PLACEHOLDERS]`) |
| `src/styles/tokens.css` | Tokens de diseño generados por `scripts/gen-tokens.mjs` — no editar a mano |
| `scraper/` | Fuentes: OSM, datos.gov.co, RNT, CSV manual |

## Convenciones (respetarlas)

- **Idioma:** identificadores, comentarios, textos de UI y commits en español, como el código existente.
- **Estilo:** sin librerías de UI nuevas. CSS por pantalla en `src/styles/`, usando los tokens existentes.
  Componentes de `src/components/ui.tsx` antes de crear nuevos.
- **Pantallas:** cada página nueva se registra con `lazy` en `App.tsx` y usa `usePagina()` para el título.
- **Móvil primero:** probar a 375 px. Objetivos táctiles de al menos 44 px. Nada de scroll horizontal.
- **Accesibilidad:** `alt` en imágenes, `label` en campos, foco visible, `aria-live` en avisos dinámicos.
- **Texto honesto:** nunca mostrar «Cupo verificado» si no lo está. Fechas de verificación visibles en datos de terceros.

## Datos, seguridad y privacidad (no negociable)

- Supabase con **RLS activado en todas las tablas**. Ninguna tabla nueva sin políticas y sin prueba pgTAP.
- En el navegador solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La `service_role` vive solo en *secrets*
  de GitHub Actions y variables de Vercel. El repo es **público**: nunca commitear llaves ni `.env.local`.
- Datos personales de viajeros (nombre, teléfono) solo visibles para el dueño del negocio. Nunca en vistas públicas,
  logs, analítica ni URLs. Respetar Ley 1581 de 2012 (aviso de privacidad, borrado a los 12 meses).
- El JSON público de lugares no lleva teléfonos ni correos (regla del scraper; mantenerla en la tabla `lugares`).
- APIs externas gratuitas (OSRM demo, Open-Meteo) **nunca** desde el navegador: solo desde trabajos programados que
  escriben en tablas. Atribuir OSM/ODbL, OSRM y Open-Meteo (CC-BY 4.0).
- Costo cero: no agregar servicios de pago. Si una tarea lo requiere, detenerse y preguntar.

## Flujo de trabajo para cada fase

1. Leer `docs/plan/README.md` y el archivo de la fase. Entrar en modo plan, proponer el desglose y esperar aprobación
   si la fase toca esquema de base de datos o borra código.
2. Trabajar en la rama `fase-N-<tema>`. Commits pequeños, uno por tarea del checklist.
3. Migraciones SQL nuevas en `supabase/migrations/` (nunca editar una ya aplicada en producción).
   Después de cambiar el esquema: `npx supabase gen types typescript --local > src/lib/database.types.ts`.
4. Antes de cerrar: `npm run build`, `npm run test`, `npx supabase test db` y la prueba de cierre de la fase.
5. Marcar el checklist de la fase, actualizar el README si cambió cómo se ejecuta algo, y abrir PR con un resumen
   de qué cambió, cómo probarlo y qué quedó pendiente.

## Cosas que NO hacer

- No borrar `src/data/lugares.json`: es el respaldo si Supabase no responde.
- No cambiar el diseño visual general (colores, tipografía, logo) salvo que la fase lo pida.
- No activar `usarAuren` ni tocar `api/chat.ts` salvo en la Fase 4.
- No introducir comisiones, pagos ni anuncios: Vercel Hobby y Open-Meteo gratis son solo para uso no comercial.
