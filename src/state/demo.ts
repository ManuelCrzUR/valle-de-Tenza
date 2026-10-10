// Almacén DEMO de cuentas de prestadores, negocios y reservas. Todo vive en localStorage de este navegador:
// no es seguridad real ni llega a otros dispositivos. Para pasar a un backend real, cambia solo este archivo.
import { useSyncExternalStore } from 'react'
import type { TipoReserva } from '../data/lugares'

const KEY = 'valle-directo:demo'

export interface Usuario { id: string; nombre: string; correo: string; sal: string; hash: string }
export interface Negocio {
  id: string; usuarioId: string
  lugarId: string                 // id del lugar del mapa que reclama, o `negocio:<id>` si es un negocio nuevo que no está en el mapa
  nombre: string; tipo: TipoReserva; municipio: string
  cupoDiario: number              // personas por día
  descripcion: string
}
export type EstadoReserva = 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada'
export interface Reserva {
  id: string; lugarId: string; negocioId: string | null; tipo: TipoReserva
  nombre: string; contacto: string; fecha: string; hora?: string; noches?: number; personas: number; nota: string
  estado: EstadoReserva; creada: string
}
interface Datos { usuarios: Usuario[]; sesion: string | null; negocios: Negocio[]; reservas: Reserva[] }

const VACIO: Datos = { usuarios: [], sesion: null, negocios: [], reservas: [] }

// ---------- Almacén (patrón useSyncExternalStore; se sincroniza entre pestañas con el evento `storage`) ----------
let cache: Datos | null = null
const oyentes = new Set<() => void>()
function leer(): Datos {
  if (cache) return cache
  try { cache = { ...VACIO, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { cache = VACIO }
  return cache!
}
function escribir(d: Datos) {
  cache = d
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* sin almacenamiento: queda solo en memoria */ }
  oyentes.forEach((f) => f())
}
const cambiar = (f: (d: Datos) => Datos) => escribir(f(leer()))
function suscribir(cb: () => void) {
  oyentes.add(cb)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb() } }
  window.addEventListener('storage', onStorage)
  return () => { oyentes.delete(cb); window.removeEventListener('storage', onStorage) }
}
export const useDemo = (): Datos => useSyncExternalStore(suscribir, leer, () => VACIO)

