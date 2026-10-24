// Reseñas post-viaje (0006_resenas.sql). El viajero no tiene cuenta: reseña con código + teléfono por `rpc`.
// Lo público sale de vistas que solo traen reseñas visibles y nunca nombre ni contacto del viajero.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Resultado } from './reservas'

export interface Resena { id: string; negocioId: string | null; lugarId: string | null; calificacion: number; comentario: string; creada: string }
export interface ResenaModeracion extends Resena { negocioNombre: string; visible: boolean }
export interface ResumenLugar { promedio: number; total: number }
export interface ReservaParaResena { reservaId: string; codigo: string; negocioId: string | null; nombre: string; contacto: string; fecha: string }
export interface Pendiente { puede: boolean; motivo: string; negocioNombre: string; fecha: string }

const SIN_CONEXION: Resultado = { ok: false, error: 'Sin conexión: por ahora no se pueden enviar reseñas.' }
const MAX_COMENTARIO = 1000
export { MAX_COMENTARIO }

/** «4,5 de 5 · 2 reseñas» */
export const textoPromedio = (r: ResumenLugar) => `${r.promedio.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 5 · ${r.total} ${r.total === 1 ? 'reseña' : 'reseñas'}`

interface Carga<T> { datos: T; cargando: boolean; error: string; recargar: () => void }
function useCarga<T>(vacio: T, cargar: () => Promise<T>, clave: string, mensaje: string): Carga<T> {
  const [e, setE] = useState<{ datos: T; cargando: boolean; error: string }>({ datos: vacio, cargando: !!supabase, error: '' })
  const [n, setN] = useState(0)
  const recargar = useCallback(() => setN((x) => x + 1), [])
  useEffect(() => {
    if (!supabase) { setE({ datos: vacio, cargando: false, error: '' }); return }
    let vivo = true
    cargar().then(
      (datos) => { if (vivo) setE({ datos, cargando: false, error: '' }) },
      () => { if (vivo) setE({ datos: vacio, cargando: false, error: mensaje }) },
    )
    return () => { vivo = false }
    // `cargar` cambia en cada render; la clave resume lo que la distingue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, n])
  return { ...e, recargar }
}

/** Reseñas visibles de un lugar (las últimas 5) y su promedio. Sin reseñas: `resumen` es undefined y no se muestra nada. */
export function useResenasLugar(lugarId: string | undefined): { resenas: Resena[]; resumen?: ResumenLugar; cargando: boolean } {
  const c = useCarga<{ resenas: Resena[]; resumen?: ResumenLugar }>({ resenas: [] }, async () => {
    if (!lugarId) return { resenas: [] }
    const [r, p] = await Promise.all([
      supabase!.from('resenas_publicas').select('id,negocio_id,lugar_id,calificacion,comentario,creada').eq('lugar_id', lugarId).order('creada', { ascending: false }).limit(5),
      supabase!.from('calificacion_lugares').select('promedio,total').eq('lugar_id', lugarId).maybeSingle(),
    ])
    if (r.error || p.error) throw r.error ?? p.error
    const resumen = p.data?.promedio != null && p.data.total ? { promedio: Number(p.data.promedio), total: p.data.total } : undefined
    return { resenas: resumen ? r.data.map(aResena) : [], resumen }
  }, lugarId ?? '', '')
  return { ...c.datos, cargando: c.cargando }
}

const aResena = (f: { id: string; negocio_id: string | null; lugar_id: string | null; calificacion: number; comentario: string | null; creada: string }): Resena =>
  ({ id: f.id, negocioId: f.negocio_id, lugarId: f.lugar_id, calificacion: f.calificacion, comentario: f.comentario ?? '', creada: f.creada })

/** Reservas confirmadas ya terminadas y sin reseña (solo las del prestador, por RLS). */
export function useReservasParaResena(): Carga<ReservaParaResena[]> {
  return useCarga<ReservaParaResena[]>([], async () => {
    const { data, error } = await supabase!.from('reservas_para_resena').select('reserva_id,codigo,negocio_id,nombre,contacto,fecha').order('fecha', { ascending: false })
    if (error) throw error
    return data.map((f) => ({ reservaId: f.reserva_id, codigo: f.codigo, negocioId: f.negocio_id, nombre: f.nombre, contacto: f.contacto, fecha: f.fecha }))
  }, 'para-resena', 'No pudimos cargar las reservas para reseñar. Revisa tu conexión.')
}

const nombreNegocio = (n: unknown): string => (Array.isArray(n) ? n[0] : (n as { nombre?: string } | null))?.nombre ?? 'Negocio'

/** Todas las reseñas que la sesión puede ver: las de sus negocios (prestador) o todas (coordinador), con su nombre de negocio. */
export function useResenasModeracion(): Carga<ResenaModeracion[]> {
  return useCarga<ResenaModeracion[]>([], async () => {
    const { data, error } = await supabase!.from('resenas').select('id,negocio_id,lugar_id,calificacion,comentario,creada,visible,negocios(nombre)').order('creada', { ascending: false })
    if (error) throw error
    return data.map((f) => ({ ...aResena(f), visible: f.visible, negocioNombre: nombreNegocio(f.negocios) }))
  }, 'moderacion', 'No pudimos cargar las reseñas. Revisa tu conexión.')
}

export async function resenaPendiente(codigo: string, contacto: string): Promise<Resultado & { pendiente?: Pendiente }> {
  if (!supabase) return SIN_CONEXION
  const { data, error } = await supabase.rpc('resena_pendiente', { p_codigo: codigo, p_contacto: contacto })
  if (error) return { ok: false, error: error.message || 'No se pudo consultar la reserva. Inténtalo de nuevo.' }
  const f = data?.[0]
  if (!f) return { ok: false, error: 'No encontramos una reserva con ese código y teléfono' }
  return { ok: true, pendiente: { puede: !!f.puede, motivo: f.motivo ?? '', negocioNombre: f.negocio_nombre ?? '', fecha: f.fecha ?? '' } }
}

export async function dejarResena(codigo: string, contacto: string, calificacion: number, comentario: string): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { error } = await supabase.rpc('dejar_resena', { p_codigo: codigo, p_contacto: contacto, p_calificacion: calificacion, p_comentario: comentario })
  return error ? { ok: false, error: error.message || 'No se pudo enviar la reseña. Inténtalo de nuevo.' } : { ok: true }
}

export async function cambiarVisibilidad(id: string, visible: boolean): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { data, error } = await supabase.from('resenas').update({ visible }).eq('id', id).select('id')
  if (error) return { ok: false, error: error.message || 'No se pudo cambiar la reseña.' }
  if (!data.length) return { ok: false, error: 'No tienes permiso para cambiar esta reseña.' }
  return { ok: true }
}
