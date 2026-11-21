import { vapidConfig } from '../server/env.js'
import { json } from '../server/http.js'

// Solo la clave pública VAPID, que el navegador necesita para suscribirse. Nunca la privada.
export function GET(): Response {
  const v = vapidConfig()
  if (!v.configurado) return json({ error: 'no_configurado' }, 503)
  return json({ clave: v.publica })
}
