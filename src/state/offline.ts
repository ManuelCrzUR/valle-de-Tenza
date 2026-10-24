// Modo sin señal: estado de conexión y «Guardar para ver sin señal» (itinerario + teselas del mapa de la ruta).
// El itinerario guardado vive en Cache Storage (`valle-directo-ruta`, junto con las teselas) y se refleja en localStorage
// para poder leerlo de forma síncrona al arrancar. Solo se guardan datos públicos: nunca nombre, teléfono ni reservas.
import { useSyncExternalStore } from 'react'
import { cajaDe, contarTeselas, teselasDe, urlTesela, MAX_TESELAS } from '../lib/teselas'
import type { Itinerario, RutaPersonal } from '../data/generarPlan'
import { ordenRuta } from '../data/generarPlan'
import { tieneUbicacion } from '../data/lugares'
import type { Lugar } from '../data/lugares'
import type { Eleccion } from './itinerario'

export const CACHE_RUTA = 'valle-directo-ruta'
const CLAVE = 'valle-directo:ruta-guardada'
const URL_SNAPSHOT = '/__ruta-guardada.json'
const SIMULTANEAS = 2

export interface RutaGuardada {
  v: 1; guardadaEn: string; clave: string
  eleccion: Eleccion
  ruta: RutaPersonal               // paradas, comida y hospedaje ya resueltos por día
  opcional: string[][]             // ids opcionales por día
  lugares: Lugar[]                 // las fichas de todos los lugares de la ruta
  teselas: number
}

// ---------- Conexión ----------
const oyentesRed = (cb: () => void) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb) } }
export const useOnline = () => useSyncExternalStore(oyentesRed, () => navigator.onLine, () => true)

// ---------- Ruta guardada ----------
export const claveEleccion = (e: Pick<Eleccion, 'planId' | 'municipio' | 'semilla' | 'dias' | 'ruta'>) => JSON.stringify([e.planId, e.municipio, e.semilla, e.dias, e.ruta ?? null])

let guardada: RutaGuardada | null | undefined
const oyentes = new Set<() => void>()
export function leerGuardada(): RutaGuardada | null {
  if (guardada !== undefined) return guardada
  try { const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); guardada = v && v.v === 1 ? v : null } catch { guardada = null }
  return guardada ?? null
}
export const useRutaGuardada = () => useSyncExternalStore((cb) => { oyentes.add(cb); return () => { oyentes.delete(cb) } }, leerGuardada, () => null)
const poner = (g: RutaGuardada | null) => { guardada = g; oyentes.forEach((o) => o()) }

// ---------- Guardar ----------
export function planGuardado(it: Itinerario) {
  const pasos = ordenRuta(it)
  const puntos = [...pasos.map((p) => p.lugar), ...it.dias.flatMap((d) => d.opcional)].filter(tieneUbicacion).map((l) => [l.lat, l.lon] as [number, number])
  const caja = cajaDe(puntos)
  return { pasos, caja, total: caja ? contarTeselas(caja) : 0 }
}

export type Progreso = { hechas: number; total: number }
export type Resultado = { ok: true; teselas: number; fallidas: number } | { ok: false; motivo: 'grande' | 'sinCache' | 'sinUbicacion' | 'error'; total?: number }

export async function guardarParaSinSenal(it: Itinerario, eleccion: Eleccion, alAvanzar?: (p: Progreso) => void): Promise<Resultado> {
  if (!('caches' in globalThis)) return { ok: false, motivo: 'sinCache' }
  const { pasos, caja, total } = planGuardado(it)
  if (!caja) return { ok: false, motivo: 'sinUbicacion' }
  if (total > MAX_TESELAS) return { ok: false, motivo: 'grande', total }
  try {
    const cache = await caches.open(CACHE_RUTA)
    const lista = teselasDe(caja)
    let hechas = 0, fallidas = 0, i = 0
    alAvanzar?.({ hechas, total: lista.length })
    // Descarga secuencial con, como máximo, 2 a la vez (política de teselas de OSM).
    const trabajador = async () => {
      while (i < lista.length) {
        const url = urlTesela(lista[i++])
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url, { mode: 'cors', credentials: 'omit' })
            if (r.ok) await cache.put(url, r); else fallidas++
          }
        } catch { fallidas++ }
        alAvanzar?.({ hechas: ++hechas, total: lista.length })
      }
    }
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabajador))
    if (fallidas > lista.length / 2) return { ok: false, motivo: 'error' }
    const lugares = new Map<string, Lugar>()
    for (const l of [...pasos.map((p) => p.lugar), ...it.dias.flatMap((d) => d.opcional)]) lugares.set(l.id, l)
    const snap: RutaGuardada = {
      v: 1, guardadaEn: new Date().toISOString(), clave: claveEleccion(eleccion), eleccion,
      ruta: { planId: it.plan.id, municipio: it.municipio, dias: it.dias.map((d) => ({ paradas: d.paradas.map((l) => l.id), comida: d.comida?.id })), hospedaje: it.hospedaje?.id },
      opcional: it.dias.map((d) => d.opcional.map((l) => l.id)),
      lugares: [...lugares.values()], teselas: lista.length - fallidas,
    }
    await cache.put(URL_SNAPSHOT, new Response(JSON.stringify(snap), { headers: { 'Content-Type': 'application/json' } }))
    try { localStorage.setItem(CLAVE, JSON.stringify(snap)) } catch { /* sin almacenamiento: queda en Cache Storage */ }
    poner(snap)
    return { ok: true, teselas: lista.length - fallidas, fallidas }
  } catch { return { ok: false, motivo: 'error' } }
}

export async function borrarGuardada() {
  try { await caches.delete(CACHE_RUTA); localStorage.removeItem(CLAVE) } catch { /* nada */ }
  poner(null)
}

// Si localStorage se limpió pero Cache Storage conserva la ruta, se recupera al arrancar.
export async function restaurarGuardada() {
  if (leerGuardada() || !('caches' in globalThis)) return
  try {
    const r = await (await caches.open(CACHE_RUTA)).match(URL_SNAPSHOT)
    const v = r ? await r.json() : null
    if (v?.v === 1) poner(v)
  } catch { /* nada */ }
}
