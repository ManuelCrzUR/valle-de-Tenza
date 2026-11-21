import type { Gustos, Interes } from '../../shared/gustos.js'

// Respaldo sin IA: detecta gustos del viajero por palabras clave.
// Trabaja sobre texto normalizado: minúsculas, sin tildes ni ñ (ñ pasa a n).

type Municipio = { slug: string; nombre: string }

const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const REGLAS_INTERES: [Interes, RegExp][] = [
  ['naturaleza', /\b(naturaleza|cascadas?|rios?|bosques?|montanas?|cerros?|paisaje natural|aire libre)\b/],
  ['aventura', /\b(aventura|caminatas?|senderismo|trekking|escalar|parapente|extremo)\b/],
  ['gastronomia', /\b(comer|comida|gastronomia|restaurantes?|platos tipicos|cafes?|probar)\b/],
  ['cultura', /\b(cultura|historia|iglesias?|museos?|patrimonio|tradicion(es)?)\b/],
  ['artesania', /\b(artesanias?|artesanos?|tejidos?|ceramica|canastos?)\b/],
  ['descanso', /\b(descansar|descanso|relajar|tranquil[oa]s?|desconectar|termales?|spa)\b/],
  ['fotografia', /\b(fotos?|fotografia|miradores?|atardecer)\b/],
]

const RITMO_TRANQUILO = /\b(tranquil[oa]s?|sin prisa|relajad[oa]s?|despacio)\b/
const RITMO_ACTIVO = /\b(activ[oa]s?|intens[oa]s?|mucha actividad|full)\b/

const PRESUPUESTOS: [NonNullable<Gustos['presupuesto']>, RegExp][] = [
  ['bajo', /\b(barat[oa]s?|economic[oa]s?|poco presupuesto|bajo costo|ahorrar)\b/],
  ['medio', /\b(precio medio|moderad[oa]s?)\b/],
  ['alto', /\b(lujo|sin importar el precio|premium)\b/],
]

const CON_NINOS = /\bcon (mis |mi )?(hijos?|ninos?|ninas?|bebes?|familia)\b/
const MASCOTAS = /\bcon (mi |mis )?(perr[oa]s?|perrit[oa]s?|gat[oa]s?|mascotas?)\b/
const MOVILIDAD = /\b(silla de ruedas|movilidad reducida|adultos? mayores?|abuel[oa]s?)\b/

const ARTICULO = '(?:(?:el|la|los|las|un|una|unos|unas)\\s+)?'

// Patrones con grupo 1 = palabra a evitar. Deben usarse con matchAll (flag g).
const PATRONES_EVITAR: RegExp[] = [
  new RegExp(`\\bno me gust(?:a|an)\\s+${ARTICULO}([a-z]{3,})\\b`, 'g'),
  new RegExp(`\\bevitar\\s+${ARTICULO}([a-z]{3,})\\b`, 'g'),
  new RegExp(`\\b(?:sin|nada de)\\s+${ARTICULO}([a-z]{3,})\\b`, 'g'),
]

// Palabras que siguen a «sin» o «evitar» pero no son algo que evitar.
const NO_EVITAR = new Set([
  'prisa', 'afan', 'apuro', 'importar', 'embargo', 'duda', 'nada', 'nadie', 'algo',
  'mucho', 'mucha', 'muchos', 'muchas', 'tanto', 'tanta', 'ninguno', 'ninguna',
  'problema', 'problemas', 'dinero', 'precio', 'costo', 'esfuerzo', 'pena', 'demasiado', 'demasiada',
])

const MAX_EVITAR = 5

function detectarMunicipio(t: string, municipios: Municipio[]): string | null {
  let mejor: { slug: string; pos: number } | null = null
  for (const m of municipios) {
    const n = normalizar(m.nombre).trim()
    if (!n) continue
    const pos = t.search(new RegExp(`\\b${escapar(n)}\\b`))
    if (pos >= 0 && (!mejor || pos < mejor.pos)) mejor = { slug: m.slug, pos }
  }
  return mejor?.slug ?? null
}

export function leerGustosLocal(texto: string, slugsYNombres: { slug: string; nombre: string }[]): Partial<Gustos> {
  const t = normalizar(texto)
  const r: Partial<Gustos> = {}

  // Lo negado («nada de iglesias», «no me gustan las caminatas») no cuenta como interés.
  let tPositivo = t
  for (const patron of PATRONES_EVITAR) {
    tPositivo = tPositivo.replace(patron, (todo, palabra: string) => (NO_EVITAR.has(palabra) ? todo : ' '))
  }
  const intereses = REGLAS_INTERES.filter(([, re]) => re.test(tPositivo)).map(([i]) => i)
  if (intereses.length) r.intereses = intereses

  if (RITMO_TRANQUILO.test(t)) r.ritmo = 'tranquilo'
  else if (RITMO_ACTIVO.test(t)) r.ritmo = 'activo'

  const presupuesto = PRESUPUESTOS.find(([, re]) => re.test(t))
  if (presupuesto) r.presupuesto = presupuesto[0]

  if (CON_NINOS.test(t)) r.conNinos = true
  if (MASCOTAS.test(t)) r.mascotas = true
  if (MOVILIDAD.test(t)) r.movilidadReducida = true

  const evitar: string[] = []
  for (const patron of PATRONES_EVITAR) {
    for (const m of t.matchAll(patron)) {
      const palabra = m[1]
      if (palabra.length < 3 || NO_EVITAR.has(palabra) || evitar.includes(palabra)) continue
      if (evitar.length < MAX_EVITAR) evitar.push(palabra)
    }
  }
  if (evitar.length) r.evitar = evitar

  const municipio = detectarMunicipio(t, slugsYNombres)
  if (municipio) r.municipio = municipio

  return r
}
