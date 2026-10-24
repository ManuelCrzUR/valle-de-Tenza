// Operación real sobre Supabase: sesión de prestadores (Auth), negocios, cupos, reservas y Realtime.
// Los viajeros no tienen cuenta: reservan y consultan solo por funciones `rpc` con código + contacto.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { TipoReserva } from '../data/lugares'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Tablas = Database['public']['Tables']

export interface Negocio {
  id: string
  lugarId: string                 // id del lugar del mapa que reclama, o `negocio:<id>` si es un negocio que no está en el mapa
  nombre: string; tipo: TipoReserva; municipio: string
  cupoDiario: number              // personas por día
  precioDesdeCop?: number
  descripcion: string
  verificado: boolean
  cupoActualizado: string         // ISO: última vez que el prestador tocó el cupo
  whatsapp?: string               // solo lo trae `useMisNegocios` (el público no lo ve)
}
export type EstadoReserva = 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada' | 'vencida'
export interface Reserva {
  id: string; codigo: string; lugarId: string; negocioId: string | null; tipo: TipoReserva
  nombre: string; contacto: string; fecha: string; hora?: string; noches?: number; personas: number; nota: string
  estado: EstadoReserva; creada: string
}
export interface Usuario { id: string; nombre: string; correo: string }
export interface CupoDia { negocio_id: string; fecha: string; cupo: number | null; cerrado: boolean }
export interface OcupacionDia { negocio_id: string; fecha: string; personas: number }
export interface Operacion { negocios: Negocio[]; cupos: CupoDia[]; ocupacion: OcupacionDia[]; cargando: boolean; sinConexion: boolean }
export type Resultado = { ok: true } | { ok: false; error: string }

export const LUGAR_NEGOCIO = 'negocio:'
export const hoy = () => new Date().toLocaleDateString('en-CA')   // AAAA-MM-DD en hora local
const enDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const fallo = (e: { message?: string } | null | undefined, por = 'No se pudo completar la operación. Inténtalo de nuevo.'): Resultado =>
  ({ ok: false, error: e?.message || por })
const SIN_CONEXION: Resultado = { ok: false, error: 'Sin conexión: por ahora no se pueden hacer reservas.' }

// ---------- Mapeos ----------
type FilaNegocio = Pick<Tablas['negocios']['Row'], 'id' | 'lugar_id' | 'nombre' | 'tipo' | 'municipio' | 'cupo_diario' | 'precio_desde_cop' | 'descripcion' | 'verificado' | 'cupo_actualizado'> & { whatsapp?: string | null }
const aNegocio = (f: FilaNegocio): Negocio => ({
  id: f.id, lugarId: f.lugar_id ?? `${LUGAR_NEGOCIO}${f.id}`, nombre: f.nombre, tipo: f.tipo, municipio: f.municipio,
  cupoDiario: f.cupo_diario, precioDesdeCop: f.precio_desde_cop ?? undefined, descripcion: f.descripcion,
  verificado: f.verificado, cupoActualizado: f.cupo_actualizado, ...(f.whatsapp ? { whatsapp: f.whatsapp } : {}),
})
const aReserva = (f: Tablas['reservas']['Row']): Reserva => ({
  id: f.id, codigo: f.codigo, lugarId: f.lugar_id ?? (f.negocio_id ? `${LUGAR_NEGOCIO}${f.negocio_id}` : ''), negocioId: f.negocio_id, tipo: f.tipo,
  nombre: f.nombre, contacto: f.contacto, fecha: f.fecha, hora: f.hora ?? undefined, noches: f.tipo === 'hotel' ? f.noches : undefined,
  personas: f.personas, nota: f.nota ?? '', estado: f.estado, creada: f.creada,
})

// ---------- Operación pública: negocios, cupos y ocupación (almacén de módulo + Realtime) ----------
const VACIA: Operacion = { negocios: [], cupos: [], ocupacion: [], cargando: false, sinConexion: !supabase }
const INICIAL: Operacion = supabase ? { ...VACIA, cargando: true } : VACIA
let op: Operacion = INICIAL
const oyentes = new Set<() => void>()
const poner = (p: Partial<Operacion>) => { op = { ...op, ...p }; oyentes.forEach((f) => f()) }

async function cargarNegocios() {
  const { data, error } = await supabase!.from('negocios_publicos').select('*')
  if (error) throw error
  poner({ negocios: data.map(aNegocio) })
}
async function cargarCupos() {
  const { data, error } = await supabase!.from('cupo_dia').select('negocio_id,fecha,cupo,cerrado').gte('fecha', hoy()).lte('fecha', enDias(30))
  if (error) throw error
  poner({ cupos: data })
}
async function cargarOcupacion() {
  const { data, error } = await supabase!.from('ocupacion').select('negocio_id,fecha,personas').gte('fecha', hoy()).lte('fecha', enDias(30))
  if (error) throw error
  poner({ ocupacion: data })
}
const alFallar = (e: unknown) => { console.warn('Operación: sin conexión con Supabase.', (e as Error)?.message ?? e); poner({ cargando: false, sinConexion: true }) }
const alExito = () => { if (op.sinConexion || op.cargando) poner({ cargando: false, sinConexion: false }) }

