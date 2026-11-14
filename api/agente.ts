import { responderAgente } from '../server/agente.js'
import { crearLimite, ipCliente, json } from '../server/http.js'
import { TEXTO_MAX } from '../shared/constantes.js'

const limitado = crearLimite({ max: 30, ventanaMs: 10 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiadas preguntas seguidas. Espera unos minutos.' }, 429)
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer la petición.' }, 400) }
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { pregunta?: unknown; pagina?: unknown; gustos?: unknown }
  if (typeof c.pregunta !== 'string' || !c.pregunta.trim()) return json({ error: 'solicitud_invalida', mensaje: 'Escribe tu pregunta.' }, 400)
  if (c.pregunta.length > TEXTO_MAX) return json({ error: 'mensaje_largo', mensaje: `Máximo ${TEXTO_MAX} caracteres.` }, 400)
  const r = await responderAgente(
    { pregunta: c.pregunta, pagina: typeof c.pagina === 'string' ? c.pagina : undefined, gustos: c.gustos && typeof c.gustos === 'object' ? c.gustos : undefined },
    { signal: request.signal },
  )
  if (!r.ok) return json({ error: r.error, mensaje: r.mensaje, detalle: r.detalle, gustos: r.gustos, recomendaciones: r.recomendaciones }, r.status)
  return json(r.respuesta)
}
