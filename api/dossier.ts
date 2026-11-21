import { htmlDossier, pdfDossier, validarEjemplo, type Dossier } from '../server/dossier.js'
import { vigente, huella, tokensSupabase } from '../server/descarga.js'
import { almacenSupabase } from '../server/almacen.js'
import { datosReciboDe } from '../server/solicitud.js'
import { supabaseConfig } from '../server/env.js'
import { cargadorFotos, sitioDe } from '../server/fotos-pdf.js'
import { json } from '../server/http.js'

export async function POST(request: Request): Promise<Response> {
  let cuerpo: { token?: unknown; ejemplo?: unknown; itinerario?: unknown; nombre?: unknown; fecha?: unknown; personas?: unknown; nota?: unknown }
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer el dossier.' }, 400) }
  if (typeof cuerpo.token === 'string' && cuerpo.token.length > 0) return json(await conToken(cuerpo.token, sitioDe(request)))
  if (cuerpo.ejemplo === true) return json(await deEjemplo(cuerpo, sitioDe(request)))
  return json({ error: 'solicitud_invalida', mensaje: 'Falta un enlace de descarga o el modo ejemplo.' }, 400)
}

async function deEjemplo(cuerpo: { itinerario?: unknown; nombre?: unknown; fecha?: unknown; personas?: unknown; nota?: unknown }, sitio: string) {
  const v = validarEjemplo({
    itinerario: cuerpo.itinerario,
    nombre: typeof cuerpo.nombre === 'string' ? cuerpo.nombre : '',
    fecha: typeof cuerpo.fecha === 'string' ? cuerpo.fecha : '',
    personas: typeof cuerpo.personas === 'number' ? cuerpo.personas : undefined,
    nota: typeof cuerpo.nota === 'string' ? cuerpo.nota : '',
  })
  if (!v.ok) return { error: 'validacion', mensaje: v.error, html: null, pdf: null }
  return empaquetar(v.dossier, sitio)
}

async function conToken(token: string, sitio: string) {
  if (!supabaseConfig().configurado) return { error: 'no_configurado', mensaje: 'Sin Supabase no hay dossier guardado. Usa el ejemplo.', html: null, pdf: null }
  const hash = await huella(token)
  const fila = await tokensSupabase().buscar(hash)
  if (!fila || !vigente(fila.expira)) return { error: 'enlace_vencido', mensaje: 'El enlace de descarga no sirve o ya venció.', html: null, pdf: null }
  const sol = await almacenSupabase().buscarPorId(fila.requestId)
  if (!sol) return { error: 'enlace_vencido', mensaje: 'No encontré esa solicitud.', html: null, pdf: null }
  return empaquetar(datosReciboDe(sol), sitio)
}

async function empaquetar(dossier: Dossier, sitio: string) {
  const html = htmlDossier(dossier, sitio)
  try {
    const pdf = await pdfDossier(dossier, { sitio, foto: cargadorFotos(sitio) })
    return {
      ejemplo: dossier.ejemplo,
      codigo: dossier.codigo,
      html,
      pdf: Buffer.from(pdf).toString('base64'),
      mensaje: dossier.ejemplo ? 'Ejemplo. No está guardado ni enviado.' : 'Dossier de la solicitud guardada. No es una reserva confirmada.',
    }
  } catch {
    return { ejemplo: dossier.ejemplo, codigo: dossier.codigo, html, pdf: null, mensaje: 'No pude generar el PDF. Puedes imprimir la versión HTML.' }
  }
}
