import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe, reintentarComprobante } from '../server/solicitud.js'
import { enviarRecibo } from '../server/correo.js'
import { pdfDossier } from '../server/dossier.js'
import { tokensSupabase, vigente } from '../server/descarga.js'
import { resendConfig, supabaseConfig } from '../server/env.js'
import { crearLimite, ipCliente, json } from '../server/http.js'

const limitado = crearLimite({ max: 6, ventanaMs: 60 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiados reintentos desde esta red. La solicitud guardada no cambió.' }, 429)
  let cuerpo: { token?: unknown; correo?: unknown }
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer el reintento.' }, 400) }
  if (typeof cuerpo.token !== 'string' || cuerpo.token.length < 20 || cuerpo.token.length > 200) {
    return json({ error: 'enlace_vencido', mensaje: 'Falta el enlace de esta solicitud. No reenvié nada.' }, 403)
  }
  if (!supabaseConfig().configurado) {
    return json({ error: 'no_configurado', mensaje: 'Sin Supabase no hay una solicitud guardada que reintentar.' }, 503)
  }
  const correo = resendConfig()
  const r = await reintentarComprobante(cuerpo.token, {
    tokens: {
      async buscar(hash) {
        const fila = await tokensSupabase().buscar(hash)
        if (!fila || !vigente(fila.expira)) return null
        return fila
      },
    },
    almacen: almacenSupabase(),
    remitente: correo.configurado ? correo.desde : undefined,
    destinatarioPrueba: correo.destinatarioPrueba,
    enviar: correo.configurado
      ? async (fila) => {
        const datos = datosReciboDe(fila)
        let pdf: Uint8Array | null = null
        try { pdf = await pdfDossier(datos) } catch { pdf = null }
        return enviarRecibo({
          fetchImpl: fetch,
          clave: correo.clave,
          desde: correo.desde,
          para: fila.correo,
          idempotencyKey: fila.outbox.idempotencyKey,
          datos,
          pdf,
        })
      }
      : undefined,
  })
  if (!r.ok) return json({ error: r.error, mensaje: r.mensaje, comprobante: null, reenviado: false }, r.status)
  return json(r.resultado)
}