export const refrescarOperacion = () => Promise.all([cargarNegocios(), cargarCupos(), cargarOcupacion()]).then(alExito, alFallar)

// Agrupa ráfagas de eventos Realtime en una sola consulta por tabla.
const pendientes = new Map<string, ReturnType<typeof setTimeout>>()
const luego = (clave: string, f: () => Promise<void>) => {
  if (pendientes.has(clave)) return
  pendientes.set(clave, setTimeout(() => { pendientes.delete(clave); f().then(alExito, alFallar) }, 150))
}
let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
function iniciarOperacion() {
  if (!supabase || canal) return
  refrescarOperacion()
  canal = supabase.channel('operacion')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ocupacion' }, () => luego('ocupacion', cargarOcupacion))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cupo_dia' }, () => luego('cupo_dia', cargarCupos))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'negocios' }, () => luego('negocios', cargarNegocios))
    .subscribe()
}
function suscribirOperacion(cb: () => void) {
  oyentes.add(cb)
  iniciarOperacion()
  return () => {
    oyentes.delete(cb)
    if (!oyentes.size && canal && supabase) { supabase.removeChannel(canal); canal = null; poner({ cargando: false }) }
  }
}
export const useOperacion = (): Operacion => useSyncExternalStore(suscribirOperacion, () => op, () => INICIAL)
export const operacionActual = (): Operacion => op

export const negocioDeLugar = (negocios: Negocio[], lugarId: string) => negocios.find((n) => n.lugarId === lugarId)

// Cupo libre del negocio en una fecha (AAAA-MM-DD): coalesce(cupo del día, cupo diario) menos lo ocupado; 0 si está cerrado.
export function cupoLibre(o: Pick<Operacion, 'cupos' | 'ocupacion'>, negocio: Negocio, fecha: string): number {
  const dia = o.cupos.find((c) => c.negocio_id === negocio.id && c.fecha === fecha)
  if (dia?.cerrado) return 0
  const usado = o.ocupacion.find((x) => x.negocio_id === negocio.id && x.fecha === fecha)?.personas ?? 0
  return Math.max(0, (dia?.cupo ?? negocio.cupoDiario) - usado)
}

// ---------- Sesión (Supabase Auth) ----------
interface Sesion { usuario?: Usuario; lista: boolean }
let sesion: Sesion = { lista: !supabase }
const oyentesSesion = new Set<() => void>()
const ponerSesion = (s: Sesion) => { sesion = s; oyentesSesion.forEach((f) => f()) }
const nombreDe = (n: string | undefined, correo: string) => (n && !n.includes('@') ? n : correo.split('@')[0])
function aUsuario(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Usuario {
  const correo = u.email ?? ''
  return { id: u.id, correo, nombre: nombreDe(u.user_metadata?.nombre as string | undefined, correo) }
}
let authIniciada = false
function iniciarAuth() {
  if (authIniciada || !supabase) return
  authIniciada = true
  supabase.auth.onAuthStateChange((_ev, s) => {
    if (!s) return ponerSesion({ lista: true })
    const u = aUsuario(s.user)
    ponerSesion({ usuario: sesion.usuario?.id === u.id ? { ...u, nombre: sesion.usuario.nombre } : u, lista: true })
    // El nombre del perfil se lee fuera del callback de Auth (no se deben hacer consultas dentro de él).
    setTimeout(async () => {
      const { data } = await supabase!.from('perfiles').select('nombre').eq('id', u.id).maybeSingle()
      if (data && sesion.usuario?.id === u.id) ponerSesion({ usuario: { ...u, nombre: nombreDe(data.nombre, u.correo) }, lista: true })
    }, 0)
  })
}
const suscribirSesion = (cb: () => void) => { oyentesSesion.add(cb); iniciarAuth(); return () => { oyentesSesion.delete(cb) } }
const VACIA_SESION: Sesion = { lista: false }
const useSesion = () => useSyncExternalStore(suscribirSesion, () => sesion, () => VACIA_SESION)
export const useUsuario = (): Usuario | undefined => useSesion().usuario
export const useSesionLista = (): boolean => useSesion().lista

export async function entrarConEnlace(correo: string): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const c = correo.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(c)) return { ok: false, error: 'Escribe un correo válido.' }
  const { error } = await supabase.auth.signInWithOtp({ email: c, options: { emailRedirectTo: `${location.origin}${location.pathname}#/prestadores/panel` } })
  return error ? fallo(error, 'No se pudo enviar el enlace. Inténtalo de nuevo.') : { ok: true }
}
export const salir = async () => { await supabase?.auth.signOut() }

