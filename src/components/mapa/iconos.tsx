import { Binoculars, Building2, Fuel, Landmark, ShoppingBasket, Stethoscope } from 'lucide-react'
import { Icon } from '../Icon'
import type { CategoriaId } from '../../data/lugares'

// Íconos de la marca donde existen; Lucide (mismo trazo) para el resto, como indica la guía de marca.
export function CategoriaIcono({ id, size = 20 }: { id: CategoriaId; size?: number }) {
  const l = { size, strokeWidth: 2, 'aria-hidden': true as const, focusable: false as const }
  switch (id) {
    case 'alojamiento': return <Icon name="hospedaje" size={size} />
    case 'restaurante': return <Icon name="gastronomia" size={size} />
    case 'monumento': return <Icon name="cultura" size={size} />
    case 'naturaleza': return <Icon name="naturaleza" size={size} />
    case 'operador': return <Icon name="ruta" size={size} />
    case 'atraccion': return <Binoculars {...l} />
    case 'comercio': return <ShoppingBasket {...l} />
    case 'cajero': return <Landmark {...l} />
    case 'gasolinera': return <Fuel {...l} />
    case 'salud': return <Stethoscope {...l} />
    case 'servicio': return <Building2 {...l} />
  }
}
