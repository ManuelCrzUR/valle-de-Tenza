import { LUGARES, NOMBRE_MUNICIPIO } from '../src/data/lugares.js'
import type { LugarPublico } from './catalogo.js'
import { listarFichasPublicas } from './empresas.js'
import { norm } from './texto.js'
import { hayGustos } from '../shared/gustos.js'
import type { Gustos, Interes } from '../shared/gustos.js'
import { idEmpresa } from '../shared/ids.js'

export type LugarRecomendable = LugarPublico & {
  services?: string[]
  priceFromCop?: number | null
  plan?: 'aventura' | 'gastro' | 'cultura' | null
}

export interface Recomendacion {
  id: string
  nombre: string
  municipio: string
  categoria: string
  razones: string[]
  puntos: number
}

const TOPE_BAJO = 40_000
const TOPE_MEDIO = 120_000

const RAZON_INTERES: Record<Interes, string> = {
  naturaleza: 'Te gusta la naturaleza',
  aventura: 'Te gusta la aventura',
  gastronomia: 'Te gusta la buena mesa',
  cultura: 'Te gusta la cultura',
  artesania: 'Te gustan las artesanías',
  descanso: 'Buscas descanso',
  fotografia: 'Te gusta la fotografía',
}

function coincideInteres(i: Interes, cat: string, plan: string | null | undefined, texto: string): boolean {
  switch (i) {
    case 'naturaleza': return cat === 'naturaleza' || cat === 'atraccion'
    case 'aventura': return cat === 'operador' || plan === 'aventura' || ((cat === 'naturaleza' || cat === 'atraccion') && plan === 'aventura')
    case 'gastronomia': return cat === 'restaurante' || plan === 'gastro'
    case 'cultura': return cat === 'monumento' || plan === 'cultura'
    case 'artesania': return cat === 'comercio' || /artesan/.test(texto)
    case 'descanso': return cat === 'alojamiento' || /termal|descanso|tranquil|\bspa\b/.test(texto)
    case 'fotografia': return /mirador|paisaje|\bvista/.test(texto)
  }
}

const tieneServicio = (servicios: string[] | undefined, clave: string) =>
  (servicios ?? []).some((s) => norm(s).includes(clave))

export function puntuar(lugar: LugarRecomendable, g: Gustos): { puntos: number; razones: string[] } {
  const nombre = norm(lugar.nombre)
  const texto = `${nombre} ${norm(lugar.descripcion ?? '')}`
  for (const palabra of g.evitar) {
    const p = norm(palabra)
    if (p && texto.includes(p)) return { puntos: -Infinity, razones: [] }
  }
  let puntos = 0
  const razones: string[] = []
  const sumar = (n: number, razon?: string) => {
    puntos += n
    if (razon) razones.push(razon)
  }

  for (const i of g.intereses) if (coincideInteres(i, lugar.categoria, lugar.plan, texto)) sumar(3, RAZON_INTERES[i])

  if (g.municipio) {
    if (lugar.municipio === g.municipio) sumar(4, `Está en ${NOMBRE_MUNICIPIO[g.municipio] ?? g.municipio}`)
    else sumar(-3)
  }

  if (g.ritmo === 'tranquilo' && (lugar.categoria === 'alojamiento' || lugar.categoria === 'monumento' || /tranquil|descanso|termal/.test(texto))) sumar(1, 'Va con un ritmo tranquilo')
  if (g.ritmo === 'activo' && (lugar.categoria === 'operador' || lugar.plan === 'aventura')) sumar(1, 'Va con un plan activo')

  if (g.mascotas && tieneServicio(lugar.services, 'mascota')) sumar(3, 'Se admiten mascotas')
  if (g.conNinos && tieneServicio(lugar.services, 'nino')) sumar(3, 'Apto para niños')
  if (g.movilidadReducida && tieneServicio(lugar.services, 'silla de ruedas')) sumar(3, 'Acceso para silla de ruedas')

  const precio = lugar.priceFromCop
  if (g.presupuesto && typeof precio === 'number' && precio > 0) {
    const tope = g.presupuesto === 'bajo' ? TOPE_BAJO : g.presupuesto === 'medio' ? TOPE_MEDIO : Infinity
    if (precio <= tope) sumar(2, 'Dentro de tu presupuesto')
  }
  return { puntos, razones }
}

export function recomendar(lugares: LugarRecomendable[], g: Gustos, n = 5): Recomendacion[] {
  const conGustos = hayGustos(g)
  const evaluados = lugares
    .map((l) => ({ l, ...puntuar(l, g) }))
    .filter((x) => x.puntos !== -Infinity && (!conGustos || x.puntos > 0))
  evaluados.sort((a, b) => b.puntos - a.puntos || a.l.nombre.localeCompare(b.l.nombre, 'es') || (a.l.id < b.l.id ? -1 : a.l.id > b.l.id ? 1 : 0))
  const porCategoria = new Map<string, number>()
  const salida: Recomendacion[] = []
  for (const x of evaluados) {
    if (salida.length >= n) break
    const usados = porCategoria.get(x.l.categoria) ?? 0
    if (usados >= 2) continue
    porCategoria.set(x.l.categoria, usados + 1)
    salida.push({
      id: x.l.id,
      nombre: x.l.nombre,
      municipio: x.l.municipio,
      categoria: x.l.categoria,
      razones: x.razones.slice(0, 3),
      puntos: x.puntos,
    })
  }
  return salida
}

/** Catálogo estático (sin servicios de apoyo, salvo restaurantes) más las fichas publicadas. Si Supabase falla, solo el catálogo. */
export async function candidatosRecomendacion(fetchImpl: typeof fetch = fetch): Promise<LugarRecomendable[]> {
  const estaticos: LugarRecomendable[] = LUGARES
    .filter((l) => !l.esServicio || l.categoria === 'restaurante')
    .map((l) => ({
      id: l.id,
      nombre: l.nombre,
      categoria: l.categoria,
      municipio: l.municipio,
      lat: l.lat,
      lon: l.lon,
      precision: l.precision,
      descripcion: l.extra?.descripcion,
      plan: l.plan,
    }))
  try {
    const { negocios } = await listarFichasPublicas(fetchImpl)
    const empresas: LugarRecomendable[] = negocios.map((f) => ({
      id: idEmpresa(f.id),
      nombre: f.name,
      categoria: f.category,
      municipio: f.municipality,
      lat: f.lat,
      lon: f.lng,
      precision: f.lat != null && f.lng != null ? 'exacta' : null,
      descripcion: f.description,
      services: f.services,
      priceFromCop: f.priceFromCop,
    }))
    return [...estaticos, ...empresas]
  } catch {
    return estaticos
  }
}