// ---------- Panel del prestador ----------
export type NegocioNuevo = Omit<Negocio, 'id' | 'lugarId' | 'verificado' | 'cupoActualizado'> & { lugarId: string | null }   // lugarId null = negocio fuera del mapa
const alCambiarNegocios = new Set<() => void>()
const alCambiarReservas = new Set<() => void>()

export async function guardarNegocio(n: NegocioNuevo & { id?: string }): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user.id
  if (!uid) return { ok: false, error: 'Inicia sesión para registrar un negocio.' }
  if (!n.nombre.trim()) return { ok: false, error: 'Escribe el nombre del negocio.' }
  if (!(n.cupoDiario >= 1)) return { ok: false, error: 'El cupo diario debe ser al menos 1.' }
  const campos = {
    lugar_id: n.lugarId && !n.lugarId.startsWith(LUGAR_NEGOCIO) ? n.lugarId : null, nombre: n.nombre.trim(), tipo: n.tipo, municipio: n.municipio,
    cupo_diario: n.cupoDiario, precio_desde_cop: n.precioDesdeCop ?? null, descripcion: n.descripcion, whatsapp: n.whatsapp?.trim() || null,
  }
  const { error } = n.id
    ? await supabase.from('negocios').update(campos).eq('id', n.id)
    : await supabase.from('negocios').insert({ ...campos, perfil_id: uid })
  if (error) return error.code === '23505' ? { ok: false, error: 'Este lugar ya está registrado por otro prestador.' } : fallo(error)
  alCambiarNegocios.forEach((f) => f()); refrescarOperacion()
  return { ok: true }
}
export async function quitarNegocio(id: string): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { error } = await supabase.from('negocios').delete().eq('id', id)
  if (error) return fallo(error)
  alCambiarNegocios.forEach((f) => f()); refrescarOperacion()
  return { ok: true }
}
// El prestador solo puede pasar pendiente→confirmada|rechazada y confirmada→cancelada (lo exige la base).
export async function cambiarEstado(id: string, estado: EstadoReserva): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { data, error } = await supabase.from('reservas').update({ estado }).eq('id', id).select('id')
  if (error) return fallo(error)
  if (!data.length) return { ok: false, error: 'No se pudo cambiar el estado: la reserva cambió o no es de tu negocio.' }
  alCambiarReservas.forEach((f) => f())
  return { ok: true }
}

interface Carga<T> { datos: T; cargando: boolean; error: string }
export function useMisNegocios(): Carga<Negocio[]> & { negocios: Negocio[] } {
  const usuario = useUsuario()
  const [e, setE] = useState<Carga<Negocio[]>>({ datos: [], cargando: true, error: '' })
  const uid = usuario?.id
  useEffect(() => {
    if (!supabase || !uid) { setE({ datos: [], cargando: false, error: '' }); return }
    let vivo = true
    const cargar = async () => {
      const { data, error } = await supabase!.from('negocios').select('id,lugar_id,nombre,tipo,municipio,cupo_diario,precio_desde_cop,descripcion,verificado,cupo_actualizado,whatsapp').eq('perfil_id', uid).order('creado')
      if (vivo) setE(error ? { datos: [], cargando: false, error: 'No pudimos cargar tus negocios. Revisa tu conexión.' } : { datos: data.map(aNegocio), cargando: false, error: '' })
    }
    cargar()
    alCambiarNegocios.add(cargar)
    return () => { vivo = false; alCambiarNegocios.delete(cargar) }
  }, [uid])
  return { ...e, negocios: e.datos }
}

