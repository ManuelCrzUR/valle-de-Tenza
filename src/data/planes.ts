export type Categoria = 'aventura' | 'gastro' | 'cultura'

export interface Parada { id: string; nombre: string; detalle: string }
export interface Plan {
  id: Categoria
  titulo: string
  opcion: string      // texto de la opción en Itinerario
  categoria: string   // texto del filtro en Lugares
  icono: 'naturaleza' | 'gastronomia' | 'cultura'
  paradas: Parada[]
  hospedaje: { nombre: string; descripcion: string }
  duracion: string
}

export const PLANES: Plan[] = [
  {
    id: 'aventura', titulo: 'Tu aventura en el Valle', opcion: 'Naturaleza y Aventura', categoria: 'Naturaleza', icono: 'naturaleza',
    paradas: [
      { id: 'cascada-el-salto', nombre: 'Cascada El Salto', detalle: 'Senderismo' },
      { id: 'miradores', nombre: 'Miradores', detalle: 'Vistas del valle' },
      { id: 'pueblo-antiguo', nombre: 'Pueblo Antiguo', detalle: 'Recorrido a pie' },
    ],
    hospedaje: { nombre: 'Finca La Esperanza', descripcion: 'Cabaña rural' }, duracion: '2 días',
  },
  {
    id: 'gastro', titulo: 'Tu escapada gastronómica', opcion: 'Descanso y Gastronomía', categoria: 'Gastronomía', icono: 'gastronomia',
    paradas: [
      { id: 'mercado-local', nombre: 'Mercado Local', detalle: 'Productos de la región' },
      { id: 'cata-de-quesos', nombre: 'Cata de quesos', detalle: 'Sabores locales' },
      { id: 'recetas-tradicionales', nombre: 'Recetas tradicionales', detalle: 'Cocina del Valle' },
    ],
    hospedaje: { nombre: 'Casa Rural El Sabor', descripcion: 'Hospedería con restaurante de cocina local' }, duracion: '2 días',
  },
  {
    id: 'cultura', titulo: 'Tu ruta cultural', opcion: 'Cultura y Artesanías', categoria: 'Cultura', icono: 'cultura',
    paradas: [
      { id: 'talleres-de-ceramica', nombre: 'Talleres de cerámica', detalle: 'Oficio artesanal' },
      { id: 'tejidos', nombre: 'Tejidos', detalle: 'Oficio artesanal' },
      { id: 'museo-comunitario', nombre: 'Museo Comunitario', detalle: 'Memoria del Valle' },
      { id: 'tiangue', nombre: 'Tiangue', detalle: 'Mercado tradicional' },
    ],
    hospedaje: { nombre: 'Posada Artesanal', descripcion: 'Casa colonial restaurada en Sutatenza' }, duracion: '2 días',
  },
]

export const getPlan = (id: string | null | undefined) => PLANES.find((p) => p.id === id)

export const LUGARES = PLANES.flatMap((p) => p.paradas.map((x) => ({ ...x, plan: p })))
export const getLugar = (id: string | undefined) => LUGARES.find((l) => l.id === id)
