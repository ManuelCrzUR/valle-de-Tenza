import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { cupoLibre, hoy, negocioDeLugar, useOperacion } from './reservas'
import { cargarTramos, useLogistica } from './logistica'
import { useCatalogo } from '../data/lugares'
import { DIAS_MAX, construirItinerario, costoEntre, generarPlan } from '../data/generarPlan'
import type { DepsPlan, Itinerario, RutaPersonal } from '../data/generarPlan'
import { MUNICIPIOS, metros, tieneUbicacion } from '../data/lugares'
import type { Lugar } from '../data/lugares'
import type { Categoria } from '../data/planes'

export type Movilidad = 'carro' | 'publico'
const KEY = 'valle-directo:itinerario'

interface Eleccion { planId: Categoria; municipio: string; semilla: number; dias: number; fecha: string; personas: number; movilidad?: Movilidad; ruta?: RutaPersonal }

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
  setMovilidad: (m: Movilidad) => void        // carro propio o transporte público
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
    return { ...e, movilidad: e.movilidad === 'carro' || e.movilidad === 'publico' ? e.movilidad : undefined, fecha: /^\d{4}-\d{2}-\d{2}$/.test(e.fecha) && e.fecha >= hoy() ? e.fecha : proximoSabado() }
  } catch { return null }
}

// Candidatos cuyos tramos se piden a Supabase: solo las categorías del plan (paradas, restaurantes, alojamientos) del municipio base y,
// si el municipio tiene pocos, los del vecino más cercano. Depende solo de plan + municipio (no de la semilla), con cupo de 54 nodos
// (54² ≈ 2.900 filas como máximo por generación, bajo el tope de ~3.000) y `cargarTramos` no repite lo ya pedido.
const CUPO_PARADAS = 24, CUPO_COMIDA = 15, CUPO_HOSPEDAJE = 15, MINIMO_EN_BASE = 4
function candidatosTramos(lugares: Lugar[], planId: string, base: string): string[] {
  const centro = MUNICIPIOS.find((m) => m.slug === base)?.centro
  const conUbic = lugares.filter(tieneUbicacion)
  const tomar = (lista: Lugar[], cupo: number) => {
    const en = lista.filter((l) => l.municipio === base).sort((a, b) => Number(!!b.acceso) - Number(!!a.acceso) || a.id.localeCompare(b.id))
    const fuera = en.length >= MINIMO_EN_BASE || !centro ? [] : lista.filter((l) => l.municipio !== base && tieneUbicacion(l))
      .sort((a, b) => metros(centro, [a.lat!, a.lon!]) - metros(centro, [b.lat!, b.lon!]) || a.id.localeCompare(b.id))
    return [...en, ...fuera].slice(0, cupo).map((l) => l.id)
  }
  return [
    ...tomar(conUbic.filter((l) => l.plan === planId && !(/^(peak|cerro|cima)$/i.test(l.subtipo) && !l.acceso)), CUPO_PARADAS),
    ...tomar(conUbic.filter((l) => l.categoria === 'restaurante'), CUPO_COMIDA),
    ...tomar(conUbic.filter((l) => l.categoria === 'alojamiento'), CUPO_HOSPEDAJE),
  ]
}

