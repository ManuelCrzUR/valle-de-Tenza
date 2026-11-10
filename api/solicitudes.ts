import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe, crearSolicitud } from '../server/solicitud.js'
import { enviarRecibo } from '../server/correo.js'
import { pdfDossier } from '../server/dossier.js'
import { cargadorFotos, sitioDe } from '../server/fotos-pdf.js'
import { nuevoToken, tokensSupabase } from '../server/descarga.js'
import { openaiConfig, resendConfig, supabaseConfig } from '../server/env.js'
import { avisarNegocios, depsAvisoDeEntorno } from '../server/avisoNegocio.js'
import { listarPublicadas } from '../server/empresas.js'
import { crearLimite, ipCliente, json } from '../server/http.js'

const limitado = crearLimite({ max: 8, ventanaMs: 60 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiadas solicitudes desde esta red. Espera un rato.' }, 429)
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer la solicitud.' }, 400) }
  const sb = supabaseConfig()
  const correo = resendConfig()
  const sitio = sitioDe(request)
  let almacen = null
  if (sb.configurado) {
    try { almacen = almacenSupabase() } catch { almacen = null }
  }
  // Negocios publicados reales: los business:<uuid> del cliente solo valen si están aquí. Sin Supabase, ninguno.
  const empresas = sb.configurado ? await listarPublicadas() : []
  const r = await crearSolicitud(cuerpo as never, {
    almacen,
    empresas,
    dominio: correo.dominio,
    enviar: almacen && correo.configurado
      ? async (fila) => {
        const datos = datosReciboDe(fila)
        let pdf: Uint8Array | null = null
        try { pdf = await pdfDossier(datos, { sitio, foto: cargadorFotos(sitio) }) } catch { pdf = null }
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
  if (!r.ok) return json({ error: r.codigo ?? 'validacion', mensaje: r.error }, r.status)
  let descarga: { token: string; expira: string } | null = null
  if (r.resultado.nueva && r.resultado.persistido && r.resultado.id && sb.configurado) {
    try {
      const t = await nuevoToken()
      await tokensSupabase().guardar(t.hash, r.resultado.id, t.expira)
      descarga = { token: t.token, expira: t.expira }
    } catch { descarga = null }
  }
  let negociosAvisados = 0
  const depsAviso = depsAvisoDeEntorno()
  if (r.resultado.nueva && r.resultado.persistido && r.resultado.id && almacen && depsAviso) {
    // Después de guardar; nunca bloquea ni rompe la solicitud. Tope de ~8 s.
    try {
      const fila = await almacen.buscarPorId(r.resultado.id)
      if (fila?.comparteDatos) {
        const directo = typeof (cuerpo as { negocio?: unknown })?.negocio === 'string' ? (cuerpo as { negocio: string }).negocio : null
        let t: ReturnType<typeof setTimeout> | undefined
        const espera = new Promise<{ negocios: number }>((res) => { t = setTimeout(() => res({ negocios: 0 }), 8000) })
        try { negociosAvisados = (await Promise.race([avisarNegocios(fila, depsAviso, directo), espera])).negocios } finally { clearTimeout(t) }
      }
    } catch { negociosAvisados = 0 }
  }
  return json({ ...r.resultado, negociosAvisados, descarga, openaiConfigurado: openaiConfig().configurado })
}
