import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { hoy } from './reservas'
import { DIAS_MAX, construirItinerario, generarPlan } from '../data/generarPlan'
import type { Itinerario, RutaPersonal } from '../data/generarPlan'
import type { Categoria } from '../data/planes'

const KEY = 'valle-directo:itinerario'

interface Eleccion { planId: Categoria; municipio: string; semilla: number; dias: number; fecha: string; personas: number; ruta?: RutaPersonal }

// Próximo sábado en hora local (AAAA-MM-DD); si hoy es sábado, hoy.
export function proximoSabado(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7))
  return d.toLocaleDateString('en-CA')
}
export const PERSONAS_MAX = 12
interface Ctx {
  itinerario: Itinerario | undefined
  eleccion: Eleccion | null
  elegir: (id: Categoria) => void            // elige o cambia de plan (conserva municipio y días)
  setMunicipio: (slug: string) => void        // '' = el mejor para el plan
  setDias: (n: number) => void                // 1 a DIAS_MAX
  setFecha: (f: string) => void               // fecha de llegada (AAAA-MM-DD)
  setPersonas: (n: number) => void            // 1 a PERSONAS_MAX
  otro: () => void                            // «Generar otro»: nueva semilla
  usarRuta: (r: RutaPersonal) => void         // carga una ruta armada (por el asistente del chat)
  limpiar: () => void
}
const ItinerarioCtx = createContext<Ctx | null>(null)

function leer(): Eleccion | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!v || !v.planId) return null
    const e = { municipio: '', semilla: 0, dias: 2, fecha: '', personas: 2, ...v }
    return { ...e, fecha: /^\d{4}-\d{2}-\d{2}$/.test(e.fecha) && e.fecha >= hoy() ? e.fecha : proximoSabado() }
  } catch { return null }
}

export function ItinerarioProvider({ children }: { children: ReactNode }) {
  const [e, setE] = useState<Eleccion | null>(leer)
  useEffect(() => {
    try { e ? localStorage.setItem(KEY, JSON.stringify(e)) : localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ }
  }, [e])
  const itinerario = useMemo(() => (e ? (e.ruta ? construirItinerario(e.ruta) : generarPlan(e.planId, e.municipio, e.semilla, e.dias)) : undefined), [e])
  // Cualquier cambio manual descarta la ruta personalizada y vuelve a generar.
  const value: Ctx = {
    itinerario, eleccion: e,
    elegir: (planId) => setE((x) => ({ planId, municipio: x?.municipio ?? '', semilla: 0, dias: x?.dias ?? 2, fecha: x?.fecha ?? proximoSabado(), personas: x?.personas ?? 2 })),
    setMunicipio: (municipio) => setE((x) => x && { planId: x.planId, municipio, semilla: 0, dias: x.dias, fecha: x.fecha, personas: x.personas }),
    setDias: (n) => setE((x) => x && { planId: x.planId, municipio: x.municipio, semilla: 0, dias: Math.min(DIAS_MAX, Math.max(1, n)), fecha: x.fecha, personas: x.personas }),
    // Fecha y personas no cambian el itinerario: se conserva la ruta y la semilla.
    setFecha: (fecha) => setE((x) => x && { ...x, fecha }),
    setPersonas: (n) => setE((x) => x && { ...x, personas: Math.min(PERSONAS_MAX, Math.max(1, Math.floor(n) || 1)) }),
    otro: () => setE((x) => x && { planId: x.planId, municipio: x.municipio, dias: x.dias, fecha: x.fecha, personas: x.personas, semilla: x.semilla + 1 }),
    usarRuta: (ruta) => setE((x) => ({ planId: ruta.planId, municipio: ruta.municipio, semilla: 0, dias: ruta.dias.length, fecha: x?.fecha ?? proximoSabado(), personas: x?.personas ?? 2, ruta })),
    limpiar: () => setE(null),
  }
  return <ItinerarioCtx.Provider value={value}>{children}</ItinerarioCtx.Provider>
}

export function useItinerario() {
  const c = useContext(ItinerarioCtx)
  if (!c) throw new Error('useItinerario fuera de ItinerarioProvider')
  return c
}