export function ItinerarioProvider({ children }: { children: ReactNode }) {
  const [e, setE] = useState<Eleccion | null>(leer)
  useEffect(() => {
    try { e ? localStorage.setItem(KEY, JSON.stringify(e)) : localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ }
  }, [e])
  const { lugares } = useCatalogo()
  const { negocios, cupos, ocupacion } = useOperacion()
  const { rutas, tramoEntre } = useLogistica({ tramos: false })
  // Dependencias reales del generador. Cuando llegan los tramos (o cambian cupos o rutas) se regenera con el mismo plan y semilla:
  // la ruta puede cambiar UNA vez al llegar los tiempos reales, porque el vecino más cercano pasa de línea recta a tiempo por carretera.
  const deps = useMemo((): DepsPlan => {
    const op = { cupos, ocupacion }
    return {
      lugares,
      costo: (a, b) => costoEntre(a, b, tramoEntre),
      cupo: (l, fecha) => { const n = negocioDeLugar(negocios, l.id); return n ? cupoLibre(op, n, fecha) : undefined },
      verificado: (l) => !!negocioDeLugar(negocios, l.id)?.verificado,
      rutasPublicas: rutas.map((r) => ({ origen: r.origen, destino: r.destino })),
    }
  }, [lugares, negocios, cupos, ocupacion, rutas, tramoEntre])
  const itinerario = useMemo(() => {
    if (!e) return undefined
    if (e.ruta) return construirItinerario(e.ruta, deps.costo)
    return generarPlan(e.planId, e.municipio, e.semilla, e.dias, { ...deps, fecha: e.fecha, personas: e.personas, movilidad: e.movilidad })
  }, [e, deps])
  // Pide los tiempos reales del municipio base (o de las paradas de la ruta armada); la caché de `cargarTramos` evita repetir.
  const claveTramos = e && itinerario ? (e.ruta ? `ruta|${itinerario.paradas.map((l) => l.id).join(',')}` : `${e.planId}|${itinerario.municipio}`) : ''
  useEffect(() => {
    if (!e || !itinerario || !claveTramos) return
    const ids = e.ruta ? [...itinerario.paradas, ...itinerario.dias.flatMap((d) => d.comida ?? []), ...(itinerario.hospedaje ? [itinerario.hospedaje] : [])].map((l) => l.id) : candidatosTramos(lugares, e.planId, itinerario.municipio)
    void cargarTramos(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveTramos, lugares])
  // Cualquier cambio manual descarta la ruta personalizada y vuelve a generar.
  const value: Ctx = {
    itinerario, eleccion: e,
    elegir: (planId) => setE((x) => ({ planId, municipio: x?.municipio ?? '', semilla: 0, dias: x?.dias ?? 2, fecha: x?.fecha ?? proximoSabado(), personas: x?.personas ?? 2, movilidad: x?.movilidad })),
    setMunicipio: (municipio) => setE((x) => x && { planId: x.planId, municipio, semilla: 0, dias: x.dias, fecha: x.fecha, personas: x.personas, movilidad: x.movilidad }),
    setDias: (n) => setE((x) => x && { planId: x.planId, municipio: x.municipio, semilla: 0, dias: Math.min(DIAS_MAX, Math.max(1, n)), fecha: x.fecha, personas: x.personas, movilidad: x.movilidad }),
    // Fecha y personas solo pueden cambiar el hospedaje (cupo): se conserva la semilla.
    setFecha: (fecha) => setE((x) => x && { ...x, fecha }),
    setPersonas: (n) => setE((x) => x && { ...x, personas: Math.min(PERSONAS_MAX, Math.max(1, Math.floor(n) || 1)) }),
    setMovilidad: (movilidad) => setE((x) => x && { ...x, movilidad }),
    otro: () => setE((x) => x && { planId: x.planId, municipio: x.municipio, dias: x.dias, fecha: x.fecha, personas: x.personas, movilidad: x.movilidad, semilla: x.semilla + 1 }),
    usarRuta: (ruta) => setE((x) => ({ planId: ruta.planId, municipio: ruta.municipio, semilla: 0, dias: ruta.dias.length, fecha: x?.fecha ?? proximoSabado(), personas: x?.personas ?? 2, movilidad: x?.movilidad, ruta })),
    limpiar: () => setE(null),
  }
  return <ItinerarioCtx.Provider value={value}>{children}</ItinerarioCtx.Provider>
}

export function useItinerario() {
  const c = useContext(ItinerarioCtx)
  if (!c) throw new Error('useItinerario fuera de ItinerarioProvider')
  return c
}
