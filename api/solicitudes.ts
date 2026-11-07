import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe, crearSolicitud } from '../server/solicitud.js'
import { enviarRecibo } from '../server/correo.js'
import { pdfDossier } from '../server/dossier.js'
import { nuevoToken, tokensSupabase } from '../server/descarga.js'
import { openaiConfig, resendConfig, supabaseConfig } from '../server/env.js'
import { crearLimite, ipCliente, json } from '../server/http.js'

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
    remitente: correo.configurado ? correo.desde : undefined,
    destinatarioPrueba: correo.destinatarioPrueba,
  })
  if (!r.ok) return json({ error: 'validacion', mensaje: r.error }, r.status)
  let descarga: { token: string; expira: string } | null = null
  if (r.resultado.nueva && r.resultado.persistido && r.resultado.id && sb.configurado) {
    try {
      const t = await nuevoToken()
      await tokensSupabase().guardar(t.hash, r.resultado.id, t.expira)
      descarga = { token: t.token, expira: t.expira }
    } catch { descarga = null }
  }
  return json({ ...r.resultado, descarga, openaiConfigurado: openaiConfig().configurado })
}
