# Valle Directo — guía para Claude Code

Web app para viajar al Valle de Tenza (Boyacá), 7 municipios: plan con IA, mapa de lugares reales, panel de
prestadores y **solicitudes** (no son reservas confirmadas). Esta rama parte de la versión publicada en Vercel
(`cursor/class-mvp-itinerario-1c78`). El trabajo por hacer está en el plan por sprints (S0–S4).

## Stack y comandos

- Vite + React 19 + TypeScript, `react-router-dom`, Leaflet + `react-leaflet`, `lucide-react`, `pdf-lib`.
- Funciones de servidor en `api/*.ts` (Vercel; en `npm run dev` las sirve Vite). Lógica en `server/`.
- **OpenAI** (Responses API) para plan, agente, transcripción y voz; **Resend** para correos; **Supabase**
  (Postgres, Auth, Storage) en el plan Free. Hosting: **Vercel Hobby**.

```
npm install
npm run dev        # http://localhost:5173 (sirve también /api/*)
npm run build      # tsc -b && vite build — debe pasar SIEMPRE antes de cerrar una tarea
npm run test       # vitest (server/*.test.ts) + verificación del runtime
npx supabase start # Postgres local en Docker
npx supabase db reset && npx supabase test db   # migraciones + pruebas pgTAP (supabase/tests/)
npm run reintentar-correo                       # reintenta el outbox con las claves cargadas
```

## Mapa del código

| Ruta | Qué es |
| --- | --- |
| `api/*.ts` | Endpoints: `agente`, `itinerario`, `solicitudes`, `negocios`, `dossier`, `reintento`, `transcribir`, `voz` |
| `server/agente.ts` | Agente flotante con OpenAI: herramienta `buscar_lugares`, salida JSON, links en lista blanca |
| `server/itinerario.ts` | Plan con OpenAI o con el catálogo; `validarPropuesta` descarta ids que no existen |
| `server/catalogo.ts` | Catálogo del servidor: `buscarLugares`, `leerPreferencias`, `SLUGS` |
| `server/solicitud.ts`, `correo.ts`, `puerta.ts` | Solicitud, outbox y envío con Resend (y su puerta de remitente de prueba) |
| `server/empresas.ts` | Negocios publicados (`businesses`) como lugares (`business:<uuid>`) |
| `server/texto.ts`, `http.ts`, `env.ts` | `sinDatosPersonales`, `crearLimite`/`ipCliente`/`json`, configuración de proveedores |
| `src/pages/Plan.tsx` | Plan (Planeador por clics y Asistente por texto o voz) y formulario `#plan-solicitud` |
| `src/pages/PrestadorPanel.tsx` | Panel del negocio: datos, fotos (`business-photos`) |
| `src/components/agente/` | Asistente flotante (`Agente.tsx`, `Orbe.tsx`); respaldo local en `src/data/agente.ts` |
| `src/data/lugares.json` | Catálogo (lo genera `scraper/`); respaldo si Supabase no responde |
| `shared/` | Código común navegador/servidor (`ids.ts`, `constantes.ts`) |
| `supabase/migrations/00N_*.sql` | Esquema; `supabase/tests/` pruebas pgTAP |
| `docs/` | `configuracion-mvp.md` (claves, Vercel), `agente.md`, `cuentas-prestadores.md` |

## Convenciones (respetarlas)

- **Idioma:** identificadores, comentarios, textos de UI y commits en español, como el código existente.
- **Estilo:** sin librerías de UI nuevas. CSS por pantalla en `src/styles/`, con los tokens existentes.
  Componentes de `src/components/ui.tsx` antes de crear nuevos.
- **Móvil primero:** probar a 375 px. Objetivos táctiles de al menos 44 px. Nada de scroll horizontal.
- **Accesibilidad:** `alt` en imágenes, `label` en campos, foco visible, `aria-live` en avisos dinámicos.
- **Texto honesto:** una solicitud no es una reserva. No afirmar un envío, una llamada a OpenAI ni un cupo que no ocurrió.
  Precios y horarios de terceros con su fecha de actualización; si falta, «Por confirmar».

## Datos, seguridad y privacidad (no negociable)

- **RLS activado en todas las tablas.** Ninguna tabla nueva sin políticas y sin prueba pgTAP en `supabase/tests/`.
- En el navegador solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `OPENAI_API_KEY`, `RESEND_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` y llaves VAPID privadas solo en el servidor (variables de Vercel). Repo **público**:
  nunca commitear llaves ni `.env.local`.
- Datos personales de viajeros (nombre, teléfono, correo) solo para el dueño del negocio al que pidió, y solo con
  su consentimiento. Nunca en vistas públicas, logs, notificaciones push, analítica ni URLs. Ley 1581 de 2012.
- Al modelo de OpenAI solo le llega texto pasado por `sinDatosPersonales` e ids del catálogo; el servidor
  descarta ids que no existan. Nada de lugares inventados.
- Datos de contacto del negocio: públicos solo si el negocio activa su interruptor.
- Costo: solo planes gratuitos (Supabase Free, Vercel Hobby, Resend free). OpenAI se usa con límites por IP y
  tokens acotados. Si una tarea pide un servicio de pago nuevo, detenerse y preguntar.

## Flujo de trabajo

1. Cada sprint en su rama `sprint-N-<tema>`; commits pequeños, uno por tarea.
2. Migraciones nuevas en `supabase/migrations/` con el siguiente número; nunca editar una ya aplicada.
3. Antes de cerrar: `npm run build`, `npm run test`, `npx supabase test db` y la prueba de cierre del sprint.
4. Actualizar README/docs si cambió cómo se ejecuta o configura algo; abrir PR con qué cambió, cómo probarlo y
   qué quedó pendiente (incluidos los pasos manuales en Supabase y Vercel).

## Cosas que NO hacer

- No borrar `src/data/lugares.json`.
- No cambiar el diseño visual general (colores, tipografía, logo) salvo que el sprint lo pida.
- No introducir comisiones, pagos ni anuncios (Vercel Hobby es solo para uso no comercial).
- No usar el chat heredado de Auren (`api/chat.ts`) para funciones nuevas.
