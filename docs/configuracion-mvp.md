# Configuración del MVP de clase

El navegador no lleva claves. Sin las variables de servidor, la app sigue demostrable y lo dice: el plan sale del catálogo, la solicitud no se guarda y el correo no se envía. No afirmes un envío real hasta ver el estado `enviado` con las claves puestas.

## 1. Supabase

1. Crea un proyecto en Supabase (la región la eliges tú).
2. En el SQL editor, pega y ejecuta `supabase/migrations/001_class_mvp.sql`.
3. Esa migración crea `itineraries`, `reservation_requests` y `email_outbox`, activa RLS y **revoca** todo permiso a `anon` y `authenticated`. Solo la función `crear_solicitud` puede insertar, y solo `service_role` puede ejecutarla.
4. Copia en el servidor (nunca en una variable `VITE_`):
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role, no la anon key)

La clave publicable del panel de prestadores es otra cosa y va en la sección 8. No sustituye a la service role ni abre estas tablas de solicitudes: siguen revocadas para `anon` y `authenticated`.

Comprobación: en el SQL editor, `select * from reservation_requests` como rol `anon` debe fallar por permisos.

## 2. Vercel

El sitio ya está en Vercel. Este cambio no se despliega solo.

En *Settings → Environment Variables* agrega los nombres de `.env.example`. No marques ninguna como expuesta al cliente. Redeploy cuando quieras publicar; hasta entonces producción sigue en la versión anterior.

En local: copia `.env.example` a `.env.local`, completa lo que tengas y corre `npm run dev`. Vite sirve `/api/*` con las mismas funciones.

### Enlace público (sin login)

Si el sitio pide iniciar sesión, está activa la *Deployment Protection* de Vercel (Vercel Authentication).

1. En vercel.com abre el proyecto → *Settings* → *Deployment Protection*.
2. En *Vercel Authentication* elige **Disabled** → *Save*.
3. Comparte el dominio de producción (`<proyecto>.vercel.app` o el dominio propio), no la URL de un preview (`<proyecto>-<hash>-<equipo>.vercel.app`): cada preview es una URL distinta.

Comprobación: abre el enlace en una ventana privada. Debe cargar sin pedir cuenta de Vercel.

Nota: *Password Protection* es de planes pagos; en Hobby no se usa. Quitar la protección no expone claves: las variables de servidor nunca llegan al navegador.

## 3. OpenAI

Ids comprobados el 6 de noviembre de 2026 en la documentación oficial. Si esa página cambia, pon el id nuevo en la variable; no inventes otro nombre en el código.

