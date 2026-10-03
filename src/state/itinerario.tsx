import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getPlan } from '../data/planes'
import type { Categoria, Plan } from '../data/planes'

const KEY = 'valle-directo:plan'

interface Ctx { plan: Plan | undefined; elegir: (id: Categoria) => void; limpiar: () => void }
const ItinerarioCtx = createContext<Ctx | null>(null)

function leer(): Categoria | null {
  try { return localStorage.getItem(KEY) as Categoria | null } catch { return null }
}

export function ItinerarioProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<Categoria | null>(leer)
  useEffect(() => {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ }
  }, [id])
  const value: Ctx = { plan: getPlan(id), elegir: setId, limpiar: () => setId(null) }
  return <ItinerarioCtx.Provider value={value}>{children}</ItinerarioCtx.Provider>
}

export function useItinerario() {
  const c = useContext(ItinerarioCtx)
  if (!c) throw new Error('useItinerario fuera de ItinerarioProvider')
  return c
}
