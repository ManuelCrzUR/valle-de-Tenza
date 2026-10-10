// Asistente local del chat: entiende frases en español y responde SOLO con los lugares reales de lugares.json
// y con el generador de rutas. Es una función pura (sin React ni localStorage): los negocios y reservas llegan en el contexto.
import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, CATEGORIA_POR_ID, tipoReserva, metros, tieneUbicacion, esAproximado } from './lugares'
import type { CategoriaId, Lugar } from './lugares'
import { generarPlan, ordenRuta, distanciasRuta, km, MAX_SALTO_M, DIAS_MAX } from './generarPlan'
import type { Itinerario, RutaPersonal } from './generarPlan'
import type { Categoria } from './planes'
import { cupoLibre, negocioDeLugar, hoy } from '../state/demo'
import type { Negocio, Reserva } from '../state/demo'

export interface UltimaRuta { planId: Categoria; municipio: string; dias: number; semilla: number }
export interface Contexto { ultimaRuta?: UltimaRuta; negocios: Negocio[]; reservas: Reserva[] }
export interface Tarjeta { lugarId: string; titulo: string; detalle: string; reservable: boolean }
export interface Accion { tipo: 'usar-ruta' | 'ver-ruta-itinerario' | 'reservar' | 'ver-mapa' | 'ver-lugar'; etiqueta: string; to?: string }
export interface Respuesta { texto: string; tarjetas?: Tarjeta[]; ruta?: RutaPersonal; acciones?: Accion[]; contexto?: Partial<Contexto> }

export const EJEMPLOS = [
  'Arma una ruta de aventura de 2 días en Chivor',
  'Dónde comer cerca de Tenza',
  'Quiero reservar un hotel en Almeida',
]

// ---------- Texto ----------
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const NUMEROS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 }
const PLANES: { id: Categoria; re: RegExp }[] = [
  { id: 'aventura', re: /\b(naturaleza|caminata\w*|senderi\w*|cerros?|montana\w*|aventura\w*|trekking)\b/ },
  { id: 'gastro', re: /\b(comer|comida\w*|restaurante\w*|gastronomi\w*|probar|sabores?)\b/ },
  { id: 'cultura', re: /\b(iglesias?|cultur\w*|artesani\w*|historia|museos?|monumentos?|patrimonio)\b/ },
]
const nombrePlan = (id: Categoria) => ({ aventura: 'aventura', gastro: 'gastronomía', cultura: 'cultura' })[id]

function detectarDias(t: string): { dias?: number; pidio?: number } {
  if (/\bfin de semana\b|\bfinde\b/.test(t)) return { dias: 2, pidio: 2 }
  if (/\buna semana\b/.test(t)) return { dias: DIAS_MAX, pidio: 7 }
  const m = t.match(/\b(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco)\s+dias?\b/) ?? t.match(/\b(pasadia)\b/)
  if (!m) return {}
  const n = m[1] === 'pasadia' ? 1 : /^\d/.test(m[1]) ? parseInt(m[1], 10) : NUMEROS[m[1]]
  if (!n) return {}
  return { dias: Math.min(DIAS_MAX, Math.max(1, n)), pidio: n }
}
function detectarPlan(t: string): Categoria | undefined {
  let mejor: { id: Categoria; i: number } | undefined
  for (const p of PLANES) { const i = t.search(p.re); if (i >= 0 && (!mejor || i < mejor.i)) mejor = { id: p.id, i } }
  return mejor?.id
}
const MUNI = MUNICIPIOS.map((m) => ({ slug: m.slug, nombre: m.nombre, n: norm(m.nombre), centro: m.centro }))
function detectarMunicipio(t: string) {
  let mejor: { slug: string; i: number } | undefined
  for (const m of MUNI) { const i = t.search(new RegExp(`\\b${m.n}\\b`)); if (i >= 0 && (!mejor || i < mejor.i)) mejor = { slug: m.slug, i } }
  return mejor?.slug
}
const nomMuni = (slug: string) => NOMBRE_MUNICIPIO[slug] ?? slug

