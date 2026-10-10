import { LUGARES, metros, tieneUbicacion } from './lugares'
import type { Lugar } from './lugares'
import { getPlan } from './planes'
import type { Categoria, Plan } from './planes'

type Punto = Lugar & { lat: number; lon: number }
export interface Itinerario { plan: Plan; municipio: string; paradas: Lugar[]; comida?: Lugar; hospedaje?: Lugar }

const dist = (a: Punto, b: Punto) => metros([a.lat, a.lon], [b.lat, b.lon])
const mas_cercano = (de: Punto, lista: Punto[]) => lista.reduce<Punto | undefined>((m, l) => (!m || dist(de, l) < dist(de, m) ? l : m), undefined)

// Desordena de forma determinista según la semilla (misma semilla = mismo orden).
function mezclar<T>(lista: T[], semilla: number): T[] {
  let s = semilla * 2654435761 + 1
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1);[a[i], a[j]] = [a[j], a[i]] }
  return a
}

// Itinerario con lugares reales: 3-4 paradas del plan cercanas entre sí (en orden de recorrido), dónde comer y dónde dormir.
export function generarPlan(planId: Categoria, municipio: string, semilla: number): Itinerario | undefined {
  const plan = getPlan(planId)
  if (!plan) return undefined
  const conUbic = LUGARES.filter(tieneUbicacion) as Punto[]
  const delPlan = conUbic.filter((l) => l.plan === planId)

  // Municipio base: el elegido o el que más paradas del plan tenga.
  let base = municipio
  if (!base) {
    const n: Record<string, number> = {}
    for (const l of delPlan) n[l.municipio] = (n[l.municipio] ?? 0) + 1
    base = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  const enBase = delPlan.filter((l) => l.municipio === base)
  const candidatas = enBase.length >= 3 ? enBase : delPlan
  const pool = mezclar(candidatas, semilla)
  const paradas: Punto[] = []
  if (pool.length) {
    paradas.push(pool[0])
    const resto = pool.slice(1)
    while (paradas.length < 4 && resto.length) {
      const sig = mas_cercano(paradas[paradas.length - 1], resto)!
      paradas.push(sig); resto.splice(resto.indexOf(sig), 1)
    }
  }
  const centro = paradas[0]
  const cerca = (cat: Lugar['categoria'], extra: (l: Punto) => boolean = () => true) => {
    const lista = conUbic.filter((l) => l.categoria === cat && extra(l))
    return centro ? mas_cercano(centro, lista) : lista[0]
  }
  const comida = planId === 'gastro' ? undefined : cerca('restaurante')
  // Alojamiento: con nombre propio (no «Finca turística · vereda X») y, de preferir, con registro de turismo.
  const propio = (l: Punto) => !/^(finca|casa|vivienda|otro)/i.test(l.nombre) && l.precision !== 'cabecera'
  const hospedaje = cerca('alojamiento', (l) => propio(l) && l.conRegistro) ?? cerca('alojamiento', propio) ?? cerca('alojamiento')
  // Si el municipio pedido tiene pocas paradas del plan, se usó toda la región: se reporta el municipio real del recorrido.
  return { plan, municipio: candidatas === enBase ? base : (paradas[0]?.municipio ?? base), paradas, comida, hospedaje }
}
