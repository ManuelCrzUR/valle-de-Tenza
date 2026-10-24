// Logística de viaje desde Supabase: rutas de transporte con sus salidas, alertas de vía vigentes, clima y tramos
// (tiempos por carretera precalculados). El navegador NUNCA llama a OSRM ni a Open-Meteo: solo lee estas tablas,
// que llenan los scripts programados. Sin Supabase todo queda vacío y la app sigue funcionando.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import { useUsuario } from './reservas'

type Tablas = Database['public']['Tables']
export type ModoTransporte = Database['public']['Enums']['modo_transporte']
export type TipoAlerta = Database['public']['Enums']['tipo_alerta']
export type Alerta = Tablas['alertas_via']['Row']
export type DiaClima = Tablas['clima']['Row']

export interface Salida { id: string; hora: string; dias: number[] }          // dias: ISO 1 = lunes … 7 = domingo
export interface RutaTransporte {
  id: string; origen: string; destino: string; empresa: string; modo: ModoTransporte
  terminal: string | null; duracionMin: number | null; precioDesdeCop: number | null
  notas: string | null; fuente: string | null; verificadoEn: string | null; activa: boolean
  salidas: Salida[]
}
export interface Tramo { duracion_s: number; distancia_m: number }
export interface Logistica {
  rutas: RutaTransporte[]
  alertas: Alerta[]                                       // solo las vigentes ahora
  clima: DiaClima[]
  cargando: boolean
  sinConexion: boolean
  tramoEntre: (a: string, b: string) => Tramo | undefined // busca en ambos sentidos; ids de lugar, `mun:<slug>` o `bogota`
}

export const NOMBRE_TIPO_ALERTA: Record<TipoAlerta, string> = {
  cierre: 'Cierre de vía', paso_restringido: 'Paso restringido', derrumbe: 'Derrumbe', obra: 'Obra en la vía', otro: 'Aviso',
}
export const NOMBRE_MODO: Record<ModoTransporte, string> = { bus: 'Bus', colectivo: 'Colectivo', taxi: 'Taxi', carro_propio: 'Carro propio' }
export const DIAS_ISO = [[1, 'lun'], [2, 'mar'], [3, 'mié'], [4, 'jue'], [5, 'vie'], [6, 'sáb'], [7, 'dom']] as const

const vigente = (a: Pick<Alerta, 'desde' | 'hasta'>, ahora = Date.now()) =>
  Date.parse(a.desde) <= ahora && (!a.hasta || Date.parse(a.hasta) > ahora)
// ¿La alerta toca el día AAAA-MM-DD (hora local)?
export function alertaEnFecha(a: Pick<Alerta, 'desde' | 'hasta'>, fecha: string): boolean {
  const ini = new Date(`${fecha}T00:00:00`).getTime()
  const fin = ini + 24 * 3600 * 1000
  return Date.parse(a.desde) < fin && (!a.hasta || Date.parse(a.hasta) > ini)
}

// ---------- Almacén de módulo ----------
const sinTramos = () => undefined
let tramosMapa = new Map<string, Tramo>()
const crearTramoEntre = (m: Map<string, Tramo>) => (a: string, b: string) => m.get(`${a}|${b}`) ?? m.get(`${b}|${a}`)

const INICIAL: Logistica = { rutas: [], alertas: [], clima: [], cargando: !!supabase, sinConexion: !supabase, tramoEntre: sinTramos }
let estado: Logistica = INICIAL
const oyentes = new Set<() => void>()
const poner = (p: Partial<Logistica>) => { estado = { ...estado, ...p }; oyentes.forEach((f) => f()) }