// Categorías que se piden por palabra clave.
const PEDIDOS: { re: RegExp; cats: CategoriaId[]; etiqueta: string }[] = [
  { re: /\b(comer|comida|almorzar|almuerzo|cenar|desayunar|restaurantes?|cafes?|cafeteria\w*)\b/, cats: ['restaurante'], etiqueta: 'restaurantes y cafés' },
  { re: /\b(dormir|hotel(es)?|hospedaje\w*|hospedar\w*|alojamiento\w*|alojar\w*|hostal\w*|posadas?|cabanas?)\b/, cats: ['alojamiento'], etiqueta: 'alojamientos' },
  { re: /\b(actividad\w*|hacer|visitar|caminatas?|miradores?|senderos?|guias?|agencias?|monumentos?|iglesias?|parques?|naturaleza)\b/, cats: ['atraccion', 'naturaleza', 'operador', 'monumento'], etiqueta: 'actividades y sitios para visitar' },
]
const detectarPedido = (t: string) => PEDIDOS.find((p) => p.re.test(t))

// ---------- Búsqueda de lugares por nombre ----------
const GENERICAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'e', 'hotel', 'hostal', 'restaurante', 'finca', 'casa', 'cabanas', 'cabana', 'posada', 'cafe', 'parque'])
const MUNI_TOKENS = new Set(MUNI.flatMap((m) => m.n.split(' ')))
const sig = (s: string) => norm(s).split(' ').filter((w) => w.length >= 3 && !GENERICAS.has(w) && !MUNI_TOKENS.has(w))
const INDICE = LUGARES.map((l) => ({ l, tokens: sig(l.nombre) })).filter((x) => x.tokens.length > 0)

function lev1(a: string, b: string) {   // ¿a y b difieren en a lo sumo una letra?
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, d = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++d > 1) return false
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++ }
  }
  return d + (a.length - i) + (b.length - j) <= 1
}
interface Candidato { l: Lugar; score: number; n: number }
function buscarPorNombre(t: string): Candidato[] {
  const q = t.split(' ').filter((w) => w.length >= 3)
  const parecidoAMuni = (w: string) => [...MUNI_TOKENS].some((m) => m.length >= 4 && lev1(w, m))
  const vistos = new Set<string>()
  return INDICE.map(({ l, tokens }) => {
    const n = tokens.filter((tk) => q.some((w) => w === tk || (tk.length >= 5 && w.length >= 5 && !parecidoAMuni(w) && lev1(w, tk)))).length
    return { l, n, score: n / tokens.length }
  })
    .filter((c) => c.n >= 1 && c.score >= 0.5)
    .sort((a, b) => b.score - a.score || b.n - a.n || Number(b.l.conRegistro) - Number(a.l.conRegistro))
    .filter((c) => { const k = `${norm(c.l.nombre)}|${c.l.municipio}`; if (vistos.has(k)) return false; vistos.add(k); return true })
}

// ---------- Utilidades de respuesta ----------
const nombreTipo = (l: Lugar) => CATEGORIA_POR_ID[l.categoria]?.singular ?? l.categoria
function tarjeta(l: Lugar, extra?: string): Tarjeta {
  const partes = [nomMuni(l.municipio), nombreTipo(l)]
  if (extra) partes.push(extra)
  if (tieneUbicacion(l) && esAproximado(l)) partes.push('ubicación aproximada')
  return { lugarId: l.id, titulo: l.nombre, detalle: partes.join(' · '), reservable: tipoReserva(l) !== null }
}
function estadoCupo(l: Lugar, ctx: Contexto): string {
  const neg = negocioDeLugar(ctx.negocios, l.id)
  if (!neg) return 'Aún no tiene prestador en la app: un embajador tramita la solicitud.'
  const n = cupoLibre({ reservas: ctx.reservas }, neg, hoy())
  return n > 0 ? `Cupo hoy: ${n}.` : 'Hoy no le quedan cupos; puedes elegir otra fecha al reservar.'
}
const aRutaPersonal = (it: Itinerario): RutaPersonal => ({
  planId: it.plan.id, municipio: it.municipio,
  dias: it.dias.map((d) => ({ paradas: d.paradas.map((l) => l.id), comida: d.comida?.id })),
  hospedaje: it.hospedaje?.id,
})

