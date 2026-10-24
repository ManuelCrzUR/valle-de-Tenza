// Asistente local del chat: entiende frases en español y responde SOLO con los lugares reales de lugares.json
// y con el generador de rutas. Es una función pura (sin React ni localStorage): los negocios y reservas llegan en el contexto.
import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, CATEGORIA_POR_ID, tipoReserva, metros, tieneUbicacion, esAproximado } from './lugares'
import type { CategoriaId, Lugar } from './lugares'
import { generarPlan, ordenRuta, distanciasRuta, km, MAX_SALTO_M, DIAS_MAX } from './generarPlan'
import type { Itinerario, RutaPersonal } from './generarPlan'
import type { Categoria } from './planes'
import { cupoLibre, negocioDeLugar, cupoVerificadoHoy, fechaCorta } from '../state/reservas'
import type { Operacion } from '../state/reservas'
import { duracionLarga, minutos, fechaVerificada, dinero, etiquetaDias, NOMBRE_TIPO_ALERTA, NOMBRE_MODO } from '../state/logistica'
import type { Alerta, DiaClima, RutaTransporte, Tramo } from '../state/logistica'
import { supabase } from '../lib/supabase'

export interface UltimaRuta { planId: Categoria; municipio: string; dias: number; semilla: number }
export interface EventoValle { nombre: string; municipio: string; descripcion: string | null; desde: string; hasta: string | null; verificado_en: string | null }
/** Datos «vivos» (logística, eventos). Se inyectan para poder probar el asistente sin Supabase. */
export interface DatosVivos {
  rutas: RutaTransporte[]
  alertas: Alerta[]                                        // solo las vigentes
  clima: DiaClima[]
  sinConexion?: boolean
  tramoEntre: (a: string, b: string) => Tramo | undefined
  cargarTramos?: (ids: string[]) => Promise<void>
  /** Eventos que tocan [desde, hasta] (AAAA-MM-DD). Lanza si no se pudo consultar. */
  consultarEventos?: (desde: string, hasta: string) => Promise<EventoValle[]>
  ahora?: Date
}
export interface Contexto { ultimaRuta?: UltimaRuta; operacion: Operacion; vivos?: DatosVivos }
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
const GENERICAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'e', 'hotel', 'hostal', 'hospedaje', 'alojamiento', 'glamping', 'apartamento', 'turistico', 'restaurante', 'finca', 'casa', 'cabanas', 'cabana', 'posada', 'cafe', 'parque'])
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
const SIN_VIVOS: DatosVivos = { rutas: [], alertas: [], clima: [], sinConexion: true, tramoEntre: () => undefined }
const ahoraDe = (ctx: Contexto) => ctx.vivos?.ahora ?? new Date()
const aFecha = (d: Date) => d.toLocaleDateString('en-CA')
const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return aFecha(d) }

// ---------- Fechas mencionadas ----------
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
interface FechaPedida { fecha: string; etiqueta: string; esHoy: boolean }
/** «hoy», «mañana», «pasado mañana», «el sábado», «el 15». Sin mención: undefined. */
export function detectarFecha(t: string, ahora: Date): FechaPedida | undefined {
  const hoyF = aFecha(ahora)
  const con = (fecha: string): FechaPedida => ({ fecha, etiqueta: fecha === hoyF ? 'hoy' : fechaCorta(fecha), esHoy: fecha === hoyF })
  if (/\bpasado manana\b/.test(t)) return con(sumarDias(hoyF, 2))
  if (/\bmanana\b/.test(t)) return con(sumarDias(hoyF, 1))
  if (/\bhoy\b/.test(t)) return con(hoyF)
  const dia = t.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)s?\b/)
  if (dia) {
    const falta = (DIAS_SEMANA.indexOf(dia[1]) - ahora.getDay() + 7) % 7
    return con(sumarDias(hoyF, falta))
  }
  const n = t.match(/\bel (\d{1,2})\b(?! (dias?|noches?|personas?))/)
  if (n) {
    const d = parseInt(n[1], 10)
    if (d >= 1 && d <= 31) {
      for (const mes of [0, 1]) {
        const c = new Date(ahora.getFullYear(), ahora.getMonth() + mes, d, 12)
        if (c.getDate() === d && aFecha(c) >= hoyF) return con(aFecha(c))
      }
    }
  }
  if (/\bfin de semana\b|\bfinde\b/.test(t)) return con(sumarDias(hoyF, (6 - ahora.getDay() + 7) % 7))   // el sábado (o hoy si ya lo es)
  return undefined
}

