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

## Reintento del comprobante

`POST /api/reintento` recibe solo `{ token }`, el mismo enlace de descarga de dos horas. No acepta un correo nuevo. Si el enlace sigue vigente, reenvía esa solicitud con el snapshot y el destinatario ya guardados, y con el remitente que haya ahora en el servidor. Si el comprobante ya figura como enviado, no llama otra vez. Dos clics a la vez solo dejan pasar uno. Sin ese enlace, una fila vieja no se puede reintentar desde la pantalla: el navegador no guardaba el token y el hash de la base no se puede invertir.

## Correo

La solicitud se guarda antes de intentar el envío. Si el remitente es `@resend.dev` y el correo del formulario no es `RESEND_SANDBOX_RECIPIENT`, no se llama a Resend y el estado queda `bloqueado_dominio`. El destinatario del formulario no se reemplaza.

## Cabecera

`src/components/Layout.tsx` solo suma, dentro de `.appbar-in` y después de `.topnav`, un `<nav className="cuenta-nav">` con «Soy prestador» y «Iniciar sesión» (o «Mi panel» si hay sesión). El estilo vive en `src/styles/prestador.css`. El comentario que sigue a `</header>` marca el sitio del `<Agente />`: hermano del header, sin envolver `appbar`, `Outlet` ni `cuenta-nav`.

## Qué no se tocó a propósito

Otro cambio, en otra rama, agrega el asistente flotante. Ese cambio original no creaba archivos bajo `src/components/agente/`, `src/styles/agente.css`, `src/data/agente.ts`, `api/agente.ts`, `server/agente.ts` ni `docs/agente.md`.

Se conservan las firmas que ese asistente importa: `crearLimite`, `ipCliente` y `json`; `openaiConfig`; `sinDatosPersonales`; `buscarLugares`; y los exports `MUNICIPIOS`, `CATEGORIAS` y `getLugar`.

En `/plan` siguen `plan-asistente` y `plan-resultado`. El formulario de solicitud ahora tiene `id="plan-solicitud"`. El enlace de una empresa publicada abre `/plan` sin `?texto=`: ese prefill queda para el otro cambio.

Los estilos del panel están en `src/styles/prestador.css`.

## Ficha y solicitudes

Desde el panel, el negocio completa:

- **Contacto**, con un interruptor de publicación. Apagado, el teléfono y el correo no salen en la ficha pública.
- **Horario**, con el cálculo de «abierto ahora» en hora de Bogotá.
- **Precios**, con fecha de verificación visible.
- **Menú en PDF**, máximo 5 MB.
- **Redes** y **servicios**.
- **Correo privado para avisos**: recibe el aviso de cada solicitud con consentimiento. Nunca se muestra en la vista pública (`businesses_public`).
- **Avisos push**: el botón «Activar avisos en este dispositivo». Cada dispositivo se activa aparte.

La pestaña **Solicitudes recibidas** lista solo las solicitudes de viajeros que marcaron la casilla de compartir datos. El negocio ve nombre, teléfono, correo, fecha, personas y nota. Las solicitudes sin consentimiento no aparecen.
