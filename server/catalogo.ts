import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, tieneUbicacion } from '../src/data/lugares.js'
import type { CategoriaId, Lugar } from '../src/data/lugares.js'
import type { Categoria } from '../src/data/planes.js'
import { norm } from './texto.js'

export const SLUGS = MUNICIPIOS.map((m) => m.slug)
export const PLANES_ID: Categoria[] = ['aventura', 'gastro', 'cultura']

// Municipios y ciudades que la gente pide y que NO están en el JSON de los 7.
const FUERA = ['guateque', 'garagoa', 'macanal', 'bogota', 'tunja', 'villa de leyva', 'macheta', 'ubala', 'gachala', 'santa maria', 'villapinzon', 'choconta']

export interface LugarPublico {
  id: string
  nombre: string
  categoria: CategoriaId
  municipio: string
  lat: number | null
  lon: number | null
  precision: Lugar['precision']
  descripcion?: string
}

export function publico(l: Lugar): LugarPublico {
  return {
    id: l.id,
    nombre: l.nombre,
    categoria: l.categoria,
    municipio: l.municipio,
    lat: tieneUbicacion(l) ? l.lat : null,
    lon: tieneUbicacion(l) ? l.lon : null,
    precision: l.precision,
  }
}

export function porId(id: string): Lugar | undefined {
  return LUGARES.find((l) => l.id === id)
}

export interface ConsultaLugares {
  municipio?: string
  plan?: Categoria
  categoria?: CategoriaId
  texto?: string
  limite?: number
}

export function buscarLugares(q: ConsultaLugares): LugarPublico[] {
  const limite = Math.min(40, Math.max(1, q.limite ?? 8))
  const texto = norm(q.texto ?? '')
  const tokens = texto.split(' ').filter((w) => w.length >= 3)
  let lista = LUGARES.filter((l) => !l.esServicio || l.categoria === 'restaurante')
  if (q.municipio && SLUGS.includes(q.municipio)) lista = lista.filter((l) => l.municipio === q.municipio)
  if (q.categoria) lista = lista.filter((l) => l.categoria === q.categoria)
  if (q.plan) {
    const preferidos = lista.filter((l) => l.plan === q.plan || l.categoria === 'alojamiento' || l.categoria === 'restaurante')
    if (preferidos.length) lista = preferidos
  }
  const puntuados = lista.map((l) => {
    const n = norm(l.nombre)
    const aciertos = tokens.filter((t) => n.includes(t)).length
    const base = q.plan && l.plan === q.plan ? 2 : 0
    const ubi = tieneUbicacion(l) ? 1 : 0
    return { l, s: aciertos * 5 + base + ubi }
  })
  puntuados.sort((a, b) => b.s - a.s || a.l.nombre.localeCompare(b.l.nombre, 'es'))
  const elegidos = (tokens.length ? puntuados.filter((x) => x.s > 0) : puntuados).slice(0, limite)
  const final = elegidos.length ? elegidos : puntuados.slice(0, limite)
  return final.map((x) => publico(x.l))
}

export interface Preferencias {
  plan: Categoria
  municipio: string
  dias: number
  fuera: string[]
  texto: string
}

export function leerPreferencias(texto: string, chips?: { plan?: string; municipio?: string; dias?: number }):
  | { ok: true; prefs: Preferencias; soloFuera: false }
  | { ok: false; error: 'fuera_de_catalogo'; fuera: string[] } {
  const t = norm(texto)
  const mencionados = MUNICIPIOS.filter((m) => t.includes(norm(m.nombre))).map((m) => m.slug)
  const fuera = FUERA.filter((f) => t.includes(f))
  const planChip = PLANES_ID.find((p) => p === chips?.plan)
  const munChip = SLUGS.includes(chips?.municipio ?? '') ? chips!.municipio! : ''
  const diasChip = typeof chips?.dias === 'number' && chips.dias >= 1 && chips.dias <= 3 ? Math.round(chips.dias) : undefined
  let plan: Categoria = planChip ?? 'aventura'
  if (!planChip) {
    if (/\b(comer|comida|restaurante|gastronomia|sabor)\b/.test(t)) plan = 'gastro'
    else if (/\b(iglesia|cultura|artesania|historia|museo|monumento)\b/.test(t)) plan = 'cultura'
    else if (/\b(naturaleza|caminata|sendero|cerro|aventura)\b/.test(t)) plan = 'aventura'
  }
  let dias = diasChip ?? 2
  if (!diasChip) {
    const m = t.match(/\b([123])\b/)
    if (/\bun dia\b|\b1 dia\b/.test(t)) dias = 1
    else if (/\btres dias\b|\b3 dias\b/.test(t)) dias = 3
    else if (/\bdos dias\b|\b2 dias\b/.test(t)) dias = 2
    else if (m && /\bdia/.test(t)) dias = Number(m[1])
  }
  const municipio = munChip || mencionados[0] || ''
  if (fuera.length && !municipio) return { ok: false, error: 'fuera_de_catalogo', fuera }
  return { ok: true, soloFuera: false, prefs: { plan, municipio, dias, fuera, texto } }
}

export function nombreMunicipio(slug: string): string {
  return NOMBRE_MUNICIPIO[slug] ?? slug
}

export function listaMunicipios(): string {
  return MUNICIPIOS.map((m) => m.nombre).join(', ')
}
