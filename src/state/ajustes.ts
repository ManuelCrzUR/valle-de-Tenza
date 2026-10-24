// Ajustes públicos (contacto, horario de embajadores, redes) desde la tabla `ajustes`.
// Se consultan una sola vez por sesión (caché de módulo). Si falta un dato, queda `null` y la interfaz oculta la línea.
import { useSyncExternalStore } from 'react'
import { config } from '../config'
import { supabase } from '../lib/supabase'

export interface Red { nombre: string; url: string }
export interface Ajustes {
  /** Texto listo para mostrar (correo y/o WhatsApp), o null si no hay dato. */
  contacto: string | null
  whatsapp: string | null
  correo: string | null
  horario: string | null
  redes: Red[]
}

// Un marcador «[ASÍ]» o un texto vacío cuenta como faltante.
const limpio = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' && !v.trim().startsWith('[') ? v.trim() : null

function construir(filas: Record<string, unknown>): Ajustes {
  const c = (filas.contacto ?? {}) as { whatsapp?: unknown; correo?: unknown }
  const whatsapp = limpio(c.whatsapp)
  const correo = limpio(c.correo) ?? limpio(config.contacto)
  const horario = limpio((filas.horario_embajadores as { texto?: unknown } | undefined)?.texto) ?? limpio(config.horario)
  const redesDb = Array.isArray(filas.redes)
    ? (filas.redes as Partial<Red>[]).flatMap((r) => {
        const nombre = limpio(r?.nombre), url = limpio(r?.url)
        return nombre && url ? [{ nombre, url }] : []
      })
    : []
  const redesRespaldo = limpio(config.redes)
  const contacto = [correo, whatsapp ? `WhatsApp ${whatsapp}` : null].filter(Boolean).join(' · ') || null
  return {
    contacto, whatsapp, correo, horario, redes: redesDb,
    // El respaldo de redes es texto libre: solo se usa si no hay lista (y si no es marcador).
    ...(redesDb.length === 0 && redesRespaldo ? { redes: [{ nombre: redesRespaldo, url: '' }] } : {}),
  }
}

let ajustes: Ajustes = construir({})
let iniciada = false
const oyentes = new Set<() => void>()

function cargar() {
  if (iniciada || !supabase) return
  iniciada = true
  traer()
}
function traer() {
  const limite = new Promise<never>((_, no) => setTimeout(() => no(new Error('tiempo agotado')), 4000))
  Promise.race([supabase!.from('ajustes').select('clave, valor'), limite])
    .then(({ data, error }) => {
      if (error) throw error
      ajustes = construir(Object.fromEntries((data ?? []).map((f) => [f.clave, f.valor])))
      oyentes.forEach((o) => o())
    })
    .catch((e) => console.warn('Ajustes: se usan los valores de respaldo.', e?.message ?? e))
}

/** Vuelve a leer los ajustes (lo usa el panel del coordinador tras guardar). */
export const refrescarAjustes = () => { if (supabase) traer() }

const suscribir = (o: () => void) => {
  oyentes.add(o)
  cargar()
  return () => { oyentes.delete(o) }
}
const instantanea = () => ajustes

export const useAjustes = (): Ajustes => useSyncExternalStore(suscribir, instantanea, instantanea)
