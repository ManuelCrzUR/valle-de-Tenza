// Métricas del panel de operación: consultan las vistas de 0005_metricas.sql (security_invoker, solo `authenticated`).
// No traen datos personales: solo agregados.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Vistas = Database['public']['Views']
export type OcupacionDia = { negocioId: string; fecha: string; cupo: number; ocupado: number; libre: number }
export type MetricaPrestador = { negocioId: string; total: number; confirmadas: number; rechazadas: number; tasaConfirmacion: number | null; respuestaHoras: number | null }
export type DemandaSemana = { municipio: string | null; plan: string; semana: string; itinerarios: number; personas: number }
export type BrechaDia = { municipio: string; fecha: string; personasDemandadas: number; cupoDisponible: number }
export type PrestadorInactivo = { negocioId: string; nombre: string; municipio: string; whatsapp: string | null; cupoActualizado: string }

export interface Consulta<T> { datos: T; cargando: boolean; error: string; recargar: () => void }

// Convierte un `interval` de Postgres («02:30:00», «1 day 02:00:00», «00:00:05.2») en horas; null si no hay.
export function intervaloAHoras(v: string | null | undefined): number | null {
  if (!v) return null
  const dias = /(-?\d+)\s+days?/.exec(v)
  const hms = /(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(v)
  if (!dias && !hms) return null
  const h = hms ? (Number(hms[2]) + Number(hms[3]) / 60 + Number(hms[4]) / 3600) * (hms[1] ? -1 : 1) : 0
  return (dias ? Number(dias[1]) * 24 : 0) + h
}

function useVista<F, T>(consultar: () => PromiseLike<{ data: F[] | null; error: unknown }>, mapear: (f: F) => T, clave: string): Consulta<T[]> {
  const [e, setE] = useState<{ datos: T[]; cargando: boolean; error: string }>({ datos: [], cargando: true, error: '' })
  const [n, setN] = useState(0)
  const recargar = useCallback(() => setN((x) => x + 1), [])
  useEffect(() => {
    if (!supabase) { setE({ datos: [], cargando: false, error: 'Sin conexión con el servidor.' }); return }
    let vivo = true
    consultar().then(({ data, error }) => {
      if (!vivo) return
      setE(error || !data ? { datos: [], cargando: false, error: 'No pudimos cargar las métricas. Revisa tu conexión.' } : { datos: data.map(mapear), cargando: false, error: '' })
    }, () => { if (vivo) setE({ datos: [], cargando: false, error: 'No pudimos cargar las métricas. Revisa tu conexión.' }) })
    return () => { vivo = false }
    // `consultar` y `mapear` cambian en cada render; la clave resume lo que realmente las distingue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, n])
  return { ...e, recargar }
}

type F<K extends keyof Vistas> = Vistas[K]['Row']

export function useOcupacion(negocioId?: string): Consulta<OcupacionDia[]> {
  return useVista<F<'ocupacion_diaria'>, OcupacionDia>(
    () => {
      const q = supabase!.from('ocupacion_diaria').select('*').order('fecha')
      return negocioId ? q.eq('negocio_id', negocioId) : q
    },
    (f) => ({ negocioId: f.negocio_id, fecha: f.fecha ?? '', cupo: f.cupo ?? 0, ocupado: f.ocupado ?? 0, libre: f.libre ?? 0 }),
    `ocup:${negocioId ?? ''}`,
  )
}
export const useMetricasPrestador = (): Consulta<MetricaPrestador[]> =>
  useVista<F<'metricas_prestador'>, MetricaPrestador>(
    () => supabase!.from('metricas_prestador').select('*'),
    (f) => ({ negocioId: f.negocio_id ?? '', total: f.total ?? 0, confirmadas: f.confirmadas ?? 0, rechazadas: f.rechazadas ?? 0, tasaConfirmacion: f.tasa_confirmacion, respuestaHoras: intervaloAHoras(f.respuesta_media) }),
    'metricas',
  )
export const useDemandaSemanal = (): Consulta<DemandaSemana[]> =>
  useVista<F<'demanda_semanal'>, DemandaSemana>(
    () => supabase!.from('demanda_semanal').select('*').order('semana', { ascending: false }),
    (f) => ({ municipio: f.municipio, plan: f.plan, semana: f.semana ?? '', itinerarios: f.itinerarios ?? 0, personas: f.personas ?? 0 }),
    'demanda',
  )
export const useBrechaHospedaje = (): Consulta<BrechaDia[]> =>
  useVista<F<'brecha_hospedaje'>, BrechaDia>(
    () => supabase!.from('brecha_hospedaje').select('*').order('fecha'),
    (f) => ({ municipio: f.municipio ?? '', fecha: f.fecha ?? '', personasDemandadas: f.personas_demandadas ?? 0, cupoDisponible: f.cupo_disponible ?? 0 }),
    'brecha',
  )
export const usePrestadoresInactivos = (): Consulta<PrestadorInactivo[]> =>
  useVista<F<'prestadores_inactivos'>, PrestadorInactivo>(
    () => supabase!.from('prestadores_inactivos').select('*').order('cupo_actualizado'),
    (f) => ({ negocioId: f.negocio_id, nombre: f.nombre, municipio: f.municipio, whatsapp: f.whatsapp, cupoActualizado: f.cupo_actualizado }),
    'inactivos',
  )

// ---------- CSV ----------
export interface ColumnaCsv<T> { titulo: string; valor: (fila: T) => string | number | null | undefined }

// Separador «;» (Excel en español lo espera así). Se escapan comillas y se protege contra fórmulas (=, +, -, @).
export function aCsv<T>(filas: T[], columnas: ColumnaCsv<T>[]): string {
  const celda = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columnas.map((c) => celda(c.titulo)).join(';'), ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(';'))].join('\r\n')
}

export function descargarCsv(nombre: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre.endsWith('.csv') ? nombre : `${nombre}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