// ---------- Intenciones ----------
function armarRuta(planId: Categoria, municipio: string, dias: number, semilla: number, previo: string[] = []): Respuesta {
  const it = generarPlan(planId, municipio, semilla, dias)
  const contexto = { ultimaRuta: { planId, municipio, dias, semilla } }
  if (!it || !it.paradas.length) {
    return { texto: [...previo, `No encontré paradas de ${nombrePlan(planId)} con ubicación${municipio ? ` en ${nomMuni(municipio)}` : ''}. Prueba con otro tipo de plan u otro municipio.`, ...(it?.avisos ?? [])].join('\n'), contexto }
  }
  const pasos = ordenRuta(it)
  const ds = distanciasRuta(pasos)
  const lineas: string[] = [...previo]
  lineas.push(`Armé una ruta de ${nombrePlan(planId)} de ${it.dias.length} ${it.dias.length === 1 ? 'día' : 'días'} centrada en ${nomMuni(it.municipio)}:`)
  const etiqueta = { parada: '•', comida: 'Almuerzo:', hospedaje: 'Dormir:' }
  let dia = 0
  pasos.forEach((p, i) => {
    if (p.dia !== dia) { dia = p.dia; lineas.push(`\nDía ${dia}`) }
    lineas.push(`${etiqueta[p.rol]} ${p.lugar.nombre} (${nomMuni(p.lugar.municipio)})${ds[i] !== undefined ? `, a ${km(ds[i]!)} del paso anterior` : ''}`)
  })
  if (!it.hospedaje) lineas.push('\nNo encontré un hospedaje con ubicación cerca de esta ruta.')
  if (it.avisos.length) lineas.push('\nOjo:', ...it.avisos.map((a) => `- ${a}`))
  lineas.push('\nSi quieres otra combinación, escribe «otra opción»; también puedes decir «mejor 3 días», «en Chivor» o «de gastronomía».')
  return {
    texto: lineas.join('\n'),
    ruta: aRutaPersonal(it),
    acciones: [
      { tipo: 'usar-ruta', etiqueta: 'Usar esta ruta', to: '/mapa?vista=ruta' },
      { tipo: 'ver-ruta-itinerario', etiqueta: 'Ver en Itinerario', to: '/itinerario' },
    ],
    contexto,
  }
}

function cerca(t: string): Respuesta {
  const pedido = detectarPedido(t)
  const candidato = buscarPorNombre(t).find((c) => c.score === 1)
  const muni = detectarMunicipio(t)
  let origen: { nombre: string; punto: [number, number]; lugarId?: string } | undefined
  let falla = ''
  if (candidato) {
    if (tieneUbicacion(candidato.l)) origen = { nombre: candidato.l.nombre, punto: [candidato.l.lat, candidato.l.lon], lugarId: candidato.l.id }
    else falla = `«${candidato.l.nombre}» no tiene ubicación en el mapa, así que no puedo medir qué queda cerca.`
  } else if (muni) {
    const c = MUNI.find((m) => m.slug === muni)?.centro
    if (c) origen = { nombre: `el centro de ${nomMuni(muni)}`, punto: c }
    else falla = `No tengo el centro de ${nomMuni(muni)} en el mapa, así que no puedo medir distancias desde allí.`
  }
  if (falla) return { texto: falla }
  if (!origen) {
    return { texto: `¿Cerca de qué lugar o municipio? Dime, por ejemplo, «${pedido?.cats[0] === 'restaurante' ? 'dónde comer cerca de Tenza' : 'qué hay cerca de Chivor'}». Conozco: ${MUNI.map((m) => m.nombre).join(', ')}.` }
  }
  const cats = pedido?.cats
  const lista = (LUGARES.filter(tieneUbicacion) as (Lugar & { lat: number; lon: number })[])
    .filter((l) => l.id !== origen!.lugarId && (cats ? cats.includes(l.categoria) : !CATEGORIA_POR_ID[l.categoria]?.servicio))
    .map((l) => ({ l, d: metros(origen!.punto, [l.lat, l.lon]) }))
    .sort((a, b) => a.d - b.d)
  const vistos = new Set<string>()
  const top = lista.filter(({ l }) => { const k = `${norm(l.nombre)}|${l.municipio}`; if (vistos.has(k)) return false; vistos.add(k); return true }).slice(0, 5)
  const que = pedido?.etiqueta ?? 'lugares'
  if (!top.length) return { texto: `No encontré ${que} con ubicación cerca de ${origen.nombre}.` }
  const lejos = top[0].d > MAX_SALTO_M ? ` Ojo: lo más cercano queda a ${km(top[0].d)}.` : ''
  return {
    texto: `Esto es lo más cercano en ${que} desde ${origen.nombre}, de menor a mayor distancia:${lejos}`,
    tarjetas: top.map(({ l, d }) => tarjeta(l, `a ${km(d)}`)),
  }
}

