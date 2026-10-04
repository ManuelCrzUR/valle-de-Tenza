// Lugares reales del Valle de Tenza. El JSON lo genera scraper/ejecutar.py (no editar a mano).
import datos from './lugares.json'

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