| Uso | Variable | Id por defecto | Fuente |
| --- | --- | --- | --- |
| Itinerario | `OPENAI_ITINERARY_MODEL` | `gpt-6-luna` | [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): Model ID `gpt-6-luna`, Responses `v1/responses` supported, structured outputs y function calling. No hace transcripción ni voz. |
| Transcripción | `OPENAI_TRANSCRIBE_MODEL` | `gpt-transcribe` | [GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe): Model ID `gpt-transcribe`, Transcription `v1/audio/transcriptions` supported. |
| Voz opcional | `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech): el ejemplo de `POST /v1/audio/speech` usa `gpt-4o-mini-tts` y la voz `coral`. La misma página dice que `tts-1`, `tts-1-hd` y `gpt-4o-mini-tts` se apagan el 6 de enero de 2027, y que `gpt-realtime-2.1-mini` no sirve para `/v1/audio/speech`. |

La voz `coral` (`OPENAI_TTS_VOICE`) es la del ejemplo oficial de ese endpoint. La pantalla dice que es voz sintética y solo suena si la persona pulsa «Escuchar». Se puede detener.

El audio del micrófono se corta a 45 s y a 3,5 MB, por debajo del cuerpo de 4,5 MB de las Vercel Functions. No se reenvían 25 MB a OpenAI.

El modelo solo recibe texto sin correos ni teléfonos, y una lista de ids del catálogo. El servidor descarta cualquier id que no exista. Guateque, Garagoa, Macanal y otras ciudades fuera de los 7 municipios se rechazan en lugar de inventar un lugar.

## 4. Resend

1. Verifica un dominio en Resend (o usa el remitente de prueba de la cuenta, que solo entrega al correo de esa cuenta).
2. `RESEND_API_KEY` y `RESEND_FROM_EMAIL` (por ejemplo `Valle Directo <planes@tu-dominio>`).
3. Opcional: `RESEND_ALLOWED_DOMAIN=colegio.edu.co` para rechazar otros destinatarios.

Cada solicitud guardada tiene una fila en `email_outbox`. Un envío usa la clave `recibo:<id>` también como `Idempotency-Key` de Resend. El estado distingue:

- solicitud `recibida` (guardada; no significa reserva)
- comprobante `pendiente`, `enviado`, `fallido`, `omitido_sin_configuracion` o `bloqueado_dominio`

Si `RESEND_FROM_EMAIL` es `onboarding@resend.dev` (o cualquier `@resend.dev`), el servidor solo envía cuando el correo del formulario es exactamente `RESEND_SANDBOX_RECIPIENT`. Si no coincide, guarda la solicitud, marca `bloqueado_dominio` y no cambia el destinatario. No afirma un envío.

No hay botón público para reenviar. Con las claves cargadas:

```
npm run reintentar-correo
```

Eso reintenta filas `pendiente` o `fallido` con menos de 3 intentos. Los tests no llaman a Resend ni a OpenAI ni a Supabase reales.

## 5. Dossier

Si ya ejecutaste la primera migración, corre también `supabase/migrations/002_dossier_tokens.sql`. Ahí solo se guarda la huella del enlace de descarga, durante dos horas, y la clave anónima no puede leerla. El PDF del correo es el mismo archivo que esa descarga. No hay variables nuevas.

Sin Supabase, la pantalla ofrece un **ejemplo** marcado «EJEMPLO / no guardada / no enviada». No es un envío.

## 6. Mapa en relieve

El recorrido guiado es 2D con Leaflet. Un terreno 3D con MapLibre quedaría para más adelante: haría falta un estilo y un modelo de elevación con licencia clara, y la clave de OpenAI no trae ese mapa. No hay un relieve simulado.

## 7. Qué no hace esta versión

No cobra, no escribe por WhatsApp, no confirma cupo y no traza una ruta de carretera. La línea del mapa es un esquema entre coordenadas del catálogo.

## 8. Cuentas de prestadores

Migración nueva, sin tocar `001` ni `002`: `supabase/migrations/003_perfiles_empresas.sql`. Quien opera el proyecto la ejecuta en el SQL editor. Esta app no crea usuarios ni lee secretos.

Variables nuevas, sin valores en el repositorio:

- `VITE_SUPABASE_URL` — la misma URL del proyecto, visible en el build del navegador.
- `VITE_SUPABASE_ANON_KEY` — clave publicable (anon). El navegador la usa para Auth, el panel y las fotos. RLS limita cada negocio a su titular; un borrador no es público.
- `RESEND_SANDBOX_RECIPIENT` — ya descrita en la sección 4.

Rutas: `/#/prestadores`, `/#/prestadores/entrar`, `/#/prestadores/panel`. El enlace está en el inicio. La barra de navegación no se tocó en este cambio. El detalle de ids, correo y archivos que no se editan está en [cuentas-prestadores.md](cuentas-prestadores.md).

## Avisos al negocio

Migraciones, en orden: `supabase/migrations/004_ficha_negocio.sql` y luego `005_solicitudes_negocio.sql`. **Aplica la 004 antes de desplegar.** `GET /api/negocios` lee la vista `businesses_public`; sin ella, la ficha falla.

Reglas:

- La solicitud llega al negocio solo si el viajero marca la casilla «Comparto mi nombre, teléfono y correo…». Desmarcada, la solicitud se guarda y no sale ningún dato hacia los negocios.
- El aviso no lleva datos personales del viajero: ni nombre, ni teléfono, ni correo.
- `POST /api/solicitudes` responde `negociosAvisados` con el número de negocios del plan que recibieron el aviso. No significa que respondieron ni que hay cupo.

Canal correo (Resend):

- Necesita un dominio verificado para escribir a cualquier negocio. Con remitente `@resend.dev` solo entrega al correo de la cuenta (`RESEND_SANDBOX_RECIPIENT`).
- Con `@resend.dev` y otro destinatario, la fila queda `bloqueado_dominio` en `notification_outbox`. No se cambia el destinatario.
- Reintento de los pendientes o fallidos, con las claves cargadas: `npm run reintentar-correo`.

Canal push (gratis):

1. Genera las llaves una vez: `npx web-push generate-vapid-keys`.
2. Carga `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (un `mailto:`) y `SITE_URL` en Vercel. La privada no va a una variable `VITE_`.
3. `GET /api/avisos-clave` entrega solo la pública.
4. El negocio entra al panel y pulsa «Activar avisos en este dispositivo». Cada dispositivo se activa por separado.
5. En iPhone, las notificaciones web solo funcionan si la app está agregada a la pantalla de inicio.

Retención: `005_solicitudes_negocio.sql` define `purgar_solicitudes()`, que borra las solicitudes de más de 12 meses junto con sus filas de correo y enlaces de descarga. Si `pg_cron` está disponible, la migración la programa a diario (`purgar-solicitudes`, 08:15 UTC). Si no, hay que programarla a mano con `select public.purgar_solicitudes();`.
