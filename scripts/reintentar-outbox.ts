// Reintenta comprobantes ya guardados (pendiente o fallido, menos de 3 intentos).
// No es un endpoint público. Lee solo variables de servidor del entorno.
import { almacenSupabase } from '../server/almacen'
import { datosReciboDe, reintentarOutbox } from '../server/solicitud'
import { enviarRecibo } from '../server/correo'
import { resendConfig, supabaseConfig } from '../server/env'

const sb = supabaseConfig()
const correo = resendConfig()
if (!sb.configurado || !correo.configurado) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY o RESEND_FROM_EMAIL.')
  process.exit(1)
}

const r = await reintentarOutbox(almacenSupabase(), (fila) => enviarRecibo({
  fetchImpl: fetch,
  clave: correo.clave,
  desde: correo.desde,
  para: fila.correo,
  idempotencyKey: fila.outbox.idempotencyKey,
  datos: datosReciboDe(fila),
}))
console.log(`Reintentos: ${r.intentos}. Enviados: ${r.enviados}.`)
