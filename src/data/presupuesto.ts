// Presupuesto estimado del itinerario. Solo suma precios publicados («desde» de rutas y negocios);
// si falta uno, esa línea queda sin valor y el total es parcial. Nunca promedia ni supone.
export interface EntradaPresupuesto {
  movilidad?: 'carro' | 'publico'
  personas: number
  dias: number
  /** Precios `precio_desde_cop` de las rutas Bogotá → municipio base; `directa` false = solo hay rutas a Guateque. */
  transporte: { directa: boolean; precios: (number | null)[] }
  /** Hospedaje sugerido: `null` si el itinerario no tiene; `precio` null si el negocio no publicó. */
  hospedaje: { precio: number | null } | null
  /** Un elemento por comida (restaurante) del itinerario; `precio` null si no hay negocio con precio. */
  comidas: { precio: number | null }[]
}
export interface LineaPresupuesto { concepto: string; valor: number | null; nota: string }
export interface Presupuesto { lineas: LineaPresupuesto[]; total: number; faltantes: string[] }

export const cop = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function calcularPresupuesto(e: EntradaPresupuesto): Presupuesto {
  const lineas: LineaPresupuesto[] = []
  const faltantes: string[] = []
  const personas = Math.max(1, e.personas)

  // Transporte
  if (e.movilidad === 'carro') {
    lineas.push({ concepto: 'Transporte', valor: null, nota: 'Gasolina y peajes: no los estimamos.' })
  } else if (e.movilidad === 'publico') {
    const publicados = e.transporte.precios.filter((p): p is number => p !== null)
    const desde = publicados.length ? Math.min(...publicados) : null
    const destino = e.transporte.directa ? '' : ' La ruta es a Guateque (no hay directa al municipio base).'
    if (desde === null) {
      lineas.push({ concepto: 'Transporte', valor: null, nota: `Sin precio publicado.${destino}` })
      faltantes.push('transporte')
    } else {
      lineas.push({ concepto: 'Transporte', valor: desde * personas * 2, nota: `Ida y vuelta, desde ${cop(desde)} por persona, ${personas} ${personas === 1 ? 'persona' : 'personas'}.${destino}` })
    }
  } else {
    lineas.push({ concepto: 'Transporte', valor: null, nota: 'Elige cómo te mueves para ver el transporte.' })
    faltantes.push('transporte')
  }

  // Hospedaje
  const noches = e.dias - 1
  if (noches > 0) {
    const precio = e.hospedaje?.precio ?? null
    if (precio === null) {
      lineas.push({ concepto: 'Hospedaje', valor: null, nota: e.hospedaje ? 'Sin precio publicado.' : 'No hay hospedaje sugerido en esta ruta.' })
      faltantes.push('hospedaje')
    } else {
      lineas.push({ concepto: 'Hospedaje', valor: precio * noches * personas, nota: `Desde, por persona y noche según lo publicado por el negocio (${cop(precio)} × ${noches} ${noches === 1 ? 'noche' : 'noches'} × ${personas}).` })
    }
  }

  // Comida
  if (e.comidas.length) {
    const publicadas = e.comidas.filter((c): c is { precio: number } => c.precio !== null)
    if (!publicadas.length) {
      lineas.push({ concepto: 'Comida', valor: null, nota: 'Sin precio publicado.' })
      faltantes.push('comida')
    } else {
      const suma = publicadas.reduce((s, c) => s + c.precio, 0) * personas
      const parcial = publicadas.length < e.comidas.length
      lineas.push({ concepto: 'Comida', valor: suma, nota: `Desde, por persona, ${parcial ? `solo ${publicadas.length} de ${e.comidas.length} comidas tienen precio publicado` : `${publicadas.length} ${publicadas.length === 1 ? 'comida' : 'comidas'}`}.` })
      if (parcial) faltantes.push('comida')
    }
  }

  const total = lineas.reduce((s, l) => s + (l.valor ?? 0), 0)
  return { lineas, total, faltantes }
}