async function cargarRutas() {
  const [r, s] = await Promise.all([
    supabase!.from('rutas_transporte').select('*').eq('activa', true).order('empresa'),
    supabase!.from('salidas').select('*').order('hora'),
  ])
  if (r.error) throw r.error
  if (s.error) throw s.error
  const rutas = r.data.map((f): RutaTransporte => ({
    id: f.id, origen: f.origen, destino: f.destino, empresa: f.empresa, modo: f.modo, terminal: f.terminal,
    duracionMin: f.duracion_min, precioDesdeCop: f.precio_desde_cop, notas: f.notas, fuente: f.fuente, verificadoEn: f.verificado_en, activa: f.activa,
    salidas: s.data.filter((x) => x.ruta_id === f.id).map((x) => ({ id: x.id, hora: x.hora.slice(0, 5), dias: [...x.dias_semana].sort((a, b) => a - b) })),
  }))
  poner({ rutas })
}
async function cargarAlertas() {
  const { data, error } = await supabase!.from('alertas_via').select('*').order('desde', { ascending: false })
  if (error) throw error
  poner({ alertas: data.filter((a) => vigente(a)) })
}
async function cargarClima() {
  const { data, error } = await supabase!.from('clima').select('*').gte('fecha', new Date().toLocaleDateString('en-CA'))
  if (error) throw error
  poner({ clima: data })
}
// Los tramos pueden ser decenas de miles de filas: nunca se baja la tabla entera (egress gratuito de Supabase).
// Base: solo entre centros de municipio (`mun:*`) y desde/hacia Bogotá. Itinerario: `cargarTramos(ids)` trae solo los pares entre sus paradas.
type FilaTramo = { origen: string; destino: string; distancia_m: number; duracion_s: number }
function mezclarTramos(filas: FilaTramo[]) {
  if (!filas.length) return
  const m = new Map(tramosMapa)
  for (const t of filas) m.set(`${t.origen}|${t.destino}`, { duracion_s: t.duracion_s, distancia_m: t.distancia_m })
  tramosMapa = m
  poner({ tramoEntre: crearTramoEntre(m) })
}
type ConsultaTramos = (q: any) => any
async function traerTramos(filtro: ConsultaTramos): Promise<FilaTramo[]> {
  const filas: FilaTramo[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtro(supabase!.from('tramos').select('origen,destino,distancia_m,duracion_s')).range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}
async function cargarTramosBase() {
  const partes = await Promise.all([
    traerTramos((q) => q.like('origen', 'mun:%').like('destino', 'mun:%')),
    traerTramos((q) => q.eq('origen', 'bogota').like('destino', 'mun:%')),
    traerTramos((q) => q.eq('destino', 'bogota').like('origen', 'mun:%')),
  ])
  mezclarTramos(partes.flat())
}
const idsPedidos = new Set<string>()
/** Trae (y guarda en memoria) los tramos entre los nodos dados; lo ya pedido no se vuelve a pedir. */
export async function cargarTramos(ids: string[]): Promise<void> {
  if (!supabase) return
  const unicos = [...new Set(ids)].slice(0, 60)
  if (unicos.length < 2 || unicos.every((i) => idsPedidos.has(i))) return
  unicos.forEach((i) => idsPedidos.add(i))
  try { mezclarTramos(await traerTramos((q) => q.in('origen', unicos).in('destino', unicos))) }
  catch (e) { unicos.forEach((i) => idsPedidos.delete(i)); console.warn('Logística: no se pudieron leer los tramos.', (e as Error)?.message ?? e) }
}

const alFallar = (e: unknown) => { console.warn('Logística: sin conexión con Supabase.', (e as Error)?.message ?? e); poner({ cargando: false, sinConexion: true }) }
const alExito = () => { if (estado.cargando || estado.sinConexion) poner({ cargando: false, sinConexion: false }) }

let iniciada = false
let tramosPedidos = false
let temporizador: ReturnType<typeof setInterval> | undefined
let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let pendiente: ReturnType<typeof setTimeout> | undefined
const luego = () => { if (!pendiente) pendiente = setTimeout(() => { pendiente = undefined; cargarAlertas().then(alExito, alFallar) }, 150) }
const alVolver = () => { if (document.visibilityState === 'visible') cargarAlertas().then(alExito, alFallar) }

/** Vuelve a leer rutas, salidas y alertas (lo usa el panel del coordinador tras guardar). */
export const refrescarLogistica = () => supabase
  ? Promise.all([cargarRutas(), cargarAlertas()]).then(alExito, alFallar)
  : Promise.resolve()

function iniciar() {
  if (iniciada || !supabase) return
  iniciada = true
  Promise.all([cargarRutas(), cargarAlertas(), cargarClima()]).then(alExito, alFallar)
  // `alertas_via` no está en la publicación `supabase_realtime` (0003 no la agregó): el canal queda listo por si se agrega,
  // y mientras tanto las alertas se refrescan cada 60 s y al volver a la pestaña.
  canal = supabase.channel('logistica')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_via' }, luego)
    .subscribe()
  temporizador = setInterval(alVolver, 60_000)
  document.addEventListener('visibilitychange', alVolver)
  window.addEventListener('focus', alVolver)
}
function detener() {
  if (!iniciada) return
  iniciada = false
  clearInterval(temporizador)
  document.removeEventListener('visibilitychange', alVolver)
  window.removeEventListener('focus', alVolver)
  if (canal && supabase) supabase.removeChannel(canal)
  canal = null
}
function pedirTramos() {
  if (tramosPedidos || !supabase) return
  tramosPedidos = true
  cargarTramosBase().catch((e) => { tramosPedidos = false; console.warn('Logística: no se pudieron leer los tramos.', e?.message ?? e) })
}

const suscribir = (cb: () => void) => {
  oyentes.add(cb)
  iniciar()
  return () => { oyentes.delete(cb); if (!oyentes.size) detener() }
}

/** `tramos: false` evita descargar tramos (el mapa solo necesita las alertas). Con tramos: solo `mun:*` y Bogotá; para paradas usa `cargarTramos(ids)`. */
export function useLogistica(opciones: { tramos?: boolean } = {}): Logistica {
  const conTramos = opciones.tramos !== false
  useEffect(() => { if (conTramos) pedirTramos() }, [conTramos])
  return useSyncExternalStore(suscribir, () => estado, () => INICIAL)
}
export const tramoActual = (a: string, b: string) => crearTramoEntre(tramosMapa)(a, b)

// ---------- Utilidades ----------
export const minutos = (segundos: number) => Math.max(1, Math.round(segundos / 60))
/** «2 h 10 min» o «45 min». */
export function duracionLarga(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}
export const fechaVerificada = (f: string | null) => f ? `verificado el ${new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'verificación por confirmar'
export const dinero = (n: number) => `$${n.toLocaleString('es-CO')}`
/** Fecha de llegada + (n-1) días, en AAAA-MM-DD. */
export function fechaDelDia(llegada: string, n: number): string {
  const d = new Date(`${llegada}T12:00:00`)
  d.setDate(d.getDate() + n - 1)
  return d.toLocaleDateString('en-CA')
}
/** «lun a vie», «todos los días» o «sáb, dom». */
export function etiquetaDias(dias: number[]): string {
  if (dias.length === 7) return 'todos los días'
  const nombres = dias.map((d) => DIAS_ISO[d - 1][1])
  return nombres.join(', ')
}

// ---------- Rol del usuario (panel del coordinador) ----------
export type Rol = 'prestador' | 'coordinador' | 'admin'
/** undefined mientras carga; null si no hay sesión o no se pudo leer. */
export function useRol(): Rol | null | undefined {
  const uid = useUsuario()?.id
  const [r, setR] = useState<{ uid?: string; rol: Rol | null }>({ rol: null })
  useEffect(() => {
    if (!supabase || !uid) return
    let vivo = true
    supabase.from('perfiles').select('rol').eq('id', uid).maybeSingle().then(({ data }) => { if (vivo) setR({ uid, rol: data?.rol ?? null }) })
    return () => { vivo = false }
  }, [uid])
  if (!uid) return null
  return r.uid === uid ? r.rol : undefined
}
