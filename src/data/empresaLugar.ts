import type { CategoriaId, Lugar, Precision } from './lugares.js'

export interface LugarPlano {
  id: string
  nombre: string
  categoria: CategoriaId
  municipio: string
  lat: number | null
  lon: number | null
  precision: Precision | null
  descripcion?: string
}

export function lugarDeFicha(n: { id: string; name: string; category: CategoriaId; municipality: string; description?: string; lat: number | null; lng: number | null }): Lugar {
  return lugarDesdePublico({
    id: n.id,
    nombre: n.name,
    categoria: n.category,
    municipio: n.municipality,
    lat: n.lat,
    lon: n.lng,
    precision: n.lat != null && n.lng != null ? 'exacta' : null,
    descripcion: n.description,
  })
}

export function lugarDesdePublico(p: LugarPlano): Lugar {
  const plan = p.categoria === 'restaurante'
    ? 'gastro'
    : p.categoria === 'monumento'
      ? 'cultura'
      : p.categoria === 'atraccion' || p.categoria === 'naturaleza'
        ? 'aventura'
        : null
  return {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    subtipo: p.id.startsWith('business:') ? 'empresa' : '',
    municipio: p.municipio,
    lat: p.lat,
    lon: p.lon,
    precision: p.precision,
    direccion: '',
    plan,
    esServicio: p.categoria === 'comercio',
    conRegistro: false,
    fuentes: p.id.startsWith('business:') ? ['Empresa publicada por su titular en Valle Directo'] : [],
    extra: p.descripcion ? { descripcion: p.descripcion } : undefined,
  }
}
