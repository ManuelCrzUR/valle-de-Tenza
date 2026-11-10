// Gustos del viajero. Sin dependencias: lo usan el navegador y el servidor.
export const INTERESES = ['naturaleza', 'aventura', 'gastronomia', 'cultura', 'artesania', 'descanso', 'fotografia'] as const
export type Interes = (typeof INTERESES)[number]

export interface Gustos {
  intereses: Interes[]
  ritmo: 'tranquilo' | 'activo' | null
  presupuesto: 'bajo' | 'medio' | 'alto' | null
  conNinos: boolean | null
  mascotas: boolean | null
  movilidadReducida: boolean | null
  evitar: string[]
  municipio: string | null
}

export const GUSTOS_VACIOS: Gustos = Object.freeze({
  intereses: [],
  ritmo: null,
  presupuesto: null,
  conNinos: null,
  mascotas: null,
  movilidadReducida: null,
  evitar: [],
  municipio: null,
}) as Gustos

const MAX_EVITAR = 5
const MAX_PALABRA = 30

const quitarTildes = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

function listaEvitar(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const p = quitarTildes(x.slice(0, 100))
    if (p.length < 2 || p.length > MAX_PALABRA || out.includes(p)) continue
    out.push(p)
    if (out.length >= MAX_EVITAR) break
  }
  return out
}

/** Valida y recorta lo que venga del navegador o del modelo. Nunca lanza. */
export function normalizarGustos(x: unknown, slugs: readonly string[]): Gustos {
  try {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { ...GUSTOS_VACIOS, intereses: [], evitar: [] }
    const o = x as Record<string, unknown>
    const intereses: Interes[] = []
    if (Array.isArray(o.intereses)) {
      for (const i of o.intereses) {
        if (typeof i === 'string' && (INTERESES as readonly string[]).includes(i) && !intereses.includes(i as Interes)) intereses.push(i as Interes)
      }
    }
    return {
      intereses,
      ritmo: o.ritmo === 'tranquilo' || o.ritmo === 'activo' ? o.ritmo : null,
      presupuesto: o.presupuesto === 'bajo' || o.presupuesto === 'medio' || o.presupuesto === 'alto' ? o.presupuesto : null,
      conNinos: bool(o.conNinos),
      mascotas: bool(o.mascotas),
      movilidadReducida: bool(o.movilidadReducida),
      evitar: listaEvitar(o.evitar),
      municipio: typeof o.municipio === 'string' && slugs.includes(o.municipio) ? o.municipio : null,
    }
  } catch {
    return { ...GUSTOS_VACIOS, intereses: [], evitar: [] }
  }
}

/** Une intereses y evitar; los escalares nuevos no nulos reemplazan a los previos. */
export function fusionarGustos(previos: Gustos, nuevos: Partial<Gustos>): Gustos {
  const intereses = [...previos.intereses]
  for (const i of nuevos.intereses ?? []) if (!intereses.includes(i) && intereses.length < INTERESES.length) intereses.push(i)
  const evitar = [...previos.evitar]
  for (const e of nuevos.evitar ?? []) if (!evitar.includes(e) && evitar.length < MAX_EVITAR) evitar.push(e)
  const esc = <K extends 'ritmo' | 'presupuesto' | 'conNinos' | 'mascotas' | 'movilidadReducida' | 'municipio'>(k: K): Gustos[K] =>
    nuevos[k] !== undefined && nuevos[k] !== null ? (nuevos[k] as Gustos[K]) : previos[k]
  return {
    intereses,
    evitar,
    ritmo: esc('ritmo'),
    presupuesto: esc('presupuesto'),
    conNinos: esc('conNinos'),
    mascotas: esc('mascotas'),
    movilidadReducida: esc('movilidadReducida'),
    municipio: esc('municipio'),
  }
}

const TEXTO_INTERES: Record<Interes, string> = {
  naturaleza: 'Naturaleza',
  aventura: 'Aventura',
  gastronomia: 'Gastronomía',
  cultura: 'Cultura',
  artesania: 'Artesanía',
  descanso: 'Descanso',
  fotografia: 'Fotografía',
}

export function etiquetasGustos(g: Gustos, nombresMunicipio: Record<string, string> = {}): { clave: string; texto: string }[] {
  const e: { clave: string; texto: string }[] = []
  for (const i of g.intereses) e.push({ clave: `interes:${i}`, texto: TEXTO_INTERES[i] })
  if (g.ritmo === 'tranquilo') e.push({ clave: 'ritmo', texto: 'Sin prisa' })
  if (g.ritmo === 'activo') e.push({ clave: 'ritmo', texto: 'Plan activo' })
  if (g.presupuesto) e.push({ clave: 'presupuesto', texto: `Presupuesto ${g.presupuesto}` })
  if (g.conNinos) e.push({ clave: 'conNinos', texto: 'Con niños' })
  if (g.mascotas) e.push({ clave: 'mascotas', texto: 'Con mascota' })
  if (g.movilidadReducida) e.push({ clave: 'movilidadReducida', texto: 'Movilidad reducida' })
  for (const x of g.evitar) e.push({ clave: `evitar:${x}`, texto: `Evitar: ${x}` })
  if (g.municipio) e.push({ clave: 'municipio', texto: `En ${nombresMunicipio[g.municipio] ?? g.municipio}` })
  return e
}

export function hayGustos(g: Gustos): boolean {
  return (
    g.intereses.length > 0 || g.ritmo !== null || g.presupuesto !== null || g.conNinos === true ||
    g.mascotas === true || g.movilidadReducida === true || g.evitar.length > 0 || g.municipio !== null
  )
}
