// Reintenta comprobantes ya guardados (fallido, o pendiente con más de 10 minutos; menos de 3 intentos).
// No es un endpoint público. Lee solo variables de servidor del entorno.
import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe, reintentarOutbox } from '../server/solicitud.js'
import { depsAvisoDeEntorno, reintentarAvisos } from '../server/avisoNegocio.js'
import { enviarRecibo } from '../server/correo.js'
import { pdfDossier } from '../server/dossier.js'
import { cargadorFotos, sitioDe } from '../server/fotos-pdf.js'
import { resendConfig, supabaseConfig } from '../server/env.js'

const sb = supabaseConfig()
const correo = resendConfig()
if (!sb.configurado || !correo.configurado) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY o RESEND_FROM_EMAIL.')
  process.exit(1)
}

let fallo = false
try {
  const sitio = sitioDe()
  const r = await reintentarOutbox(almacenSupabase(), async (fila) => {
    const datos = datosReciboDe(fila)
    let pdf: Uint8Array | null = null
    try { pdf = await pdfDossier(datos, { sitio, foto: cargadorFotos(sitio) }) } catch { pdf = null }
    // Misma Idempotency-Key y mismo cuerpo (con PDF) que /api/solicitudes y /api/reintento.
    return enviarRecibo({
      fetchImpl: fetch,
      clave: correo.clave,
      desde: correo.desde,
      para: fila.correo,
      idempotencyKey: fila.outbox.idempotencyKey,
      datos,
      pdf,
    })
  }, 20, { remitente: correo.desde, destinatarioPrueba: correo.destinatarioPrueba })
  console.log(`Reintentos: ${r.intentos}. Enviados: ${r.enviados}. Omitidos: ${r.omitidos}. Con error: ${r.errores}.`)
} catch (e) {
  fallo = true
  console.error('Falló el reintento de comprobantes:', e instanceof Error ? e.message : 'error')
}

// Los avisos a negocios se reintentan aunque lo anterior haya fallado.
try {
  const deps = depsAvisoDeEntorno()
  if (deps) {
    const a = await reintentarAvisos(deps)
    console.log(`Avisos a negocios reintentados: ${a.intentados}. Enviados: ${a.enviados}.`)
  }
} catch (e) {
  fallo = true
  console.error('Falló el reintento de avisos:', e instanceof Error ? e.message : 'error')
}
if (fallo) process.exit(1)
