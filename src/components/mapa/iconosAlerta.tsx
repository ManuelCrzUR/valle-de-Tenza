import { Construction, Info, Mountain, OctagonX, TriangleAlert } from 'lucide-react'
import type { TipoAlerta } from '../../state/logistica'

// Ícono por tipo de alerta (la forma distingue el tipo, no solo el color).
export function AlertaIcono({ tipo, size = 20 }: { tipo: TipoAlerta; size?: number }) {
  const l = { size, strokeWidth: 2, 'aria-hidden': true as const, focusable: false as const }
  switch (tipo) {
    case 'cierre': return <OctagonX {...l} />
    case 'paso_restringido': return <TriangleAlert {...l} />
    case 'derrumbe': return <Mountain {...l} />
    case 'obra': return <Construction {...l} />
    default: return <Info {...l} />
  }
}
