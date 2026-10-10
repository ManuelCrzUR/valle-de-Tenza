import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, getLugar, metros, tieneUbicacion } from './lugares'
import type { Lugar } from './lugares'
import { getPlan } from './planes'
import type { Categoria, Plan } from './planes'

type Punto = Lugar & { lat: number; lon: number }
export const MAX_SALTO_M = 8_000       // más de esto entre dos paradas seguidas se considera «lejos»
const MAX_COMIDA_M = 15_000
export const PARADAS_POR_DIA = 3
export const DIAS_MAX = 3

export interface Dia { n: number; paradas: Lugar[]; comida?: Lugar }
export interface Itinerario {
  plan: Plan
  municipio: string            // municipio donde se centra la ruta
  dias: Dia[]
  hospedaje?: Lugar            // se duerme cerca del final del día 1 (de la última parada si es de 1 día)
  paradas: Lugar[]             // todas las paradas de todos los días, en orden
  avisos: string[]             // saltos largos, pocas paradas, etc.
}
// Ruta personalizada (la arma el asistente del chat): ids de lugares por día.
export interface RutaPersonal { planId: Categoria; municipio: string; dias: { paradas: string[]; comida?: string }[]; hospedaje?: string }

const dist = (a: Lugar, b: Lugar) => (tieneUbicacion(a) && tieneUbicacion(b) ? metros([a.lat, a.lon], [b.lat, b.lon]) : Infinity)
const mas_cercano = (de: Lugar, lista: Punto[]) => lista.reduce<Punto | undefined>((m, l) => (!m || dist(de, l) < dist(de, m) ? l : m), undefined)
export const km = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} km`)

// Desordena de forma determinista según la semilla (misma semilla = mismo orden).
function mezclar<T>(lista: T[], semilla: number): T[] {
  let s = semilla * 2654435761 + 1
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1);[a[i], a[j]] = [a[j], a[i]] }
  return a
}

// Orden de recorrido para el mapa y las listas: por día, paradas y comida; el hospedaje al cierre del día 1 (o al final si es de 1 día).
export type PasoRuta = { lugar: Lugar; dia: number; rol: 'parada' | 'comida' | 'hospedaje' }
export function ordenRuta(it: Itinerario): PasoRuta[] {
  const out: PasoRuta[] = []
  it.dias.forEach((d, i) => {
    d.paradas.forEach((lugar) => out.push({ lugar, dia: d.n, rol: 'parada' }))
    if (d.comida) out.push({ lugar: d.comida, dia: d.n, rol: 'comida' })
    if (i === 0 && it.hospedaje && it.dias.length > 1) out.push({ lugar: it.hospedaje, dia: d.n, rol: 'hospedaje' })
  })
  if (it.hospedaje && it.dias.length === 1) out.push({ lugar: it.hospedaje, dia: 1, rol: 'hospedaje' })
  return out
}
// Distancia (m) desde el paso anterior con ubicación; undefined si no se puede medir.
export function distanciasRuta(pasos: PasoRuta[]): (number | undefined)[] {
  return pasos.map((p, i) => { if (i === 0) return undefined; const d = dist(pasos[i - 1].lugar, p.lugar); return Number.isFinite(d) ? d : undefined })
}
export function avisosDeSaltos(pasos: PasoRuta[]): string[] {
  const d = distanciasRuta(pasos)
  return pasos.flatMap((p, i) => (d[i] !== undefined && d[i]! > MAX_SALTO_M ? [`De «${pasos[i - 1].lugar.nombre}» a «${p.lugar.nombre}» hay unos ${km(d[i]!)}: queda lejos.`] : []))
}

// Alojamiento con nombre propio (no «Finca turística · vereda X») y, de preferir, con registro de turismo.
const propio = (l: Punto) => !/^(finca|casa|vivienda|otro)/i.test(l.nombre) && l.precision !== 'cabecera'

function cerca(de: Lugar | undefined, cat: Lugar['categoria'], extra: (l: Punto) => boolean = () => true, excluir: Set<string> = new Set()) {
  const lista = (LUGARES.filter(tieneUbicacion) as Punto[]).filter((l) => l.categoria === cat && extra(l) && !excluir.has(l.id))
  return de ? mas_cercano(de, lista) : lista[0]
}
function buscarHospedaje(cierre: Lugar | undefined, arranque?: Lugar) {
  if (!cierre) return undefined
  const costo = (l: Punto) => dist(cierre, l) + (arranque ? dist(l, arranque) : 0)
  const mejor = (lista: Punto[]) => lista.reduce<Punto | undefined>((m, l) => (!m || costo(l) < costo(m) ? l : m), undefined)
  const todos = (LUGARES.filter(tieneUbicacion) as Punto[]).filter((l) => l.categoria === 'alojamiento')
  return mejor(todos.filter((l) => propio(l) && l.conRegistro)) ?? mejor(todos.filter(propio)) ?? mejor(todos)
}

// Itinerario con lugares reales, centrado en un municipio, de 1 a 3 días, sin saltos largos entre paradas.
export function generarPlan(planId: Categoria, municipio: string, semilla: number, diasN = 2): Itinerario | undefined {
  const plan = getPlan(planId)
  if (!plan) return undefined
  const dias = Math.min(DIAS_MAX, Math.max(1, Math.round(diasN)))
  const conUbic = LUGARES.filter(tieneUbicacion) as Punto[]
  const delPlan = conUbic.filter((l) => l.plan === planId)
  const avisos: string[] = []

  // Municipio base: el elegido o el que más paradas del plan tenga.
  let base = municipio
  if (!base) {
    const n: Record<string, number> = {}
    for (const l of delPlan) n[l.municipio] = (n[l.municipio] ?? 0) + 1
    base = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  const quiero = dias * PARADAS_POR_DIA
  const enBase = mezclar(delPlan.filter((l) => l.municipio === base), semilla)

  // Cadena por vecino más cercano: primero lo del municipio; si no alcanza, se suman paradas de municipios vecinos solo si quedan a poca distancia.
  const cadena: Punto[] = []
  let pool = [...enBase]
  if (enBase.length) { cadena.push(pool[0]); pool = pool.slice(1) }
  else if (base && delPlan.length) {
    // El municipio no tiene paradas de este plan: se arranca por la más cercana a su centro y se avisa a qué distancia queda.
    const centro = MUNICIPIOS.find((m) => m.slug === base)?.centro
    const primera = centro ? delPlan.reduce((m, l) => (metros(centro, [l.lat, l.lon]) < metros(centro, [m.lat, m.lon]) ? l : m)) : delPlan[0]
    cadena.push(primera); pool = []
    if (centro) avisos.push(`${NOMBRE_MUNICIPIO[base] ?? base} no tiene paradas de este plan; la más cercana está en ${NOMBRE_MUNICIPIO[primera.municipio] ?? primera.municipio}, a unos ${km(metros(centro, [primera.lat, primera.lon]))}.`)
  }
  while (cadena.length < quiero) {
    const ult = cadena[cadena.length - 1]
    let sig = ult ? mas_cercano(ult, pool) : undefined
    if (!sig || dist(ult, sig) > MAX_SALTO_M) {
      const vecina = ult ? mas_cercano(ult, delPlan.filter((l) => !cadena.includes(l))) : undefined
      if (vecina && dist(ult, vecina) <= MAX_SALTO_M) sig = vecina
    }
    if (!sig) break
    cadena.push(sig); pool = pool.filter((l) => l !== sig)
  }
  if (cadena.length < quiero) avisos.push(cadena.length ? `Solo encontramos ${cadena.length} ${cadena.length === 1 ? 'parada' : 'paradas'} de este plan sin saltos largos; por eso el recorrido es más corto.` : 'No encontramos paradas de este plan con ubicación en esa zona.')
  if (enBase.length && cadena.some((l) => l.municipio !== base)) avisos.push('Pocas paradas en ese municipio: sumamos algunas de municipios vecinos que quedan cerca.')

  // Reparte la cadena en días y busca dónde comer cerca de la última parada de cada uno.
  const usados = new Set<string>(cadena.map((l) => l.id))
  const lista: Dia[] = Array.from({ length: dias }, (_, i) => ({ n: i + 1, paradas: cadena.slice(i * PARADAS_POR_DIA, (i + 1) * PARADAS_POR_DIA) })).filter((d) => d.paradas.length)
  for (const d of lista) {
    if (planId === 'gastro') continue
    const c = cerca(d.paradas[d.paradas.length - 1], 'restaurante', () => true, usados)
    // Para comer se acepta algo más lejos que entre paradas (hay pocos restaurantes); si pasa de MAX_SALTO_M, avisosDeSaltos lo advierte.
    if (c && dist(d.paradas[d.paradas.length - 1], c) <= MAX_COMIDA_M) { d.comida = c; usados.add(c.id) }
  }
  // El hospedaje queda entre el cierre del día 1 y el inicio del día 2 (o cerca del final si es de 1 día): así no hay que devolverse.
  const cierre = lista[0] ? (lista[0].comida ?? lista[0].paradas[lista[0].paradas.length - 1]) : undefined
  const arranque = lista[1]?.paradas[0]
  const hospedaje = buscarHospedaje(cierre, arranque)
  const it: Itinerario = { plan, municipio: base, dias: lista, hospedaje, paradas: lista.flatMap((d) => d.paradas), avisos }
  it.avisos.push(...avisosDeSaltos(ordenRuta(it)))
  return it
}

// Arma el itinerario a partir de una ruta propuesta por el asistente. Descarta ids que ya no existan.
export function construirItinerario(r: RutaPersonal): Itinerario | undefined {
  const plan = getPlan(r.planId)
  if (!plan) return undefined
  const dias: Dia[] = r.dias.map((d, i) => ({ n: i + 1, paradas: d.paradas.map(getLugar).filter((l): l is Lugar => !!l), comida: d.comida ? getLugar(d.comida) : undefined })).filter((d) => d.paradas.length)
  const it: Itinerario = { plan, municipio: r.municipio, dias, hospedaje: r.hospedaje ? getLugar(r.hospedaje) : undefined, paradas: dias.flatMap((d) => d.paradas), avisos: [] }
  it.avisos.push(...avisosDeSaltos(ordenRuta(it)))
  return it
}
