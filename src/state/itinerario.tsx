import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { generarPlan } from '../data/generarPlan'
import type { Itinerario } from '../data/generarPlan'
import type { Categoria } from '../data/planes'

const KEY = 'valle-directo:itinerario'

interface Eleccion { planId: Categoria; municipio: string; semilla: number }
interface Ctx {
  itinerario: Itinerario | undefined
  eleccion: Eleccion | null
  elegir: (id: Categoria) => void            // elige o cambia de plan (conserva el municipio)
  setMunicipio: (slug: string) => void        // '' = el mejor para el plan
  otro: () => void                            // «Generar otro»: nueva semilla
  limpiar: () => void
}
const ItinerarioCtx = createContext<Ctx | null>(null)

function leer(): Eleccion | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && v.planId ? v : null } catch { return null }
}

export function ItinerarioProvider({ children }: { children: ReactNode }) {
  const [e, setE] = useState<Eleccion | null>(leer)
  useEffect(() => {
    try { e ? localStorage.setItem(KEY, JSON.stringify(e)) : localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ }
  }, [e])
  const itinerario = useMemo(() => (e ? generarPlan(e.planId, e.municipio, e.semilla) : undefined), [e])
  const value: Ctx = {
    itinerario, eleccion: e,
    elegir: (planId) => setE((x) => ({ planId, municipio: x?.municipio ?? '', semilla: 0 })),
    setMunicipio: (municipio) => setE((x) => x && { ...x, municipio, semilla: 0 }),
    otro: () => setE((x) => x && { ...x, semilla: x.semilla + 1 }),
    limpiar: () => setE(null),
  }
  return <ItinerarioCtx.Provider value={value}>{children}</ItinerarioCtx.Provider>
}

export function useItinerario() {
  const c = useContext(ItinerarioCtx)
  if (!c) throw new Error('useItinerario fuera de ItinerarioProvider')
  return c
}
