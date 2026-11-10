// Reintenta comprobantes ya guardados (pendiente o fallido, menos de 3 intentos).
// No es un endpoint público. Lee solo variables de servidor del entorno.
import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe, reintentarOutbox } from '../server/solicitud.js'
import { depsAvisoDeEntorno, reintentarAvisos } from '../server/avisoNegocio.js'
import { enviarRecibo } from '../server/correo.js'
import { resendConfig, supabaseConfig } from '../server/env.js'

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

const deps = depsAvisoDeEntorno()
if (deps) {
  const a = await reintentarAvisos(deps)
  console.log(`Avisos a negocios reintentados: ${a.intentados}. Enviados: ${a.enviados}.`)
}
