# Cuentas de prestadores

Quien viaja no inicia sesión. Quien publica un negocio usa Supabase Auth (correo y contraseña) en `/#/prestadores`. La contraseña no se guarda en `localStorage`.

## Migración

`supabase/migrations/003_perfiles_empresas.sql`

Crea `profiles`, `businesses` y `business_photos`, políticas RLS y el bucket público `business-photos` (escritura solo en la carpeta del titular). Amplía los estados de `email_outbox` con `bloqueado_dominio`. No reescribe `001` ni `002`.

Hay que aplicarla en el proyecto antes de que el panel guarde. Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` el panel lo dice y no inventa una sesión.

## Ids

- Un lugar del JSON sigue respondiendo a su id viejo. `place:<id>` es el mismo lugar.
- Una empresa publicada usa `business:<uuid>`.
- `getLugar` no resuelve `business:`. `buscarLugares` sigue siendo síncrono y solo del JSON. Las empresas entran por `listarPublicadas` y `validarPropuesta(..., empresas)`, sin cambiar la firma de `buscarLugares`.

## Correo

La solicitud se guarda antes de intentar el envío. Si el remitente es `@resend.dev` y el correo del formulario no es `RESEND_SANDBOX_RECIPIENT`, no se llama a Resend y el estado queda `bloqueado_dominio`. El destinatario del formulario no se reemplaza.

## Qué no se tocó a propósito

Otro cambio, en otra rama, agrega el asistente flotante. Este trabajo no edita `src/components/Layout.tsx` ni `src/styles/plan.css`, ni crea archivos bajo `src/components/agente/`, `src/styles/agente.css`, `src/data/agente.ts`, `api/agente.ts`, `server/agente.ts` ni `docs/agente.md`.

Se conservan las firmas que ese asistente importa: `crearLimite`, `ipCliente` y `json`; `openaiConfig`; `sinDatosPersonales`; `buscarLugares`; y los exports `MUNICIPIOS`, `CATEGORIAS` y `getLugar`.

En `/plan` siguen `plan-asistente` y `plan-resultado`. El formulario de solicitud ahora tiene `id="plan-solicitud"`. El enlace de una empresa publicada abre `/plan` sin `?texto=`: ese prefill queda para el otro cambio.

Los estilos del panel están en `src/styles/prestador.css`.
