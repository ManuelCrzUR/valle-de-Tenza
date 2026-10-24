// Eventos del Valle (fiestas, mercados) desde la tabla `eventos`: de hoy a +60 días, con Realtime.
// Sin Supabase la lista queda vacía y las pantallas ocultan sus secciones.
import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'

export interface Evento {
  id: number
  municipio: string
  nombre: string
  descripcion: string | null
  desde: string            // AAAA-MM-DD
  hasta: string | null     // AAAA-MM-DD (inclusive); null = un solo día
  fuente: string | null
  verificadoEn: string | null
}

const fechaLocal = (d: Date) => d.toLocaleDateString('en-CA')
const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const VENTANA_DIAS = 60

let eventos: Evento[] = []
let iniciada = false
let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let pendiente: ReturnType<typeof setTimeout> | undefined
const oyentes = new Set<() => void>()

async function cargar() {
  if (!supabase) return
  const hoy = fechaLocal(new Date())
  // Un evento sigue vigente si su fin (o su inicio, si no tiene fin) es de hoy en adelante.
  const { data, error } = await supabase.from('eventos').select('*')
    .or(`hasta.gte.${hoy},and(hasta.is.null,desde.gte.${hoy})`)
    .lte('desde', fechaLocal(sumarDias(new Date(), VENTANA_DIAS))).order('desde')
  if (error) throw error
  eventos = data.map((f): Evento => ({
    id: f.id, municipio: f.municipio, nombre: f.nombre, descripcion: f.descripcion,
    desde: f.desde, hasta: f.hasta, fuente: f.fuente, verificadoEn: f.verificado_en,
  }))
  oyentes.forEach((o) => o())
}
const intentar = () => cargar().catch((e) => console.warn('Eventos: no se pudieron leer.', e?.message ?? e))

/** Vuelve a leer los eventos (lo usa el panel del coordinador tras guardar). */
export const refrescarEventos = () => (supabase ? intentar() : Promise.resolve())

function iniciar() {
  if (iniciada || !supabase) return
  iniciada = true
  intentar()
  canal = supabase.channel('eventos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => {
      if (!pendiente) pendiente = setTimeout(() => { pendiente = undefined; intentar() }, 150)
    })
    .subscribe()
}
function detener() {
  if (!iniciada) return
  iniciada = false
  if (canal && supabase) supabase.removeChannel(canal)
  canal = null
}
const suscribir = (o: () => void) => {
  oyentes.add(o)
  iniciar()
  return () => { oyentes.delete(o); if (!oyentes.size) detener() }
}

/** Eventos de hoy a +60 días, ordenados por fecha. */
export const useEventos = (): Evento[] => useSyncExternalStore(suscribir, () => eventos, () => eventos)

const finDe = (e: Pick<Evento, 'desde' | 'hasta'>) => e.hasta ?? e.desde
/** Eventos que tocan algún día entre `desde` y `hasta` (AAAA-MM-DD, inclusive), opcionalmente de un municipio. */
export const eventosEntre = (desde: string, hasta: string, municipio?: string, lista: Evento[] = eventos): Evento[] =>
  lista.filter((e) => e.desde <= hasta && finDe(e) >= desde && (!municipio || e.municipio === municipio))

/** Viernes a domingo de este fin de semana (si hoy ya es vie/sáb/dom, desde hoy). */
export function finDeSemana(ahora = new Date()): { desde: string; hasta: string } {
  const dow = ahora.getDay()                    // 0 = domingo
  const aVier = dow === 0 ? 0 : dow >= 5 ? 0 : 5 - dow
  const aDom = dow === 0 ? 0 : 7 - dow
  const vier = sumarDias(ahora, aVier)
  return { desde: fechaLocal(dow >= 5 || dow === 0 ? ahora : vier), hasta: fechaLocal(sumarDias(ahora, aDom)) }
}

const fmt = (f: string, o: Intl.DateTimeFormatOptions) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', o)
/** «sáb 25 de octubre» o «del 24 al 26 de octubre». */
export function rangoFechas(e: Pick<Evento, 'desde' | 'hasta'>): string {
  if (!e.hasta || e.hasta === e.desde) return fmt(e.desde, { weekday: 'short', day: 'numeric', month: 'long' })
  const a = new Date(`${e.desde}T12:00:00`), b = new Date(`${e.hasta}T12:00:00`)
  return a.getMonth() === b.getMonth()
    ? `del ${a.getDate()} al ${fmt(e.hasta, { day: 'numeric', month: 'long' })}`
    : `del ${fmt(e.desde, { day: 'numeric', month: 'long' })} al ${fmt(e.hasta, { day: 'numeric', month: 'long' })}`
}
export const fechaLarga = (f: string) => fmt(f, { day: 'numeric', month: 'long', year: 'numeric' })