function reservar(t: string, ctx: Contexto): Respuesta {
  const pedido = detectarPedido(t)
  const muni = detectarMunicipio(t)
  const porNombre = buscarPorNombre(t).sort((a, b) => b.score - a.score || Number(b.l.municipio === muni) - Number(a.l.municipio === muni))
  let cands: Lugar[] = porNombre.filter((c) => c.score === porNombre[0].score).slice(0, 3).map((c) => c.l)
  let exacto = porNombre[0]?.score === 1 && (!muni || porNombre[0].l.municipio === muni)
  if (!cands.length && pedido && muni) {
    const propio = (l: Lugar) => !/^(finca|casa|vivienda|otro)/i.test(l.nombre)
    const vistos = new Set<string>()
    cands = LUGARES.filter((l) => l.municipio === muni && pedido.cats.includes(l.categoria) && tipoReserva(l))
      .sort((a, b) => Number(propio(b)) - Number(propio(a)) || Number(b.conRegistro) - Number(a.conRegistro))
      .filter((l) => { const k = norm(l.nombre); if (vistos.has(k)) return false; vistos.add(k); return true })
      .slice(0, 3)
    exacto = true
    if (!cands.length) return { texto: `No encontré ${pedido.etiqueta} reservables en ${nomMuni(muni)}. Prueba «${pedido.cats[0] === 'alojamiento' ? 'hospedaje' : 'qué hay'} cerca de ${nomMuni(muni)}».` }
  }
  if (!cands.length) {
    return { texto: pedido
      ? `¿En qué municipio? Por ejemplo: «quiero reservar ${pedido.cats[0] === 'restaurante' ? 'un restaurante' : pedido.cats[0] === 'alojamiento' ? 'un hotel' : 'una actividad'} en Almeida». También puedes escribir el nombre del lugar.`
      : 'No encontré ese lugar. Escribe el nombre como aparece en el mapa («quiero reservar Hotel Roca Center») o dime tipo y municipio («quiero reservar un hotel en Almeida»).' }
  }
  const reservables = cands.filter((l) => tipoReserva(l))
  if (!reservables.length) {
    const l = cands[0]
    return { texto: `«${l.nombre}» (${nomMuni(l.municipio)}) es ${CATEGORIA_POR_ID[l.categoria]?.singular.toLowerCase() ?? 'un servicio'} y no se reserva. Puedes verlo en el mapa.`, tarjetas: [tarjeta(l)] }
  }
  const intro = cands.length === 1
    ? `«${cands[0].nombre}» (${nomMuni(cands[0].municipio)}). ${estadoCupo(cands[0], ctx)}`
    : `${exacto ? 'Encontré estas opciones:' : 'No encontré ese nombre exacto; ¿es alguno de estos?'} ${cands.map((l) => `«${l.nombre}»: ${estadoCupo(l, ctx)}`).join(' ')}`
  return { texto: intro, tarjetas: cands.map((l) => tarjeta(l, tipoReserva(l) ? undefined : 'no se reserva')) }
}

const AYUDA = `Conozco los ${LUGARES.length} lugares reales del Valle de Tenza y puedo ayudarte con tres cosas:\n• Armar rutas de 1 a ${DIAS_MAX} días (aventura, gastronomía o cultura).\n• Sugerirte lugares cercanos a un municipio o sitio.\n• Llevarte a reservar un hotel, restaurante o actividad.\n\nPrueba, por ejemplo:\n- «${EJEMPLOS[0]}»\n- «${EJEMPLOS[1]}»\n- «${EJEMPLOS[2]}»`
const PRECIOS = 'No tengo precios ni tarifas confirmadas, y prefiero no inventarlos. Un embajador del Valle te los puede confirmar: toca «Hablar con un embajador».'
const NO_ENTIENDO = `No te entendí bien. Cuéntame qué necesitas, por ejemplo:\n- «${EJEMPLOS[0]}»\n- «${EJEMPLOS[1]}»\n- «${EJEMPLOS[2]}»\nSi prefieres, habla con un embajador.`

