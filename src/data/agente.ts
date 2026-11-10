// Índice de destinos (lista blanca de links internos) y respondedor local por reglas para el asistente flotante.
// Lo usa también el servidor: por eso los imports relativos llevan extensión .js.
import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, getLugar } from './lugares.js'
import type { Lugar } from './lugares.js'
import type { Gustos } from '../../shared/gustos.js'

export interface LinkAgente { etiqueta: string; ruta: string; ancla: string | null }
export interface RecomendacionAgente { id: string; nombre: string; municipio: string; categoria: string; razones: string[]; ruta: string }
export interface RespuestaAgente {
  modo: 'openai' | 'catalogo'
  texto: string
  links: LinkAgente[]
  /** Gustos acumulados (previos del navegador + lo detectado en este mensaje). Solo en /api/agente. */
  gustos?: Gustos
  recomendaciones?: RecomendacionAgente[]
}

export const SUGERENCIAS: string[] = ['¿Qué hacer en Tenza?', 'Dónde dormir', 'Ver el mapa', 'Armar un plan']

const CATS = ['aventura', 'gastro', 'cultura', 'dormir'] as const
type Cat = (typeof CATS)[number]
const SLUGS = MUNICIPIOS.map((m) => m.slug)
const ANCLAS: Record<string, string[]> = { '/plan': ['plan-asistente', 'plan-resultado'] }

export const RESUMEN_DESTINOS: string = [
  'Rutas válidas del sitio (la parte después de # en la URL). Usa solo estas; no inventes otras.',
  '- /  : inicio. Sin parámetros ni anclas.',
  '- /plan : armar el plan de viaje. Parámetro opcional lugar=<id de un lugar del catálogo> (precarga «Quiero incluir X»). Anclas: plan-asistente (formulario para pedir el plan), plan-resultado.',
  `- /lugares : catálogo por categoría. Parámetro opcional cat = ${CATS.join(' | ')} (dormir = alojamiento). Parámetro opcional mun = ${SLUGS.join(' | ')}.`,
  '- /lugares/<id> : ficha de un lugar; el id debe existir en el catálogo.',
  '- /mapa : mapa de lugares. Parámetro opcional vista=ruta (muestra la ruta del plan).',
  `- /galeria : fotos del Valle. Parámetro opcional mun = ${SLUGS.join(' | ')}.`,
  'Cada link lleva etiqueta (1 a 60 caracteres), ruta y ancla (o null). Máximo 3 links por respuesta.',
  'La solicitud de reserva se envía desde «Armar mi plan» tras generar el plan; no confirma cupo, no cobra y no reserva.',
].join('\n')

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------- Validación ----------
export function validarLink(l: unknown): LinkAgente | null {
  if (!l || typeof l !== 'object') return null
  const { etiqueta, ruta, ancla } = l as Record<string, unknown>
  if (typeof etiqueta !== 'string' || typeof ruta !== 'string') return null
  const et = etiqueta.trim()
  if (et.length < 1 || et.length > 60) return null
  if (ancla !== undefined && ancla !== null && typeof ancla !== 'string') return null
  if (!ruta.startsWith('/') || ruta.startsWith('//') || /[:\\\s]|\.\./.test(ruta)) return null
  const [camino, ...resto] = ruta.split('?')
  if (resto.length > 1 || camino.includes('#')) return null
  const params = new URLSearchParams(resto[0] ?? '')
  const claves = [...params.keys()]
  if (new Set(claves).size !== claves.length) return null
  const val = (k: string) => params.get(k)
  let permitidas: string[] = []
  let rutaOk = ''
  if (camino === '/' || camino === '/mapa' || camino === '/galeria' || camino === '/plan' || camino === '/lugares') {
    rutaOk = camino
    if (camino === '/mapa') { permitidas = ['vista']; if (params.has('vista') && val('vista') !== 'ruta') return null }
    if (camino === '/galeria') { permitidas = ['mun']; if (params.has('mun') && !SLUGS.includes(val('mun')!)) return null }
    if (camino === '/plan') { permitidas = ['lugar']; if (params.has('lugar') && !getLugar(val('lugar')!)) return null }
    if (camino === '/lugares') {
      permitidas = ['cat', 'mun']
      if (params.has('cat') && !(CATS as readonly string[]).includes(val('cat')!)) return null
      if (params.has('mun') && !SLUGS.includes(val('mun')!)) return null
    }
  } else if (camino.startsWith('/lugares/')) {
    const id = camino.slice('/lugares/'.length)
    if (!id || id.includes('/') || !getLugar(id)) return null
    rutaOk = camino
  } else return null
  if (claves.some((k) => !permitidas.includes(k))) return null
  let anc: string | null = null
  if (typeof ancla === 'string' && ancla !== '') {
    if (!(ANCLAS[rutaOk] ?? []).includes(ancla)) return null
    anc = ancla
  }
  const orden = permitidas.filter((k) => params.has(k))
  const q = new URLSearchParams(orden.map((k) => [k, val(k)!] as [string, string]))
  const qs = q.toString()
  return { etiqueta: et, ruta: qs ? `${rutaOk}?${qs}` : rutaOk, ancla: anc }
}

