// Lugares reales del Valle de Tenza. El JSON lo genera scraper/ejecutar.py (no editar a mano).
import { useSyncExternalStore } from 'react'
import datos from './lugares.json'
import { supabase } from '../lib/supabase'

export type CategoriaId =
  | 'alojamiento' | 'restaurante' | 'comercio' | 'atraccion' | 'monumento' | 'naturaleza'
  | 'operador' | 'cajero' | 'gasolinera' | 'salud' | 'servicio'
export type Precision = 'exacta' | 'direccion' | 'vereda' | 'cabecera'

export interface Lugar {
  id: string
  nombre: string
  categoria: CategoriaId
  subtipo: string
  municipio: string
  lat: number | null
  lon: number | null
  precision: Precision | null
  direccion: string
  vereda?: string
  plan: 'aventura' | 'gastro' | 'cultura' | null
  esServicio: boolean
  conRegistro: boolean
  fuentes: string[]
  /** Cómo se llega, propiedad privada, guía, dificultad. Solo viene de Supabase (lo llena el coordinador). */
  acceso?: string
  /** AAAA-MM-DD de la última verificación del acceso. */
  verificadoEn?: string
  extra?: { descripcion?: string; nivel?: string; habitaciones?: number; camas?: number; web?: string; horario?: string }
}
export interface MunicipioMapa { slug: string; nombre: string; centro: [number, number] | null; caja: [number, number, number, number] | null }

export const LUGARES = datos.lugares as unknown as Lugar[]
export const MUNICIPIOS = datos.municipios as unknown as MunicipioMapa[]
export const ATRIBUCION = datos.atribucion as string

// Orden = el de la leyenda. `icono` apunta a un ícono de la marca o a uno de Lucide (ver iconos.tsx).
export const CATEGORIAS: { id: CategoriaId; etiqueta: string; singular: string; servicio: boolean }[] = [
  { id: 'alojamiento', etiqueta: 'Alojamiento', singular: 'Alojamiento', servicio: false },
  { id: 'restaurante', etiqueta: 'Restaurantes y cafés', singular: 'Restaurante o café', servicio: false },
  { id: 'atraccion', etiqueta: 'Atracciones y miradores', singular: 'Atracción', servicio: false },
  { id: 'monumento', etiqueta: 'Monumentos e iglesias', singular: 'Monumento', servicio: false },
  { id: 'naturaleza', etiqueta: 'Parques, cerros y senderos', singular: 'Naturaleza', servicio: false },
  { id: 'operador', etiqueta: 'Guías y agencias', singular: 'Guía o agencia', servicio: false },
  { id: 'comercio', etiqueta: 'Tiendas y supermercados', singular: 'Tienda', servicio: true },
  { id: 'cajero', etiqueta: 'Cajeros y bancos', singular: 'Cajero o banco', servicio: true },
  { id: 'gasolinera', etiqueta: 'Gasolineras', singular: 'Gasolinera', servicio: true },
  { id: 'salud', etiqueta: 'Salud', singular: 'Salud', servicio: true },
  { id: 'servicio', etiqueta: 'Alcaldía y servicios', singular: 'Servicio', servicio: true },
]
export const CATEGORIA_POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c])) as Record<CategoriaId, (typeof CATEGORIAS)[number]>
export const NOMBRE_MUNICIPIO = Object.fromEntries(MUNICIPIOS.map((m) => [m.slug, m.nombre])) as Record<string, string>

export const tieneUbicacion = (l: Lugar): l is Lugar & { lat: number; lon: number } => l.lat !== null && l.lon !== null
export const esAproximado = (l: Lugar) => l.precision !== null && l.precision !== 'exacta'

export const getLugar = (id: string | undefined) => LUGARES.find((l) => l.id === id)

// ---------- Catálogo desde Supabase ----------
// Se consulta una sola vez por sesión y se comparte entre componentes. Si no hay backend, falla o tarda, queda el JSON.
interface Catalogo { lugares: Lugar[]; municipios: MunicipioMapa[]; origen: 'json' | 'supabase' }
type Fila = Record<string, any>

let catalogo: Catalogo = { lugares: LUGARES, municipios: MUNICIPIOS, origen: 'json' }
let iniciada = false
const oyentes = new Set<() => void>()

