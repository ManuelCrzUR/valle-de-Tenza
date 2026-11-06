import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { construirItinerario } from '../data/generarPlan'
import type { Itinerario } from '../data/generarPlan'
import type { Categoria } from '../data/planes'

const KEY = 'valle-directo:plan'

export interface DiaPlano { paradas: string[]; comida: string | null }
export interface PlanDto {
  modo: 'openai' | 'demo' | 'ajuste'
  modelo: string | null
  plan: Categoria
  municipio: string
  dias: DiaPlano[]
  hospedaje: string | null
  avisos: string[]
  resumen: string
  esquematico: true
}
export interface PlanActual { dto: PlanDto; itinerario: Itinerario }

interface Ctx { plan: PlanActual | null; guardar: (dto: PlanDto) => void; limpiar: () => void }
const PlanCtx = createContext<Ctx | null>(null)

function materializar(dto: PlanDto): PlanActual | null {
  const itinerario = construirItinerario({
    planId: dto.plan,
    municipio: dto.municipio,
    dias: dto.dias.map((d) => ({ paradas: d.paradas, comida: d.comida ?? undefined })),
    hospedaje: dto.hospedaje ?? undefined,
  })
  if (!itinerario) return null
  itinerario.avisos = [...new Set([...dto.avisos, ...itinerario.avisos])]
  return { dto, itinerario }
}

function leer(): PlanActual | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PlanDto | null
    if (!raw?.plan || !raw.dias) return null
    return materializar(raw)
  } catch { return null }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanActual | null>(leer)
  useEffect(() => {
    try {
      if (plan) sessionStorage.setItem(KEY, JSON.stringify(plan.dto))
      else sessionStorage.removeItem(KEY)
    } catch { /* sin almacenamiento */ }
  }, [plan])
  const value = useMemo<Ctx>(() => ({
    plan,
    guardar: (dto) => { const m = materializar(dto); if (m) setPlan(m) },
    limpiar: () => setPlan(null),
  }), [plan])
  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>
}

export function usePlan() {
  const c = useContext(PlanCtx)
  if (!c) throw new Error('usePlan fuera de PlanProvider')
  return c
}