// ---------- Respondedor local ----------
const GENERICAS = new Set([
  'hotel', 'hostal', 'restaurante', 'parque', 'iglesia', 'mirador', 'cafe', 'casa', 'finca', 'tienda', 'donde', 'quiero', 'para',
  'tenza', 'valle', 'lugar', 'lugares', 'plan', 'mapa', 'dormir', 'comer', 'sitio', 'sitios', 'hacer', 'cabana', 'glamping', 'como',
  'cual', 'cuales', 'puedo', 'ruta', 'fotos', 'foto', 'precio', 'cupo', 'reservar', 'cerca', 'queda', 'llegar', 'tiene', 'tienen',
  'este', 'esta', 'esto', 'muy', 'con', 'una', 'unos', 'quisiera', 'sobre', 'hay', 'viaje', 'dias', 'natural', 'centro', 'santa', 'san',
])
for (const m of MUNICIPIOS) for (const p of normalizar(m.nombre).split(' ')) GENERICAS.add(p)

const NO_COBERTURA = ['guateque', 'garagoa', 'macanal', 'bogota', 'tunja', 'villa de leyva']
const NOMBRES_MUN = MUNICIPIOS.map((m) => m.nombre)
const LISTA_MUN = `${NOMBRES_MUN.slice(0, -1).join(', ')} y ${NOMBRES_MUN[NOMBRES_MUN.length - 1]}`

const reEn = (re: RegExp, t: string) => re.test(t)
const RE = {
  dormir: /dormir|hotel|hosped|alojam|hostal|cabana|glamping|finca/,
  comer: /comer|restaur|cafe|almorz|gastro|comida|desayun|cenar/,
  cultura: /cultur|iglesia|museo|artesan|histori|monument/,
  aventura: /naturalez|aventur|cascada|sender|caminat|mirador|cerro|parapente|\brio\b|paisaje/,
  mapa: /mapa|ubicac|donde queda|como llego|como llegar/,
  ruta: /mi ruta|recorrido/,
  fotos: /foto|galeria|imagen/,
  plan: /plan|itinerario|armar|fin de semana|dias|viaje|escapada/,
  solicitud: /reserv|solicitud|precio|costo|cupo|pagar|cobr/,
}

function detectarMunicipio(t: string): string | null {
  const palabras = ` ${t} `
  for (const m of MUNICIPIOS) {
    if (palabras.includes(` ${m.slug.replace(/-/g, ' ')} `) || palabras.includes(` ${normalizar(m.nombre)} `)) return m.slug
  }
  if (/\bcapilla\b/.test(t)) return 'la-capilla'
  return null
}

const candidatos = (): Lugar[] => LUGARES.filter((l) => !l.esServicio || l.categoria === 'restaurante' || l.categoria === 'alojamiento')

function detectarLugar(t: string): Lugar | null {
  const cand = candidatos()
  const completos = cand.filter((l) => { const n = normalizar(l.nombre); return n.length >= 4 && ` ${t} `.includes(` ${n} `) })
  if (completos.length) return completos.sort((a, b) => b.nombre.length - a.nombre.length)[0]
  const palabrasPregunta = new Set(t.split(' ').filter((p) => p.length >= 4 && !GENERICAS.has(p)))
  if (!palabrasPregunta.size) return null
  let mejor: Lugar | null = null
  let puntos = 0
  let empate = false
  for (const l of cand) {
    const sig = new Set(normalizar(l.nombre).split(' ').filter((p) => p.length >= 4 && !GENERICAS.has(p)))
    let n = 0
    for (const p of sig) if (palabrasPregunta.has(p)) n++
    if (n > puntos) { puntos = n; mejor = l; empate = false } else if (n > 0 && n === puntos && mejor?.id !== l.id) empate = true
  }
  return mejor && !empate ? mejor : null
}

