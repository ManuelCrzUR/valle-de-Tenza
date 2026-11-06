import { almacenSupabase } from '../server/almacen'
import { datosReciboDe, crearSolicitud } from '../server/solicitud'
import { enviarRecibo } from '../server/correo'
import { openaiConfig, resendConfig, supabaseConfig } from '../server/env'
import { crearLimite, ipCliente, json } from '../server/http'

const limitado = crearLimite({ max: 8, ventanaMs: 60 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiadas solicitudes desde esta red. Espera un rato.' }, 429)
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer la solicitud.' }, 400) }
  const sb = supabaseConfig()
  const correo = resendConfig()
  let almacen = null
  if (sb.configurado) {
    try { almacen = almacenSupabase() } catch { almacen = null }
  }
  const r = await crearSolicitud(cuerpo as never, {
    almacen,
    dominio: correo.dominio,
    enviar: almacen && correo.configurado
      ? async (fila) => enviarRecibo({
        fetchImpl: fetch,
        clave: correo.clave,
        desde: correo.desde,
        para: fila.correo,
        idempotencyKey: fila.outbox.idempotencyKey,
        datos: datosReciboDe(fila),
      })
      : undefined,
  })
  if (!r.ok) return json({ error: 'validacion', mensaje: r.error }, r.status)
  return json({ ...r.resultado, openaiConfigurado: openaiConfig().configurado })
}
