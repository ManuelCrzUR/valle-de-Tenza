import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, getLugar, metros, tieneUbicacion } from './lugares'
import type { Lugar } from './lugares'
import { getPlan } from './planes'
import type { Categoria, Plan } from './planes'
import { FOTO_MUNICIPIO, fotoDeLugar } from './fotos'

type Punto = Lugar & { lat: number; lon: number }
export const MAX_SALTO_M = 8_000       // más de esto entre dos paradas seguidas se considera «lejos»
const MAX_COMIDA_M = 15_000
export const PARADAS_POR_DIA = 3
export const DIAS_MAX = 3


// Costo de ir de un lugar a otro, en segundos por carretera.
// FACTOR_RUTA = 1,78: mediana de (distancia por carretera / línea recta) en 118.972 tramos lugar↔lugar de los 14 municipios con más de 300 m en línea recta (vías de montaña).
// VELOCIDAD_MEDIA_MS = 9,48 m/s (≈ 34 km/h): mediana de distancia_m / duracion_s en los 130.339 tramos lugar↔lugar de la base
// local (tabla `tramos`, calculados con OSRM). Sin tramo: línea recta × FACTOR_RUTA / VELOCIDAD_MEDIA_MS, marcada como aproximada.
export const FACTOR_RUTA = 1.78
export const VELOCIDAD_MEDIA_MS = 9.48
export interface Costo { segundos: number; aprox: boolean }
export type FnCosto = (a: Lugar, b: Lugar) => Costo
export type FnTramo = (a: string, b: string) => { duracion_s: number } | undefined
export function costoEntre(a: Lugar, b: Lugar, tramo?: FnTramo): Costo {
  const t = tramo?.(a.id, b.id)
  if (t && t.duracion_s > 0) return { segundos: t.duracion_s, aprox: false }
  return { segundos: (dist(a, b) * FACTOR_RUTA) / VELOCIDAD_MEDIA_MS, aprox: true }   // Infinity si falta ubicación
}
/** Dependencias inyectables (Supabase en la app, matrices falsas en las pruebas). Sin ellas: línea recta y sin cupos. */
export interface DepsPlan {
  costo?: FnCosto
  cupo?: (alojamiento: Lugar, fecha: string) => number | undefined   // personas que aún caben; undefined = sin negocio o sin dato
  movilidad?: 'carro' | 'publico'
  fecha?: string                                                    // llegada (AAAA-MM-DD); el hospedaje se busca para esa noche
  personas?: number
  rutasPublicas?: { origen: string; destino: string }[]            // pares de municipios (slug) con ruta en rutas_transporte
  lugares?: Lugar[]                                                 // catálogo (con `acceso` si viene de Supabase); por defecto el JSON
  verificado?: (l: Lugar) => boolean                                // ¿tiene negocio verificado?
}

export interface Dia {
  n: number; paradas: Lugar[]; comida?: Lugar
  opcional: Lugar[]                  // cimas sin «cómo se llega»: se ofrecen al final del día, no como parada principal
  segundosCarretera: number          // suma de costos entre pasos consecutivos del día
  aprox: boolean                     // algún tramo se estimó en línea recta
}
export interface Itinerario {
  plan: Plan
  municipio: string            // municipio donde se centra la ruta
  dias: Dia[]
  hospedaje?: Lugar            // se duerme cerca del final del día 1 (de la última parada si es de 1 día)
  paradas: Lugar[]             // todas las paradas de todos los días, en orden
  avisos: string[]             // saltos largos, pocas paradas, etc.
  avisoHospedaje?: string      // «X no tiene cupo ese día; te sugerimos Y»
  segundosCarretera: number    // total del viaje en carretera
  aprox: boolean               // algún tramo del total se estimó en línea recta
}
// Ruta personalizada (la arma el asistente del chat): ids de lugares por día.
export interface RutaPersonal { planId: Categoria; municipio: string; dias: { paradas: string[]; comida?: string }[]; hospedaje?: string }

const dist = (a: Lugar, b: Lugar) => (tieneUbicacion(a) && tieneUbicacion(b) ? metros([a.lat, a.lon], [b.lat, b.lon]) : Infinity)
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
const esCima = (l: Lugar) => /^(peak|cerro|cima)$/i.test(l.subtipo) && !l.acceso
const PESO_PUNTO_S = 300   // cada punto de ranking compensa 5 min de carretera al elegir la siguiente parada