function contar(cat: Cat, mun: string | null): number {
  return LUGARES.filter((l) => (cat === 'dormir' ? l.categoria === 'alojamiento' : l.plan === cat) && (!mun || l.municipio === mun)).length
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const lugarLink = (cat: Cat, mun: string | null, etiqueta: string): LinkAgente => ({
  etiqueta, ruta: `/lugares?cat=${cat}${mun ? `&mun=${mun}` : ''}`, ancla: null,
})

export function responderLocal(pregunta: string): RespuestaAgente {
  const t = normalizar(String(pregunta ?? ''))
  const links: LinkAgente[] = []
  const frases: string[] = []
  const salir = (): RespuestaAgente => {
    const vistos = new Set<string>()
    const validos: LinkAgente[] = []
    for (const l of links) {
      const v = validarLink(l)
      const clave = v ? `${v.ruta}#${v.ancla ?? ''}` : ''
      if (v && !vistos.has(clave)) { vistos.add(clave); validos.push(v) }
    }
    return { modo: 'catalogo', texto: frases.join(' '), links: validos.slice(0, 3) }
  }

  // Municipios fuera de cobertura
  const fuera = NO_COBERTURA.find((n) => ` ${t} `.includes(` ${n} `))
  if (fuera) {
    frases.push(`El catálogo solo cubre 7 municipios del Valle de Tenza: ${LISTA_MUN}.`, 'Puedes explorar lo que sí tenemos.')
    links.push({ etiqueta: 'Ver los lugares', ruta: '/lugares', ancla: null }, { etiqueta: 'Ver el mapa', ruta: '/mapa', ancla: null })
    return salir()
  }

  const mun = detectarMunicipio(t)
  const nomMun = mun ? NOMBRE_MUNICIPIO[mun] : null
  const lugar = detectarLugar(t)
  const i = Object.fromEntries(Object.entries(RE).map(([k, re]) => [k, reEn(re, t)])) as Record<keyof typeof RE, boolean>

  if (lugar) {
    const where = NOMBRE_MUNICIPIO[lugar.municipio] ?? lugar.municipio
    frases.push(`${lugar.nombre} está en el catálogo (${where}).`)
    links.push({ etiqueta: 'Ver la ficha', ruta: `/lugares/${lugar.id}`, ancla: null }, { etiqueta: 'Incluirlo en un plan', ruta: `/plan?lugar=${lugar.id}`, ancla: null })
  }

  if (i.solicitud) {
    frases.push('La solicitud se envía en «Armar mi plan» después de generar el plan. Enviarla no confirma cupo, no cobra y no reserva: el prestador te responde y se acuerda directamente con él. No tenemos precios ni disponibilidad confirmados.')
    links.push({ etiqueta: 'Armar mi plan', ruta: '/plan', ancla: 'plan-asistente' })
    return salir()
  }

  const cats: Cat[] = []
  if (i.dormir) cats.push('dormir')
  if (i.comer) cats.push('gastro')
  if (i.cultura) cats.push('cultura')
  if (i.aventura) cats.push('aventura')
  const dónde = nomMun ? ` en ${nomMun}` : ''
  const etiq: Record<Cat, [string, string, string]> = {
    dormir: ['lugar para dormir', 'lugares para dormir', 'Dónde dormir'],
    gastro: ['lugar para comer', 'lugares para comer', 'Dónde comer'],
    cultura: ['lugar de cultura', 'lugares de cultura', 'Ver cultura'],
    aventura: ['lugar de naturaleza y aventura', 'lugares de naturaleza y aventura', 'Ver naturaleza'],
  }

  if (!lugar && cats.length) {
    for (const c of cats) {
      const n = contar(c, mun)
      if (n > 0) {
        frases.push(`${nomMun ? `En ${nomMun} hay` : 'En el catálogo hay'} ${plural(n, etiq[c][0], etiq[c][1])}.`)
        links.push(lugarLink(c, mun, etiq[c][2]))
      } else frases.push(`No hay ${etiq[c][1]}${dónde} en el catálogo.`)
    }
  } else if (!lugar && mun && !i.mapa && !i.fotos && !i.plan && !i.ruta) {
    const partes: string[] = []
    for (const [c, nombre, et] of [['aventura', 'de naturaleza y aventura', 'Naturaleza y aventura'], ['gastro', 'para comer', 'Dónde comer'], ['dormir', 'para dormir', 'Dónde dormir']] as [Cat, string, string][]) {
      const n = contar(c, mun)
      if (n > 0) { partes.push(`${n} ${nombre}`); links.push(lugarLink(c, mun, et)) }
    }
    frases.push(partes.length ? `En ${nomMun} el catálogo tiene ${partes.join(', ')}.` : `Por ahora el catálogo no tiene lugares en ${nomMun}.`)
  }

  if (i.mapa) {
    frases.push('Puedes ubicar los lugares en el mapa.')
    links.push({ etiqueta: 'Ver el mapa', ruta: '/mapa', ancla: null })
  }
  if (i.ruta) {
    frases.push('Tu ruta se dibuja en el mapa cuando tienes un plan generado.')
    links.push({ etiqueta: 'Ver mi ruta', ruta: '/mapa?vista=ruta', ancla: null })
  }
  if (i.fotos) {
    frases.push('Hay una galería de fotos del Valle.')
    links.push({ etiqueta: 'Ver la galería', ruta: mun ? `/galeria?mun=${mun}` : '/galeria', ancla: null })
  }
  if (i.plan && !lugar) {
    frases.push('Puedes armar un plan de viaje por días según lo que te guste.')
    links.push({ etiqueta: 'Armar mi plan', ruta: '/plan', ancla: 'plan-asistente' })
  }

  if (!frases.length) {
    frases.push(`Puedo ayudarte a encontrar dónde dormir, comer o qué visitar en ${LISTA_MUN}, y llevarte al plan o al mapa.`)
    links.push({ etiqueta: 'Armar mi plan', ruta: '/plan', ancla: 'plan-asistente' }, { etiqueta: 'Ver los lugares', ruta: '/lugares', ancla: null }, { etiqueta: 'Ver el mapa', ruta: '/mapa', ancla: null })
  }
  return salir()
}