// ---------- Entrada principal ----------
export function responder(texto: string, ctx: Contexto): Respuesta {
  const t = norm(texto)
  if (!t) return { texto: NO_ENTIENDO }
  const { dias, pidio } = detectarDias(t)
  const plan = detectarPlan(t)
  const muni = detectarMunicipio(t)
  const topeNota = pidio && pidio > DIAS_MAX ? [`Por ahora armo rutas de hasta ${DIAS_MAX} días; te dejo una de ${DIAS_MAX}.`] : []

  if (/\breserv\w*|\bcupos?\b|\bdisponibilidad\b/.test(t)) return reservar(t, ctx)

  const esOtra = /\b(otra|otro|otras|diferente|distinta|cambia\w*)\b/.test(t)
  const verboArmar = !(ctx.ultimaRuta && esOtra && !/\b(arma\w*|hazme|haz|organiza\w*|planea\w*|genera\w*|crea\w*)\b/.test(t)) && /\b(arma\w*|hazme|haz|organiza\w*|planea\w*|genera\w*|crea\w*|disena\w*)\b|\bquiero (una |un )?(ruta|plan|itinerario|recorrido)\b|\b(ruta|itinerario|recorrido|plan|viaje|escapada|paseo)\b/.test(t)
  if (verboArmar) {
    const previo = [...topeNota]
    const planId = plan ?? 'aventura'
    if (!plan) previo.push('No me dijiste el tipo de plan; armé uno de aventura.')
    if (!muni) previo.push('No indicaste municipio: dejé que el generador elija donde hay más paradas de este plan.')
    return armarRuta(planId, muni ?? '', dias ?? 2, 0, previo)
  }

  if (/\bcerca\b|\bcercan\w+|\bdonde (puedo |se puede )?(comer|dormir|hospedar\w*|alojar\w*)|\bque hay (en|por)\b|\bque (puedo |se puede )?(visitar|hacer) (en|por)\b|\bhospedaje\b|\balojamiento\b/.test(t)) return cerca(t)

  const u = ctx.ultimaRuta
  if (u && (esOtra || dias || muni || plan)) {
    const seed = esOtra ? u.semilla + 1 : u.semilla
    const cambios: string[] = []
    if (dias && dias !== u.dias) cambios.push(`de ${dias} ${dias === 1 ? 'día' : 'días'}`)
    if (muni && muni !== u.municipio) cambios.push(`en ${nomMuni(muni)}`)
    if (plan && plan !== u.planId) cambios.push(`de ${nombrePlan(plan)}`)
    const previo = [...topeNota]
    if (cambios.length) previo.push(`Listo, ahora es una ruta ${cambios.join(' y ')}.`)
    else if (esOtra) {
      const ids = (x?: Itinerario) => x?.paradas.map((l) => l.id).join()
      const igual = ids(generarPlan(u.planId, u.municipio, u.semilla, u.dias)) === ids(generarPlan(u.planId, u.municipio, seed, u.dias))
      previo.push(igual ? 'En esa zona no hay otra combinación distinta con lo que tengo; te muestro la misma. Puedes cambiar de municipio, de plan o de días.' : 'Va otra opción con los mismos criterios.')
    }
    return armarRuta(plan ?? u.planId, muni ?? u.municipio, dias ?? u.dias, seed, previo)
  }
  if (plan) {
    const previo = [...topeNota, ...(muni ? [] : ['No indicaste municipio: dejé que el generador elija donde hay más paradas de este plan.'])]
    return armarRuta(plan, muni ?? '', dias ?? 2, 0, previo)
  }

  if (/\b(precios?|costos?|cuesta\w*|cuanto (vale|cobra|cuesta|es)|tarifas?|valor|embajador\w*|persona|humano)\b/.test(t)) return { texto: PRECIOS }
  if (/\b(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|ayuda\w*|que (puedes|haces|sabes|puedo)|como (funcionas|me ayudas)|gracias)\b/.test(t)) {
    return { texto: /\bgracias\b/.test(t) ? 'Con gusto. Si quieres otra ruta o ver qué hay cerca de algún sitio, aquí estoy.' : `¡Hola! ${AYUDA}` }
  }
  return { texto: NO_ENTIENDO }
}