const PIDE_REVISAR = 'Un embajador te lo puede confirmar: toca «Hablar con un embajador».'
function estadoCupo(l: Lugar, ctx: Contexto, f: FechaPedida): string {
  if (ctx.operacion.sinConexion) return `No pude consultar los cupos ahora. ${PIDE_REVISAR}`
  const neg = negocioDeLugar(ctx.operacion.negocios, l.id)
  if (!neg) return 'Aún no tiene prestador en la app: un embajador tramita la solicitud.'
  const n = cupoLibre(ctx.operacion, neg, f.fecha)
  if (n <= 0) return `No tiene cupo libre ${f.esHoy ? 'hoy' : `el ${f.etiqueta}`}; puedes elegir otra fecha al reservar.`
  const aviso = f.esHoy && !cupoVerificadoHoy(neg) ? ' (el prestador no lo ha actualizado en las últimas 24 h: queda por confirmar)' : ''
  return `Cupo libre ${f.esHoy ? 'hoy' : `el ${f.etiqueta}`}: ${n}${aviso}.`
}
function cupoCorto(l: Lugar, ctx: Contexto, f: FechaPedida): string {
  if (ctx.operacion.sinConexion) return 'cupo por consultar'
  const neg = negocioDeLugar(ctx.operacion.negocios, l.id)
  if (!neg) return 'sin prestador en la app'
  const n = cupoLibre(ctx.operacion, neg, f.fecha)
  return n > 0 ? `cupo ${f.esHoy ? 'hoy' : f.etiqueta}: ${n}` : `sin cupo ${f.esHoy ? 'hoy' : f.etiqueta}`
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

function cerca(t: string, ctx: Contexto): Respuesta {
  const fecha = detectarFecha(t, ahoraDe(ctx)) ?? detectarFecha('hoy', ahoraDe(ctx))!
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
    tarjetas: top.map(({ l, d }) => tarjeta(l, l.categoria === 'alojamiento' ? `a ${km(d)} · ${cupoCorto(l, ctx, fecha)}` : `a ${km(d)}`)),
  }
}

function reservar(t: string, ctx: Contexto): Respuesta {
  const fecha = detectarFecha(t, ahoraDe(ctx)) ?? detectarFecha('hoy', ahoraDe(ctx))!
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
    ? `«${cands[0].nombre}» (${nomMuni(cands[0].municipio)}). ${estadoCupo(cands[0], ctx, fecha)}`
    : `${exacto ? 'Encontré estas opciones:' : 'No encontré ese nombre exacto; ¿es alguno de estos?'} ${cands.map((l) => `«${l.nombre}»: ${estadoCupo(l, ctx, fecha)}`).join(' ')}`
  return { texto: intro, tarjetas: cands.map((l) => tarjeta(l, tipoReserva(l) ? undefined : 'no se reserva')) }
}

const AYUDA = `Conozco los ${LUGARES.length} lugares reales del Valle de Tenza y puedo ayudarte con tres cosas:\n• Armar rutas de 1 a ${DIAS_MAX} días (aventura, gastronomía o cultura).\n• Sugerirte lugares cercanos a un municipio o sitio.\n• Llevarte a reservar un hotel, restaurante o actividad.\n\nPrueba, por ejemplo:\n- «${EJEMPLOS[0]}»\n- «${EJEMPLOS[1]}»\n- «${EJEMPLOS[2]}»`
const PRECIOS = 'No tengo precios ni tarifas confirmadas, y prefiero no inventarlos. Un embajador del Valle te los puede confirmar: toca «Hablar con un embajador».'
const NO_ENTIENDO = `No te entendí bien. Cuéntame qué necesitas, por ejemplo:\n- «${EJEMPLOS[0]}»\n- «${EJEMPLOS[1]}»\n- «${EJEMPLOS[2]}»\nSi prefieres, habla con un embajador.`