export function useReservasDeMisNegocios(): Carga<Reserva[]> & { reservas: Reserva[] } {
  const uid = useUsuario()?.id
  const [e, setE] = useState<Carga<Reserva[]>>({ datos: [], cargando: true, error: '' })
  useEffect(() => {
    if (!supabase || !uid) { setE({ datos: [], cargando: false, error: '' }); return }
    let vivo = true
    const cargar = async () => {
      const { data, error } = await supabase!.from('reservas').select('*').order('fecha')
      if (vivo) setE(error ? { datos: [], cargando: false, error: 'No pudimos cargar las reservas. Revisa tu conexión.' } : { datos: data.map(aReserva), cargando: false, error: '' })
    }
    cargar()
    alCambiarReservas.add(cargar)
    const ch = supabase.channel(`reservas-${uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, cargar).subscribe()
    return () => { vivo = false; alCambiarReservas.delete(cargar); supabase!.removeChannel(ch) }
  }, [uid])
  return { ...e, reservas: e.datos }
}

// ---------- Viajero (sin cuenta) ----------
export type ReservaNueva = Omit<Reserva, 'id' | 'codigo' | 'negocioId' | 'estado' | 'creada'>
const KEY_MIAS = 'valle-directo:mis-reservas'   // [{codigo, contacto}]: el contacto vive solo en este navegador, que es del propio viajero
interface Guardada { codigo: string; contacto: string }
const oyentesMias = new Set<() => void>()
function leerMias(): Guardada[] { try { return JSON.parse(localStorage.getItem(KEY_MIAS) ?? '[]') } catch { return [] } }
function guardarMias(l: Guardada[]) {
  try { localStorage.setItem(KEY_MIAS, JSON.stringify(l)) } catch { /* sin almacenamiento: no se recuerda */ }
  oyentesMias.forEach((f) => f())
}
const recordar = (g: Guardada) => guardarMias([...leerMias().filter((x) => x.codigo !== g.codigo), g])

export async function crearReserva(r: ReservaNueva): Promise<Resultado & { reserva?: { codigo: string; estado: EstadoReserva } }> {
  if (!supabase) return SIN_CONEXION
  const negocio = negocioDeLugar(op.negocios, r.lugarId)
  const { data, error } = await supabase.rpc('crear_reserva', {
    p_lugar_id: r.lugarId, p_tipo: r.tipo, p_fecha: r.fecha, p_hora: r.hora ?? '', p_noches: r.noches ?? 1, p_personas: r.personas,
    p_nombre: r.nombre, p_contacto: r.contacto, p_nota: r.nota, ...(negocio ? { p_negocio_id: negocio.id } : {}),
  })
  if (error) return fallo(error)
  const fila = data?.[0]
  if (!fila) return { ok: false, error: 'No se pudo enviar la solicitud.' }
  recordar({ codigo: fila.codigo, contacto: r.contacto })
  return { ok: true, reserva: { codigo: fila.codigo, estado: fila.estado } }
}

type FilaMi = Database['public']['Functions']['mi_reserva']['Returns'][number]
const deMi = (f: FilaMi, contacto: string): Reserva => ({
  id: f.codigo, codigo: f.codigo, lugarId: f.lugar_id ?? (f.negocio_id ? `${LUGAR_NEGOCIO}${f.negocio_id}` : ''), negocioId: f.negocio_id ?? null, tipo: f.tipo,
  nombre: f.nombre, contacto, fecha: f.fecha, hora: f.hora ?? undefined, noches: f.tipo === 'hotel' ? f.noches : undefined,
  personas: f.personas, nota: f.nota ?? '', estado: f.estado, creada: f.creada,
})
export async function buscarReserva(codigo: string, contacto: string): Promise<Resultado & { reserva?: Reserva }> {
  if (!supabase) return SIN_CONEXION
  const { data, error } = await supabase.rpc('mi_reserva', { p_codigo: codigo, p_contacto: contacto })
  if (error) return fallo(error)
  if (!data?.length) return { ok: false, error: 'No encontramos una reserva con ese código y ese teléfono.' }
  return { ok: true, reserva: deMi(data[0], contacto) }
}
export async function cancelarMiReserva(codigo: string, contacto: string): Promise<Resultado> {
  if (!supabase) return SIN_CONEXION
  const { error } = await supabase.rpc('cancelar_mi_reserva', { p_codigo: codigo, p_contacto: contacto })
  if (error) return fallo(error)
  guardarMias([...leerMias()])   // avisa a las pantallas para que vuelvan a consultar
  return { ok: true }
}

// Las reservas de este navegador (códigos guardados), consultadas una a una con `mi_reserva`.
export function useMisReservasEstado(): { reservas: Reserva[]; cargando: boolean } {
  const [lista, setLista] = useState<Reserva[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const guardadas = leerMias()
      if (!supabase || !guardadas.length) { if (vivo) { setLista([]); setCargando(false) } return }
      const rs = await Promise.all(guardadas.map((g) => supabase!.rpc('mi_reserva', { p_codigo: g.codigo, p_contacto: g.contacto }).then(({ data }) => (data?.[0] ? deMi(data[0], g.contacto) : null), () => null)))
      if (vivo) { setLista(rs.filter((x): x is Reserva => !!x).sort((a, b) => b.creada.localeCompare(a.creada))); setCargando(false) }
    }
    cargar()
    oyentesMias.add(cargar)
    return () => { vivo = false; oyentesMias.delete(cargar) }
  }, [])
  return { reservas: lista, cargando }
}
export const useMisReservas = (): Reserva[] => useMisReservasEstado().reservas