const aLugar = (f: Fila): Lugar => ({
  id: f.id, nombre: f.nombre, categoria: f.categoria, subtipo: f.subtipo ?? '', municipio: f.municipio,
  lat: f.lat, lon: f.lon, precision: f.precision, direccion: f.direccion ?? '', vereda: f.vereda ?? undefined,
  plan: f.plan, esServicio: !!f.es_servicio, conRegistro: !!f.con_registro, fuentes: f.fuentes ?? [], extra: f.extra ?? undefined,
  acceso: f.acceso?.trim() || undefined, verificadoEn: f.verificado_en ?? undefined,
})
const aMunicipio = (f: Fila): MunicipioMapa => ({ slug: f.slug, nombre: f.nombre, centro: f.centro ?? null, caja: f.caja ?? null })

async function traerTodo(tabla: string): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase!.from(tabla).select('*').range(desde, desde + 999)
    if (error) throw error
    filas.push(...(data as Fila[]))
    if (data.length < 1000) return filas
  }
}

function cargarCatalogo() {
  if (iniciada || !supabase) return
  iniciada = true
  const limite = new Promise<never>((_, no) => setTimeout(() => no(new Error('tiempo agotado')), 4000))
  Promise.race([Promise.all([traerTodo('municipios'), traerTodo('lugares')]), limite])
    .then(([ms, ls]) => {
      if (!ms.length || !ls.length) return
      catalogo = { municipios: ms.map(aMunicipio), lugares: ls.map(aLugar), origen: 'supabase' }
      oyentes.forEach((o) => o())
    })
    .catch((e) => console.warn('Catálogo: se usa el JSON local.', e?.message ?? e))
}

const suscribir = (o: () => void) => {
  oyentes.add(o)
  cargarCatalogo()
  return () => { oyentes.delete(o) }
}
const instantanea = () => catalogo

export const useCatalogo = (): Catalogo => useSyncExternalStore(suscribir, instantanea, instantanea)

// ---------- Reservas ----------
export type TipoReserva = 'hotel' | 'restaurante' | 'caminata' | 'actividad'
export const TIPOS_RESERVA: { id: TipoReserva; etiqueta: string }[] = [
  { id: 'hotel', etiqueta: 'Hotel o alojamiento' },
  { id: 'restaurante', etiqueta: 'Restaurante' },
  { id: 'caminata', etiqueta: 'Caminata' },
  { id: 'actividad', etiqueta: 'Actividad o guía' },
]
// Los servicios (cajero, salud, gasolina, tienda, alcaldía) no se reservan.
export function tipoReserva(l: Pick<Lugar, 'categoria'>): TipoReserva | null {
  switch (l.categoria) {
    case 'alojamiento': return 'hotel'
    case 'restaurante': return 'restaurante'
    case 'naturaleza': return 'caminata'
    case 'operador': case 'atraccion': case 'monumento': return 'actividad'
    default: return null
  }
}

// Distancia en metros entre dos puntos (haversine).
export function metros(a: [number, number], b: [number, number]): number {
  const r = (g: number) => (g * Math.PI) / 180
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

// Los subtipos vienen de OpenStreetMap en inglés; se muestran en español. Lo que no esté aquí ya viene en español.
const SUBTIPOS: Record<string, string> = {
  peak: 'Cima', viewpoint: 'Mirador', attraction: 'Atracción', park: 'Parque', garden: 'Jardín', monument: 'Monumento', memorial: 'Monumento', artwork: 'Obra de arte',
  sports_centre: 'Centro deportivo', swimming_pool: 'Piscina', convenience: 'Tienda', supermarket: 'Supermercado', bakery: 'Panadería', butcher: 'Carnicería', greengrocer: 'Verdulería',
  cafe: 'Café', restaurant: 'Restaurante', fast_food: 'Comidas rápidas', ice_cream: 'Heladería', bar: 'Bar', pharmacy: 'Farmacia', hospital: 'Hospital', library: 'Biblioteca',
  townhall: 'Alcaldía', hotel: 'Hotel', hostel: 'Hostal', guest_house: 'Casa de huéspedes', iglesia: 'Iglesia',
}
export const etiquetaSubtipo = (s: string) => SUBTIPOS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