// ---------- Intenciones con datos vivos (logística, clima, eventos) ----------
// REGLA: no se inventa. Si falta el dato (ruta verificada, aviso, clima, evento) se dice explícitamente.
const hora = (d: Date) => d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
const BOGOTA: [number, number] = [4.711, -74.0721]

const RE_COMO_LLEGO = /\b(como (llego|se llega|llegar|puedo llegar|voy|me voy|ir)|como (es|esta) (el )?(viaje|camino)|llegar (a|al|hasta)|transporte|buses?|flota\w*|terminal\w*|salidas?|desde bogota)\b/
const RE_DEMORA = /\b(demor\w*|tard\w*|cuanto (es|hay|queda|dura|se hace|falta)|cuantos (minutos|kilometros|km)|distancia|queda de|que tan lejos)\b/
const RE_VIA = /\b(paro\w*|bloqueo\w*|derrumbe\w*|deslizamiento\w*|cierre\w*|cerrad[ao]s?|via|vias|carretera\w*|transitable|pasos? restringid\w+|trancon\w*|manifestacion\w*)\b/
const RE_CLIMA = /\b(llover|llueve|lluvia\w*|lloviendo|clima|pronostico|temperatura|que tiempo (hace|hara|va)|paraguas|nublad\w*)\b/
const RE_EVENTOS = /\b(eventos?|fiestas?|festival\w*|ferias?|mercado\w*|tiangue|carnaval\w*|celebracion\w*|verbena\w*)\b|\bque (hay|pasa|se hace|hacen|habra|tienen)\b.*\b(fin de semana|finde|sabado|domingo)\b/

interface Nodo { id: string; nombre: string; punto?: [number, number] }
/** Resuelve un fragmento («tenza», «hotel roca center», «bogota») a un municipio, Bogotá o un lugar conocido. */
function resolverNodo(frag: string): Nodo | undefined {
  const f = frag.trim()
  if (!f) return undefined
  if (/\bbogota\b/.test(f)) return { id: 'bogota', nombre: 'Bogotá', punto: BOGOTA }
  const m = MUNI.filter((x) => new RegExp(`\\b${x.n}\\b`).test(f)).sort((a, b) => b.n.length - a.n.length)[0]
  const sinMuni = m ? f.replace(new RegExp(`\\b${m.n}\\b`), ' ').replace(/\b(de|del|en|el|la|municipio|pueblo)\b/g, ' ').trim() : f
  // Un lugar nombrado explícitamente gana sobre el municipio si el fragmento tiene algo más que el municipio.
  if (sinMuni.length >= 3) {
    const c = buscarPorNombre(sinMuni).filter((x) => x.score === 1 && (!m || x.l.municipio === m.slug))[0]
    if (c) return { id: c.l.id, nombre: c.l.nombre, punto: tieneUbicacion(c.l) ? [c.l.lat, c.l.lon] : undefined }
  }
  if (m) return { id: `mun:${m.slug}`, nombre: m.nombre, punto: m.centro ?? undefined }
  return undefined
}

