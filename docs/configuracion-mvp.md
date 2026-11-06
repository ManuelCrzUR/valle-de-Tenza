# Configuración del MVP de clase

El navegador no lleva claves. Sin las variables de servidor, la app sigue demostrable y lo dice: el plan sale del catálogo, la solicitud no se guarda y el correo no se envía. No afirmes un envío real hasta ver el estado `enviado` con las claves puestas.

## 1. Supabase

1. Crea un proyecto en Supabase (la región la eliges tú).
2. En el SQL editor, pega y ejecuta `supabase/migrations/001_class_mvp.sql`.
3. Esa migración crea `itineraries`, `reservation_requests` y `email_outbox`, activa RLS y **revoca** todo permiso a `anon` y `authenticated`. Solo la función `crear_solicitud` puede insertar, y solo `service_role` puede ejecutarla.
4. Copia en el servidor (nunca en una variable `VITE_`):
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role, no la anon key)

Comprobación: en el SQL editor, `select * from reservation_requests` como rol `anon` debe fallar por permisos.

## 2. Vercel

El sitio ya está en Vercel. Este cambio no se despliega solo.

En *Settings → Environment Variables* agrega los nombres de `.env.example`. No marques ninguna como expuesta al cliente. Redeploy cuando quieras publicar; hasta entonces producción sigue en la versión anterior.

En local: copia `.env.example` a `.env.local`, completa lo que tengas y corre `npm run dev`. Vite sirve `/api/*` con las mismas funciones.

## 3. OpenAI

Documentación usada (6 nov 2026):

| Uso | Variable | Id por defecto | Endpoint |
| --- | --- | --- | --- |
| Itinerario | `OPENAI_ITINERARY_MODEL` | `gpt-6-luna` | `POST /v1/responses` |
| Transcripción | `OPENAI_TRANSCRIBE_MODEL` | `gpt-transcribe` | `POST /v1/audio/transcriptions` |
| Voz opcional | `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | `POST /v1/audio/speech` |

La voz `coral` (`OPENAI_TTS_VOICE`) es una de las voces del endpoint de speech. La pantalla dice que es voz sintética y solo suena si la persona pulsa «Escuchar». Se puede detener.

`gpt-4o-mini-tts` está deprecado y se apaga el 6 de enero de 2027. El modelo de realtime no reemplaza este endpoint. Cuando cambie la guía oficial, ajusta `OPENAI_TTS_MODEL`.

El audio del micrófono se corta a 45 s y a 3,5 MB, por debajo del cuerpo de 4,5 MB de las Vercel Functions. No se reenvían 25 MB a OpenAI.

El modelo solo recibe texto sin correos ni teléfonos, y una lista de ids del catálogo. El servidor descarta cualquier id que no exista. Guateque, Garagoa, Macanal y otras ciudades fuera de los 7 municipios se rechazan en lugar de inventar un lugar.

## 4. Resend

1. Verifica un dominio en Resend (o usa el remitente de prueba de la cuenta, que solo entrega al correo de esa cuenta).
2. `RESEND_API_KEY` y `RESEND_FROM_EMAIL` (por ejemplo `Valle Directo <planes@tu-dominio>`).
3. Opcional: `RESEND_ALLOWED_DOMAIN=colegio.edu.co` para rechazar otros destinatarios.

Cada solicitud guardada tiene una fila en `email_outbox`. Un envío usa la clave `recibo:<id>` también como `Idempotency-Key` de Resend. El estado distingue:

- solicitud `recibida` (guardada; no significa reserva)
- comprobante `pendiente`, `enviado`, `fallido` u `omitido_sin_configuracion`

No hay botón público para reenviar. Con las claves cargadas:

```
npm run reintentar-correo
```

Eso reintenta filas `pendiente` o `fallido` con menos de 3 intentos. Los tests no llaman a Resend ni a OpenAI ni a Supabase reales.

## 5. Qué no hace esta versión

No cobra, no escribe por WhatsApp, no confirma cupo y no traza una ruta de carretera. La línea del mapa es un esquema entre coordenadas del catálogo.
