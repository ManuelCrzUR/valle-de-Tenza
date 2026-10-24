// Matemática de teselas XYZ (Web Mercator) para guardar el mapa de la ruta sin señal.
export const ZOOM_MIN = 12
export const ZOOM_MAX = 15
export const MAX_TESELAS = 300          // por encima de esto no se descarga (política de teselas de OSM)
export const MARGEN_M = 1000

export interface Caja { minLat: number; maxLat: number; minLon: number; maxLon: number }

// Caja de los puntos con un margen en metros.
export function cajaDe(puntos: [number, number][], margenM = MARGEN_M): Caja | null {
  if (!puntos.length) return null
  const lats = puntos.map((p) => p[0]), lons = puntos.map((p) => p[1])
  const dLat = margenM / 111_320
  const medLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const dLon = margenM / (111_320 * Math.cos((medLat * Math.PI) / 180))
  return { minLat: Math.min(...lats) - dLat, maxLat: Math.max(...lats) + dLat, minLon: Math.min(...lons) - dLon, maxLon: Math.max(...lons) + dLon }
}

const x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export interface Tesela { z: number; x: number; y: number }
export function teselasDe(c: Caja, zMin = ZOOM_MIN, zMax = ZOOM_MAX): Tesela[] {
  const out: Tesela[] = []
  for (let z = zMin; z <= zMax; z++) {
    const x0 = x(c.minLon, z), x1 = x(c.maxLon, z), y0 = y(c.maxLat, z), y1 = y(c.minLat, z)
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) out.push({ z, x: i, y: j })
  }
  return out
}
export const contarTeselas = (c: Caja, zMin = ZOOM_MIN, zMax = ZOOM_MAX) => {
  let n = 0
  for (let z = zMin; z <= zMax; z++) n += (x(c.maxLon, z) - x(c.minLon, z) + 1) * (y(c.minLat, z) - y(c.maxLat, z) + 1)
  return n
}
export const urlTesela = (t: Tesela) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`