// Pasos de un día en orden de viaje, con el hospedaje donde corresponde (se duerme tras el día 1).
function segundosDe(it: Pick<Itinerario, 'dias' | 'hospedaje'>, costo: FnCosto) {
  const h = it.hospedaje
  return it.dias.map((d, i) => {
    const seq: Lugar[] = [...d.paradas, ...(d.comida ? [d.comida] : [])]
    if (h && i === 0) seq.push(h)
    if (h && i === 1) seq.unshift(h)
    let segundos = 0, aprox = false
    for (let k = 1; k < seq.length; k++) {
      const c = costo(seq[k - 1], seq[k])
      if (c.aprox) aprox = true
      if (Number.isFinite(c.segundos)) segundos += c.segundos
    }
    return { segundos: Math.round(segundos), aprox }
  })
}
function cerrar(it: Itinerario, costo: FnCosto) {
  const s = segundosDe(it, costo)
  it.dias.forEach((d, i) => { d.segundosCarretera = s[i].segundos; d.aprox = s[i].aprox })
  it.segundosCarretera = s.reduce((t, x) => t + x.segundos, 0)
  it.aprox = s.some((x) => x.aprox)
}

// Itinerario con lugares reales, centrado en un municipio, de 1 a 3 días, sin saltos largos entre paradas.
export function generarPlan(planId: Categoria, municipio: string, semilla: number, diasN = 2, deps: DepsPlan = {}): Itinerario | undefined {
  const plan = getPlan(planId)
  if (!plan) return undefined
  const costo: FnCosto = deps.costo ?? ((a, b) => costoEntre(a, b))
  const personas = Math.max(1, deps.personas ?? 1)
  const verificado = deps.verificado ?? (() => false)
  const dias = Math.min(DIAS_MAX, Math.max(1, Math.round(diasN)))
  const conUbic = (deps.lugares ?? LUGARES).filter(tieneUbicacion) as Punto[]
  const delPlanTodo = conUbic.filter((l) => l.plan === planId)
  const avisos: string[] = []
  const seg = (a: Lugar, b: Lugar) => costo(a, b).segundos
  const puntaje = (l: Punto) => (l.acceso ? 3 : 0) + (fotoDeLugar(l) !== FOTO_MUNICIPIO[l.municipio] ? 1 : 0) + (verificado(l) ? 2 : 0) + (propio(l) ? 1 : 0)
  const clave = (de: Lugar, l: Punto) => seg(de, l) - puntaje(l) * PESO_PUNTO_S
  const mejorPor = (lista: Punto[], f: (l: Punto) => number) => lista.reduce<Punto | undefined>((m, l) => (!m || f(l) < f(m) ? l : m), undefined)

  // Municipio base: el elegido o el que más paradas del plan tenga.
  let base = municipio
  if (!base) {
    const n: Record<string, number> = {}
    for (const l of delPlanTodo) n[l.municipio] = (n[l.municipio] ?? 0) + 1
    base = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  // Sin carro: solo el municipio base y los vecinos con ruta de transporte público.
  const permitidos = new Set<string>([base])
  if (deps.movilidad === 'publico') for (const r of deps.rutasPublicas ?? []) { if (r.origen === base) permitidos.add(r.destino); if (r.destino === base) permitidos.add(r.origen) }
  const ok = (l: Lugar) => deps.movilidad !== 'publico' || permitidos.has(l.municipio)
  const delPlanOk = delPlanTodo.filter(ok)
  let delPlan = delPlanOk.filter((l) => !esCima(l))
  if (!delPlan.length && delPlanOk.length) { delPlan = delPlanOk; avisos.push('Las paradas de este plan en esa zona son cimas sin indicaciones de acceso; confirma cómo llegar antes de ir.') }
  const quiero = dias * PARADAS_POR_DIA
  // Más puntaje primero (el orden entre iguales sigue siendo el de la semilla).
  const enBase = mezclar(delPlan.filter((l) => l.municipio === base), semilla).sort((a, b) => puntaje(b) - puntaje(a))

  // Cadena por vecino más cercano (por costo de carretera, con premio al ranking): primero lo del municipio; si no alcanza, se suman paradas de municipios vecinos solo si quedan a poca distancia.
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
    let sig = ult ? mejorPor(pool, (l) => clave(ult, l)) : undefined
    if (!sig || dist(ult, sig) > MAX_SALTO_M) {
      const vecina = ult ? mejorPor(delPlan.filter((l) => !cadena.includes(l)), (l) => clave(ult, l)) : undefined
      if (vecina && dist(ult, vecina) <= MAX_SALTO_M) sig = vecina
    }
    if (!sig) break
    cadena.push(sig); pool = pool.filter((l) => l !== sig)
  }
  if (cadena.length < quiero) avisos.push(cadena.length ? `Solo encontramos ${cadena.length} ${cadena.length === 1 ? 'parada' : 'paradas'} de este plan sin saltos largos; por eso el recorrido es más corto.` : 'No encontramos paradas de este plan con ubicación en esa zona.')
  if (enBase.length && cadena.some((l) => l.municipio !== base)) avisos.push('Pocas paradas en ese municipio: sumamos algunas de municipios vecinos que quedan cerca.')
  if (deps.movilidad === 'publico' && cadena.length) avisos.push(`Sin carro: las paradas se limitan a ${[...permitidos].map((m) => NOMBRE_MUNICIPIO[m] ?? m).join(', ')}.`)

  // Reparte la cadena en días y busca dónde comer en el municipio de la última parada de cada uno.
  const usados = new Set<string>(cadena.map((l) => l.id))
  const lista: Dia[] = Array.from({ length: dias }, (_, i): Dia => ({ n: i + 1, paradas: cadena.slice(i * PARADAS_POR_DIA, (i + 1) * PARADAS_POR_DIA), opcional: [], segundosCarretera: 0, aprox: false })).filter((d) => d.paradas.length)
  const restaurantes = conUbic.filter((l) => l.categoria === 'restaurante' && ok(l))
  for (const d of lista) {
    // Cimas sin acceso cerca del cierre del día: opcionales, nunca paradas principales.
    const fin = d.paradas[d.paradas.length - 1]
    const cimas = delPlanOk.filter((l) => esCima(l) && !usados.has(l.id) && dist(fin, l) <= MAX_SALTO_M).sort((a, b) => seg(fin, a) - seg(fin, b)).slice(0, 2)
    d.opcional = cimas; cimas.forEach((l) => usados.add(l.id))
    if (planId === 'gastro') continue
    // Mismo municipio de la última parada primero (sin límite de distancia); solo si no hay ninguno, el de menor costo, con el tope de siempre.
    const costoFin = (l: Punto) => seg(fin, l)
    const mismo = restaurantes.filter((l) => l.municipio === fin.municipio)
    const c = mejorPor(mismo.filter((l) => !usados.has(l.id)), costoFin) ?? mejorPor(mismo, costoFin)
      ?? (() => { const o = mejorPor(restaurantes.filter((l) => !usados.has(l.id)), costoFin); return o && dist(fin, o) <= MAX_COMIDA_M ? o : undefined })()
    if (c) { d.comida = c; usados.add(c.id) }
  }
  // El hospedaje queda entre el cierre del día 1 y el inicio del día 2 (o cerca del final si es de 1 día): así no hay que devolverse.
  const cierre = lista[0] ? (lista[0].comida ?? lista[0].paradas[lista[0].paradas.length - 1]) : undefined
  const arranque = lista[1]?.paradas[0]
  let hospedaje: Punto | undefined, avisoHospedaje: string | undefined
  if (cierre) {
    const todos = conUbic.filter((l) => l.categoria === 'alojamiento')
    const cand = todos.filter(ok).length ? todos.filter(ok) : todos
    const tramo = (l: Punto) => (propio(l) && l.conRegistro ? 0 : propio(l) ? 1 : 2)
    const total = (l: Punto) => seg(cierre, l) + (arranque ? seg(l, arranque) : 0)
    const orden = cand.map((l) => ({ l, t: tramo(l), c: total(l) })).sort((a, b) => a.t - b.t || a.c - b.c).map((x) => x.l)
    const libre = (l: Punto) => { const c = deps.cupo && deps.fecha ? deps.cupo(l, deps.fecha) : undefined; return c === undefined || c >= personas }
    const cercano = orden[0]
    hospedaje = orden.find(libre) ?? cercano
    if (cercano && !libre(cercano)) avisoHospedaje = hospedaje !== cercano
      ? `«${cercano.nombre}» no tiene cupo ese día; te sugerimos «${hospedaje!.nombre}».`
      : `«${cercano.nombre}» no tiene cupo ese día y no encontramos otro alojamiento con cupo.`
  }
  const it: Itinerario = { plan, municipio: base, dias: lista, hospedaje, paradas: lista.flatMap((d) => d.paradas), avisos, avisoHospedaje, segundosCarretera: 0, aprox: false }
  it.avisos.push(...avisosDeSaltos(ordenRuta(it)))
  cerrar(it, costo)
  return it
}

// Arma el itinerario a partir de una ruta propuesta por el asistente. Descarta ids que ya no existan.
export function construirItinerario(r: RutaPersonal, costo: FnCosto = (a, b) => costoEntre(a, b)): Itinerario | undefined {
  const plan = getPlan(r.planId)
  if (!plan) return undefined
  const dias: Dia[] = r.dias.map((d, i) => ({ n: i + 1, paradas: d.paradas.map(getLugar).filter((l): l is Lugar => !!l), comida: d.comida ? getLugar(d.comida) : undefined, opcional: [], segundosCarretera: 0, aprox: false })).filter((d) => d.paradas.length)
  const it: Itinerario = { plan, municipio: r.municipio, dias, hospedaje: r.hospedaje ? getLugar(r.hospedaje) : undefined, paradas: dias.flatMap((d) => d.paradas), avisos: [], segundosCarretera: 0, aprox: false }
  it.avisos.push(...avisosDeSaltos(ordenRuta(it)))
  cerrar(it, costo)
  return it
}
