import { armarItinerario } from '../server/itinerario.js'
import { crearLimite, ipCliente, json } from '../server/http.js'
import { TEXTO_MAX } from '../shared/constantes.js'

const limitado = crearLimite({ max: 20, ventanaMs: 10 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiadas generaciones seguidas. Espera unos minutos.' }, 429)
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer la petición.' }, 400) }
  const c = cuerpo as { mensaje?: unknown; chips?: unknown; itinerario?: unknown; anclar?: unknown }
  if (c.mensaje != null && typeof c.mensaje !== 'string') return json({ error: 'solicitud_invalida', mensaje: 'El mensaje debe ser texto.' }, 400)
  if (typeof c.mensaje === 'string' && c.mensaje.length > TEXTO_MAX) return json({ error: 'mensaje_largo', mensaje: `Máximo ${TEXTO_MAX} caracteres.` }, 400)
  const r = await armarItinerario({
    mensaje: typeof c.mensaje === 'string' ? c.mensaje : '',
    anclar: typeof c.anclar === 'string' ? c.anclar : undefined,
    chips: c.chips && typeof c.chips === 'object' ? c.chips as { plan?: string; municipio?: string; dias?: number; quitar?: string } : undefined,
    itinerario: c.itinerario && typeof c.itinerario === 'object' ? c.itinerario as { plan?: string; municipio?: string; dias?: { paradas?: string[]; comida?: string | null }[]; hospedaje?: string | null } : undefined,
  }, { signal: request.signal })
  if (!r.ok) return json({ error: r.error, mensaje: r.mensaje, detalle: r.detalle, ref: r.ref }, r.status)
  return json({ itinerario: r.itinerario })
}