async function demora(t: string, ctx: Contexto): Promise<Respuesta | undefined> {
  const par = t.match(/\b(?:de|desde|entre)\s+(.+?)\s+(?:a|al|hasta|hacia|para|y|e)\s+(.+)$/)
  if (!par) return undefined
  const a = resolverNodo(par[1]), b = resolverNodo(par[2].replace(/\b(en|por|con|si|cuanto|cuantos)\b.*$/, ''))
  if (!a || !b) {
    const falta = !a ? par[1] : par[2]
    return { texto: `No reconozco «${falta.trim()}» como municipio ni como lugar del catálogo. Dime dos municipios o lugares, por ejemplo «cuánto me demoro de Tenza a Garagoa». Conozco: ${MUNI.map((m) => m.nombre).join(', ')}.` }
  }
  if (a.id === b.id) return { texto: `Origen y destino son el mismo sitio (${a.nombre}). ¿A dónde quieres ir?` }
  const v = ctx.vivos ?? SIN_VIVOS
  let tr = v.tramoEntre(a.id, b.id)
  if (!tr && v.cargarTramos) { await v.cargarTramos([a.id, b.id]); tr = v.tramoEntre(a.id, b.id) }
  if (tr) {
    return { texto: `De ${a.nombre} a ${b.nombre}: ${minutos(tr.duracion_s)} min por carretera (${km(tr.distancia_m)}). Es un cálculo con OSRM sobre mapa de OpenStreetMap, sin tráfico ni cierres: revisa los avisos de vía antes de salir.` }
  }
  if (a.punto && b.punto) {
    return { texto: `No tengo el tiempo por carretera entre ${a.nombre} y ${b.nombre}. En línea recta hay aprox. ${km(metros(a.punto, b.punto))}; por carretera será más y no sé cuánto tarda.` }
  }
  return { texto: `No tengo el tiempo por carretera ni la ubicación exacta para medir ${a.nombre} - ${b.nombre}. ${PIDE_REVISAR}` }
}

async function comoLlego(t: string, ctx: Contexto): Promise<Respuesta> {
  const v = ctx.vivos ?? SIN_VIVOS
  const muni = detectarMunicipio(t) ?? 'guateque'
  const nombre = nomMuni(muni)
  const enlace: Accion = { tipo: 'ver-mapa', etiqueta: 'Ver cómo llegar', to: '/como-llegar' }
  const lineas: string[] = []
  const rutas = v.rutas.filter((r) => r.modo !== 'carro_propio' && norm(r.origen).includes('bogota') && norm(r.destino).includes(norm(nombre)))
  if (v.sinConexion && !v.rutas.length) lineas.push('No pude consultar las rutas de transporte ahora.')
  else if (!rutas.length) lineas.push(`No tengo rutas de transporte público cargadas de Bogotá a ${nombre}.`)
  else {
    lineas.push(`Desde Bogotá a ${nombre} en transporte público:`)
    for (const r of rutas) {
      const sal = r.salidas.length
        ? r.salidas.slice(0, 6).map((s) => `${s.hora} (${etiquetaDias(s.dias)})`).join(', ') + (r.salidas.length > 6 ? ` y ${r.salidas.length - 6} más` : '')
        : 'por confirmar'
      lineas.push(`• ${r.empresa} (${NOMBRE_MODO[r.modo]}): terminal ${r.terminal ?? 'por confirmar'}; duración ${r.duracionMin ? duracionLarga(r.duracionMin) : 'por confirmar'}; precio desde ${r.precioDesdeCop ? dinero(r.precioDesdeCop) : 'por confirmar'}; salidas: ${sal}; ${fechaVerificada(r.verificadoEn)}.`)
    }
    if (rutas.some((r) => !r.verificadoEn)) lineas.push('Lo que dice «por confirmar» no está verificado: confírmalo con la empresa antes de ir.')
  }
  let tr = v.tramoEntre('bogota', `mun:${muni}`)
  if (!tr && v.cargarTramos) { await v.cargarTramos(['bogota', `mun:${muni}`]); tr = v.tramoEntre('bogota', `mun:${muni}`) }
  lineas.push(tr
    ? `En carro: unos ${duracionLarga(minutos(tr.duracion_s))} (${km(tr.distancia_m)}), cálculo sin tráfico ni cierres.`
    : `En carro: el tiempo desde Bogotá a ${nombre} por confirmar.`)
  return { texto: lineas.join('\n'), acciones: [enlace] }
}