// ---------- Utilidades ----------
const uid = () => crypto.randomUUID()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
async function hashClave(clave: string, sal: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${clave}`)))
}
const normCorreo = (c: string) => c.trim().toLowerCase()
export type Resultado = { ok: true } | { ok: false; error: string }

// ---------- Cuentas ----------
export async function registrar(nombre: string, correo: string, clave: string): Promise<Resultado> {
  const c = normCorreo(correo)
  if (!nombre.trim()) return { ok: false, error: 'Escribe tu nombre.' }
  if (!/^\S+@\S+\.\S+$/.test(c)) return { ok: false, error: 'Escribe un correo válido.' }
  if (clave.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  if (leer().usuarios.some((u) => u.correo === c)) return { ok: false, error: 'Ya existe una cuenta con ese correo.' }
  const sal = uid()
  const u: Usuario = { id: uid(), nombre: nombre.trim(), correo: c, sal, hash: await hashClave(clave, sal) }
  cambiar((d) => ({ ...d, usuarios: [...d.usuarios, u], sesion: u.id }))
  return { ok: true }
}
export async function entrar(correo: string, clave: string): Promise<Resultado> {
  const u = leer().usuarios.find((x) => x.correo === normCorreo(correo))
  if (!u || u.hash !== (await hashClave(clave, u.sal))) return { ok: false, error: 'Correo o contraseña incorrectos.' }
  cambiar((d) => ({ ...d, sesion: u.id }))
  return { ok: true }
}
export const salir = () => cambiar((d) => ({ ...d, sesion: null }))
export const useUsuario = (): Usuario | undefined => { const d = useDemo(); return d.usuarios.find((u) => u.id === d.sesion) }

// ---------- Negocios ----------
export type NegocioNuevo = Omit<Negocio, 'id' | 'usuarioId' | 'lugarId'> & { lugarId: string | null }   // lugarId null = negocio nuevo
export const LUGAR_NEGOCIO = 'negocio:'
export function guardarNegocio(n: NegocioNuevo & { id?: string }): Resultado {
  const sesion = leer().sesion
  if (!sesion) return { ok: false, error: 'Inicia sesión para registrar un negocio.' }
  if (!n.nombre.trim()) return { ok: false, error: 'Escribe el nombre del negocio.' }
  if (!(n.cupoDiario >= 1)) return { ok: false, error: 'El cupo diario debe ser al menos 1.' }
  // Un lugar del mapa solo lo puede reclamar una cuenta.
  const ajeno = n.lugarId && leer().negocios.find((x) => x.lugarId === n.lugarId && x.id !== n.id)
  if (ajeno) return { ok: false, error: 'Este lugar ya está registrado por otro prestador.' }
  cambiar((d) => {
    const id = n.id ?? uid()
    const nuevo: Negocio = { ...n, id, lugarId: n.lugarId ?? `${LUGAR_NEGOCIO}${id}`, usuarioId: sesion, nombre: n.nombre.trim() }
    return { ...d, negocios: n.id ? d.negocios.map((x) => (x.id === n.id && x.usuarioId === sesion ? nuevo : x)) : [...d.negocios, nuevo] }
  })
  return { ok: true }
}
export const quitarNegocio = (id: string) =>
  cambiar((d) => ({ ...d, negocios: d.negocios.filter((n) => n.id !== id || n.usuarioId !== d.sesion) }))
export const negocioDeLugar = (negocios: Negocio[], lugarId: string) => negocios.find((n) => n.lugarId === lugarId)

// ---------- Reservas ----------
// Reservas hechas en este navegador (viajero sin cuenta): sus ids se guardan aparte.
const KEY_MIAS = 'valle-directo:mis-reservas'
const OCUPAN: EstadoReserva[] = ['pendiente', 'confirmada']
// Cupo libre del negocio en una fecha (AAAA-MM-DD): cupo diario menos personas pendientes y confirmadas ese día.
export function cupoLibre(d: Pick<Datos, 'reservas'>, negocio: Negocio, fecha: string): number {
  const usado = d.reservas.filter((r) => r.negocioId === negocio.id && r.fecha === fecha && OCUPAN.includes(r.estado)).reduce((s, r) => s + r.personas, 0)
  return Math.max(0, negocio.cupoDiario - usado)
}
export type ReservaNueva = Omit<Reserva, 'id' | 'negocioId' | 'estado' | 'creada'>
export function crearReserva(r: ReservaNueva): Resultado & { reserva?: Reserva } {
  const d = leer()
  const negocio = negocioDeLugar(d.negocios, r.lugarId)
  if (negocio && r.personas > cupoLibre(d, negocio, r.fecha)) return { ok: false, error: `Solo quedan ${cupoLibre(d, negocio, r.fecha)} cupos para esa fecha.` }
  const reserva: Reserva = { ...r, id: uid(), negocioId: negocio?.id ?? null, estado: 'pendiente', creada: new Date().toISOString() }
  try { localStorage.setItem(KEY_MIAS, JSON.stringify([...misIds(), reserva.id])) } catch { /* sin almacenamiento */ }
  cambiar((x) => ({ ...x, reservas: [...x.reservas, reserva] }))   // avisa a las pantallas; la reserva ya quedó anotada como «mía»
  return { ok: true, reserva }
}
// El prestador solo cambia reservas de sus negocios; el viajero solo cancela (cualquiera puede, es una demo sin cuenta de viajero).
export function cambiarEstado(id: string, estado: EstadoReserva): Resultado {
  const d = leer()
  const r = d.reservas.find((x) => x.id === id)
  if (!r) return { ok: false, error: 'No se encontró la reserva.' }
  if (estado !== 'cancelada') {
    const propio = d.negocios.some((n) => n.id === r.negocioId && n.usuarioId === d.sesion)
    if (!propio) return { ok: false, error: 'Esta reserva no es de tu negocio.' }
    if (estado === 'confirmada' && r.estado !== 'confirmada') {
      const n = d.negocios.find((x) => x.id === r.negocioId)!
      // r ya cuenta como pendiente: el cupo se descuenta una sola vez.
      if (r.estado === 'rechazada' && r.personas > cupoLibre(d, n, r.fecha)) return { ok: false, error: 'Ya no hay cupo para esa fecha.' }
    }
  }
  cambiar((x) => ({ ...x, reservas: x.reservas.map((y) => (y.id === id ? { ...y, estado } : y)) }))
  return { ok: true }
}
function misIds(): string[] { try { return JSON.parse(localStorage.getItem(KEY_MIAS) ?? '[]') } catch { return [] } }
export function useMisReservas(): Reserva[] {
  const d = useDemo()
  const ids = new Set(misIds())
  return d.reservas.filter((r) => ids.has(r.id)).sort((a, b) => b.creada.localeCompare(a.creada))
}
export const hoy = () => new Date().toLocaleDateString('en-CA')   // AAAA-MM-DD en hora local
