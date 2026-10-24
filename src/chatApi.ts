import { cupoLibre } from './state/reservas'
import type { Operacion } from './state/reservas'
import type { Alerta } from './state/logistica'
import type { EventoValle } from './data/asistente'

export type ErrorChat = 'limite' | 'no_disponible'

export class ChatError extends Error {
  constructor(public tipo: ErrorChat) { super(tipo) }
}

/** Contexto mínimo para Auren: sin datos personales (ni nombres, ni contactos, ni reservas), solo cifras agregadas y avisos públicos. */
export interface ContextoAuren {
  generado: string
  cuposLibres: { negocio: string; municipio: string; fecha: string; libres: number }[]
  alertasVigentes: { municipio: string | null; tipo: string; mensaje: string }[]
  eventosSemana: { nombre: string; municipio: string; desde: string; hasta: string | null }[]
}
export function construirContextoAuren(op: Operacion, alertas: Alerta[], eventos: EventoValle[], dias = 3, ahora = new Date()): ContextoAuren {
  const fechas = Array.from({ length: dias }, (_, i) => { const d = new Date(ahora); d.setDate(d.getDate() + i); return d.toLocaleDateString('en-CA') })
  return {
    generado: ahora.toISOString(),
    cuposLibres: op.negocios.flatMap((n) => fechas.map((fecha) => ({ negocio: n.nombre, municipio: n.municipio, fecha, libres: cupoLibre(op, n, fecha) }))),
    alertasVigentes: alertas.map((a) => ({ municipio: a.municipio, tipo: a.tipo, mensaje: a.mensaje })),
    eventosSemana: eventos.map((e) => ({ nombre: e.nombre, municipio: e.municipio, desde: e.desde, hasta: e.hasta })),
  }
}

// Llama a /api/chat (función de Vercel). Sin ese backend, por ejemplo en GitHub Pages, lanza 'no_disponible'.
export async function preguntar(mensaje: string, signal?: AbortSignal, contexto?: ContextoAuren): Promise<string> {
  let r: Response
  try {
    r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contexto ? { mensaje, contexto } : { mensaje }), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ChatError('no_disponible')
  }
  if (r.status === 429) throw new ChatError('limite')
  if (!r.ok) throw new ChatError('no_disponible')
  const data = (await r.json().catch(() => null)) as { respuesta?: string } | null
  if (!data?.respuesta) throw new ChatError('no_disponible')
  return data.respuesta
}
