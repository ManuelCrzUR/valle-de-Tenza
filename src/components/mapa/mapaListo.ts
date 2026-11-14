// Cuándo puede empezar el recorrido: el mapa existe, el tamaño ya no cambia y al menos una tesela del área visible cargó.
export type FaseMapa = 'cargando' | 'listo' | 'error'

export interface CargaMapa {
  fase: FaseMapa
  tilesOk: number
  tilesMal: number
  tamanoEstable: boolean
  visible: boolean
  arranques: number
}

export type EventoMapa =
  | { tipo: 'tamano'; estable: boolean }
  | { tipo: 'visible'; valor: boolean }
  | { tipo: 'tileOk' }
  | { tipo: 'tileMal' }
  | { tipo: 'colaVacia' }
  | { tipo: 'timeout' }
  | { tipo: 'reintentar' }
  | { tipo: 'ruta' }

export const cargaInicial = (): CargaMapa => ({
  fase: 'cargando', tilesOk: 0, tilesMal: 0, tamanoEstable: false, visible: false, arranques: 0,
})

function marcarListo(s: CargaMapa): CargaMapa {
  if (s.fase === 'error' || s.fase === 'listo') return s
  if (s.tamanoEstable && s.tilesOk > 0) return { ...s, fase: 'listo', arranques: s.arranques + 1 }
  return s
}

export function reducirCarga(s: CargaMapa, ev: EventoMapa): CargaMapa {
  switch (ev.tipo) {
    case 'ruta':
    case 'reintentar':
      return { ...cargaInicial(), visible: s.visible }
    case 'visible':
      return { ...s, visible: ev.valor }
    case 'tamano':
      if (!ev.estable) return { ...s, tamanoEstable: false, fase: s.fase === 'error' ? 'error' : 'cargando', tilesOk: 0, tilesMal: 0 }
      return marcarListo({ ...s, tamanoEstable: true })
    case 'tileOk':
      return { ...s, tilesOk: s.tilesOk + 1 }
    case 'tileMal':
      return { ...s, tilesMal: s.tilesMal + 1 }
    case 'colaVacia':
      if (s.fase === 'listo') return s
      if (s.tilesOk === 0 && s.tilesMal > 0) return { ...s, fase: 'error' }
      return marcarListo(s)
    case 'timeout':
      return s.fase === 'listo' ? s : { ...s, fase: 'error' }
    default:
      return s
  }
}

export function puedeAnimar(s: CargaMapa): boolean {
  return s.fase === 'listo' && s.visible && s.tamanoEstable && s.tilesOk > 0
}