function via(t: string, ctx: Contexto): Respuesta {
  const v = ctx.vivos ?? SIN_VIVOS
  const muni = detectarMunicipio(t)
  const cuando = `consulta de hoy a las ${hora(ahoraDe(ctx))}`
  if (v.sinConexion && !v.alertas.length) return { texto: `No pude consultar los avisos de vía ahora, así que no sé si hay alguno. ${PIDE_REVISAR}` }
  const lista = v.alertas.filter((a) => !muni || a.municipio === muni || !a.municipio)
  if (!lista.length) {
    return { texto: `No tenemos avisos de vía vigentes${muni ? ` para ${nomMuni(muni)}` : ''} (${cuando}). Eso no garantiza el estado de la vía: no recibimos información en tiempo real, confírmalo con un embajador o con la fuente oficial antes de salir.` }
  }
  const filas = lista.slice(0, 6).map((a) => {
    const tramo = a.tramo_desde || a.tramo_hasta ? ` Tramo: ${[a.tramo_desde, a.tramo_hasta].filter(Boolean).join(' – ')}.` : ''
    const hasta = a.hasta ? ` hasta ${new Date(a.hasta).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}` : ' sin fecha de fin'
    return `• ${NOMBRE_TIPO_ALERTA[a.tipo]}${a.municipio ? ` en ${nomMuni(a.municipio)}` : ''}: ${a.mensaje}${tramo} (vigente${hasta}${a.fuente ? `; fuente: ${a.fuente}` : ''}).`
  })
  return { texto: [`Avisos de vía vigentes${muni ? ` en ${nomMuni(muni)}` : ''} (${cuando}):`, ...filas, ...(lista.length > 6 ? [`Y ${lista.length - 6} más.`] : [])].join('\n') }
}

function clima(t: string, ctx: Contexto): Respuesta {
  const v = ctx.vivos ?? SIN_VIVOS
  const f = detectarFecha(t, ahoraDe(ctx)) ?? detectarFecha('hoy', ahoraDe(ctx))!
  const muni = detectarMunicipio(t)
  const slug = muni ?? 'guateque'
  const previo = muni ? '' : 'No dijiste municipio; te cuento de Guateque. '
  const d = v.clima.find((c) => c.municipio === slug && c.fecha === f.fecha)
  const cuando = f.esHoy ? 'hoy' : `el ${f.etiqueta}`
  if (!d) {
    return { texto: `${previo}No tengo pronóstico de ${nomMuni(slug)} para ${cuando}${v.sinConexion ? ' (no pude consultar el clima ahora)' : ''}. Solo guardamos los próximos días; ${PIDE_REVISAR}` }
  }
  const lluvia = d.prob_lluvia_max === null ? 'probabilidad de lluvia por confirmar' : `probabilidad de lluvia hasta ${d.prob_lluvia_max}%`
  const temp = d.temp_min !== null && d.temp_max !== null ? `temperatura entre ${d.temp_min} y ${d.temp_max} °C` : 'temperatura por confirmar'
  return { texto: `${previo}${nomMuni(slug)}, ${cuando}: ${lluvia}; ${temp}. Fuente: Open-Meteo (CC BY 4.0), actualizado ${new Date(d.actualizado).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}. Es un pronóstico, no una garantía.` }
}

/** Consulta mínima de `eventos` en Supabase (lectura pública). */
export async function consultarEventosSupabase(desde: string, hasta: string): Promise<EventoValle[]> {
  if (!supabase) throw new Error('sin Supabase')
  const { data, error } = await supabase.from('eventos').select('nombre,municipio,descripcion,desde,hasta,verificado_en').lte('desde', hasta).order('desde')
  if (error) throw error
  return data.filter((e) => (e.hasta ?? e.desde) >= desde)
}

