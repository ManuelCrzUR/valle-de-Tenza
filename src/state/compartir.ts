import { supabase } from '../lib/supabase'
import type { Eleccion } from './itinerario'

// Compartir un itinerario (RPC `compartir_itinerario` / `ver_itinerario`) y demanda anónima (`registrar_demanda`).
// Nada de esto guarda datos personales: solo la elección del itinerario.

export function enlaceDe(id: string) { return `${location.origin}${location.pathname}#/i/${id}` }

function mensaje(error: { message?: string } | null): string {
  const m = error?.message ?? ''
  if (/l[ií]mite/i.test(m)) return 'Llegaste al límite diario de enlaces. Intenta de nuevo mañana.'
  if (/fetch|network|failed/i.test(m) || !m) return 'No pudimos crear el enlace: parece que no hay conexión. Intenta de nuevo.'
  return 'No pudimos crear el enlace. Intenta de nuevo en un momento.'
}

/** Crea el enlace corto de un itinerario. Lanza un Error con texto listo para mostrar. */
export async function compartirItinerario(e: Eleccion): Promise<string> {
  if (!supabase) throw new Error('Compartir necesita conexión con el servidor, que ahora no está disponible.')
  let res
  try { res = await supabase.rpc('compartir_itinerario', { p_eleccion: e as never }) } catch (err) { throw new Error(mensaje(err as Error)) }
  if (res.error || typeof res.data !== 'string') throw new Error(mensaje(res.error))
  return enlaceDe(res.data)
}

/** Elección guardada bajo un id; null si no existe. Lanza si no hay conexión. */
export async function verItinerario(id: string): Promise<Eleccion | null> {
  if (!supabase) throw new Error('sin-servidor')
  const { data, error } = await supabase.rpc('ver_itinerario', { p_id: id })
  if (error) throw new Error(error.message)
  return data && typeof data === 'object' ? (data as unknown as Eleccion) : null
}

const registradas = new Set<string>()
/** Una vez por combinación y sesión. Fallos silenciosos (solo console.warn). */
export async function registrarDemanda(e: Eleccion, municipio: string) {
  if (!supabase) return
  const clave = [e.planId, municipio, e.dias, e.personas, e.fecha, e.movilidad ?? ''].join('|')
  if (registradas.has(clave)) return
  registradas.add(clave)
  try {
    const { error } = await supabase.rpc('registrar_demanda', {
      p_plan: e.planId, p_municipio: municipio || null, p_dias: e.dias, p_personas: e.personas, p_fecha_viaje: e.fecha || null, p_transporte: e.movilidad ?? null,
    })
    if (error) console.warn('No se registró la demanda:', error.message)
  } catch (err) { console.warn('No se registró la demanda:', err) }
}
