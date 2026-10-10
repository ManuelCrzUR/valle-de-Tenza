export type Categoria = 'aventura' | 'gastro' | 'cultura'

// Metadatos de los 3 planes. Los lugares reales salen de lugares.json (campo `plan`) y los arma generarPlan.ts.
export interface Plan {
  id: Categoria
  titulo: string
  opcion: string      // texto de la opción en Itinerario
  categoria: string   // texto del filtro en Lugares
  icono: 'naturaleza' | 'gastronomia' | 'cultura'
}

export const PLANES: Plan[] = [
  { id: 'aventura', titulo: 'Tu aventura en el Valle', opcion: 'Naturaleza y Aventura', categoria: 'Naturaleza', icono: 'naturaleza' },
  { id: 'gastro', titulo: 'Tu escapada gastronómica', opcion: 'Descanso y Gastronomía', categoria: 'Gastronomía', icono: 'gastronomia' },
  { id: 'cultura', titulo: 'Tu ruta cultural', opcion: 'Cultura y Artesanías', categoria: 'Cultura', icono: 'cultura' },
]

export const getPlan = (id: string | null | undefined) => PLANES.find((p) => p.id === id)
