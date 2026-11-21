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

## Confirmación y recuperación de contraseña

- **Crear cuenta** envía un correo de confirmación. Su enlace abre `/#/prestadores/confirmar`, que valida el `token_hash` con `verifyOtp` y muestra «Confirmamos tu correo». También acepta el enlace heredado con `#access_token`.
- **Reenviar correo** tiene 60 s de espera y responde igual exista o no la cuenta.
- **¿Olvidaste tu contraseña?** (en «Iniciar sesión») envía un correo. Su enlace abre `/#/prestadores/confirmar?type=recovery` y de ahí `/#/prestadores/clave-nueva`. La respuesta es neutral: no dice si el correo tiene cuenta.
- Las plantillas están en `supabase/templates/confirmacion.html` y `supabase/templates/recuperacion.html`. Los pasos del dashboard, en [configuracion-mvp.md](configuracion-mvp.md#9-correos-de-cuenta-supabase-auth).

## Borrar un negocio

En el panel, **Borrar negocio** pide escribir el nombre del negocio para confirmar. Después:

- **Se borra** la ficha (`businesses`) con lo que cuelga de ella: precios, fotos, enlaces a solicitudes (`request_businesses`) y avisos pendientes a ese negocio (`notification_outbox`).
- **Se borran** sus archivos en Storage: `business-photos` y `business-menus`, en la carpeta del titular. Si Storage falla, la fila se borra igual y el panel lo avisa.
- **No se borra** la cuenta de acceso, ni otros negocios, ni las solicitudes de viajeros. El negocio deja de verlas, porque su enlace en `request_businesses` desaparece.

## Eliminar la cuenta

«Eliminar mi cuenta» (zona de peligro del panel) llama a `POST /api/cuenta` con el token de sesión en `Authorization: Bearer`. El servidor:

1. Valida el token en Supabase Auth y obtiene el id del usuario. No lee ningún id del cuerpo de la petición.
2. Borra los archivos de `business-photos` y `business-menus` de ese usuario.
3. Borra el usuario en Auth. Si Storage falla, no borra el usuario y se puede reintentar.

Al borrar el usuario caen en cascada su perfil, sus negocios y todo lo que cuelga de ellos, y sus suscripciones push.

**Las solicitudes de viajeros no se borran al eliminar la cuenta.** Siguen en `reservation_requests` con su comprobante hasta la purga de 12 meses (`purgar_solicitudes()`, en la migración `005`). El negocio deja de verlas.

Requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el servidor. Sin ellas responde 503 y no borra nada. Tiene un límite de 5 intentos por hora y red.