async function eventos(t: string, ctx: Contexto): Promise<Respuesta> {
  const v = ctx.vivos ?? SIN_VIVOS
  const ahora = ahoraDe(ctx)
  const pedida = detectarFecha(t, ahora)
  const hoyF = aFecha(ahora)
  const esFinde = !pedida || /\bfin de semana\b|\bfinde\b/.test(t)
  const sab = sumarDias(hoyF, (6 - ahora.getDay() + 7) % 7)
  const domingo = ahora.getDay() === 0
  const desde = esFinde ? (domingo ? hoyF : sab) : pedida!.fecha
  const hasta = esFinde ? (domingo ? hoyF : sumarDias(sab, 1)) : pedida!.fecha
  const rotulo = esFinde ? 'este fin de semana' : pedida!.esHoy ? 'hoy' : `el ${pedida!.etiqueta}`
  if (!v.consultarEventos) return { texto: `No pude consultar los eventos ahora. ${PIDE_REVISAR}` }
  let lista: EventoValle[]
  try { lista = await v.consultarEventos(desde, hasta) } catch { return { texto: `No pude consultar los eventos ahora. ${PIDE_REVISAR}` } }
  const muni = detectarMunicipio(t)
  if (muni) lista = lista.filter((e) => e.municipio === muni)
  if (!lista.length) return { texto: `No tenemos eventos registrados ${rotulo}${muni ? ` en ${nomMuni(muni)}` : ''}. Eso no significa que no haya. ${PIDE_REVISAR}` }
  const fmt = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  const filas = lista.slice(0, 8).map((e) => `• ${e.nombre} (${nomMuni(e.municipio)}, ${e.hasta && e.hasta !== e.desde ? `${fmt(e.desde)} al ${fmt(e.hasta)}` : fmt(e.desde)})${e.descripcion ? `: ${e.descripcion}` : ''}${e.verificado_en ? ` — verificado el ${fmt(e.verificado_en)}` : ' — por confirmar'}`)
  return { texto: [`Eventos ${rotulo}${muni ? ` en ${nomMuni(muni)}` : ''}:`, ...filas, 'Confirma fechas y horarios con la organización antes de ir.'].join('\n') }
}

async function responderVivo(t: string, ctx: Contexto): Promise<Respuesta | undefined> {
  if (RE_DEMORA.test(t)) { const r = await demora(t, ctx); if (r) return r }
  if (RE_COMO_LLEGO.test(t) && !/\b(cerca|reserv\w*)\b/.test(t)) return comoLlego(t, ctx)
  if (RE_VIA.test(t) && !/\b(arma\w*|ruta|itinerario)\b/.test(t)) return via(t, ctx)
  if (RE_CLIMA.test(t)) return clima(t, ctx)
  if (RE_EVENTOS.test(t) && !/\b(arma\w*|hazme|itinerario)\b/.test(t)) return eventos(t, ctx)
  return undefined
}

// ---------- Entrada principal ----------
export async function responder(texto: string, ctx: Contexto): Promise<Respuesta> {
  const t = norm(texto)
  if (!t) return { texto: NO_ENTIENDO }
  const { dias, pidio } = detectarDias(t)
  const plan = detectarPlan(t)
  const muni = detectarMunicipio(t)
  const topeNota = pidio && pidio > DIAS_MAX ? [`Por ahora armo rutas de hasta ${DIAS_MAX} días; te dejo una de ${DIAS_MAX}.`] : []

  if (/\breserv\w*|\bcupos?\b|\bdisponibilidad\b/.test(t)) return reservar(t, ctx)

  const vivo = await responderVivo(t, ctx)
  if (vivo) return vivo

  const esOtra = /\b(otra|otro|otras|diferente|distinta|cambia\w*)\b/.test(t)
  const verboArmar = !(ctx.ultimaRuta && esOtra && !/\b(arma\w*|hazme|haz|organiza\w*|planea\w*|genera\w*|crea\w*)\b/.test(t)) && /\b(arma\w*|hazme|haz|organiza\w*|planea\w*|genera\w*|crea\w*|disena\w*)\b|\bquiero (una |un )?(ruta|plan|itinerario|recorrido)\b|\b(ruta|itinerario|recorrido|plan|viaje|escapada|paseo)\b/.test(t)
  if (verboArmar) {
    const previo = [...topeNota]
    const planId = plan ?? 'aventura'
    if (!plan) previo.push('No me dijiste el tipo de plan; armé uno de aventura.')
    if (!muni) previo.push('No indicaste municipio: dejé que el generador elija donde hay más paradas de este plan.')
    return armarRuta(planId, muni ?? '', dias ?? 2, 0, previo)
  }

  if (/\bcerca\b|\bcercan\w+|\bdonde (puedo |se puede )?(comer|dormir|hospedar\w*|alojar\w*)|\bque hay (en|por)\b|\bque (puedo |se puede )?(visitar|hacer) (en|por)\b|\bhospedaje\b|\balojamiento\b/.test(t)) return cerca(t, ctx)

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
