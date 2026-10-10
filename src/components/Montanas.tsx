export type Variante =
  | 'aventura' | 'gastro' | 'cultura'
  | 'alojamiento' | 'restaurante' | 'comercio' | 'atraccion' | 'monumento' | 'naturaleza'
  | 'operador' | 'cajero' | 'gasolinera' | 'salud' | 'servicio'

const SOL: Record<Variante, { cx: number; cy: number; r: number }> = {
  aventura: { cx: 440, cy: 120, r: 44 },
  gastro: { cx: 150, cy: 135, r: 40 },
  cultura: { cx: 300, cy: 95, r: 52 },
  // Nuevas (ajusta posiciones a tu gusto)
  naturaleza: { cx: 440, cy: 120, r: 44 },
  atraccion: { cx: 480, cy: 100, r: 38 },
  operador: { cx: 400, cy: 140, r: 36 },
  restaurante: { cx: 150, cy: 135, r: 40 },
  comercio: { cx: 120, cy: 110, r: 34 },
  alojamiento: { cx: 300, cy: 95, r: 52 },
  monumento: { cx: 260, cy: 90, r: 46 },
  cajero: { cx: 340, cy: 110, r: 30 },
  gasolinera: { cx: 200, cy: 125, r: 32 },
  salud: { cx: 380, cy: 100, r: 40 },
  servicio: { cx: 300, cy: 120, r: 36 },
}

const ESPEJO: Variante[] = ['gastro', 'restaurante', 'comercio', 'gasolinera']
const BAJA: Variante[] = ['cultura', 'alojamiento', 'monumento', 'servicio']

export function Montanas({ variante = 'aventura', className }: { variante?: Variante; className?: string }) {
  const sol = SOL[variante]
  const espejo = ESPEJO.includes(variante) ? 'translate(600 0) scale(-1 1)' : undefined
  const baja = BAJA.includes(variante) ? 'translate(0 14)' : undefined
  return (
    <svg className={className} viewBox="0 0 600 420" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <circle {...sol} fill="#e0902f" className="m-sol" />
      <g transform={[espejo, baja].filter(Boolean).join(' ') || undefined}>
        <path d="M0 260 L90 190 L170 240 L260 160 L360 250 L450 190 L600 270 V420 H0Z" fill="#a2b9af" className="m-capa m-capa-1" />
        <path d="M0 310 L110 230 L200 290 L300 215 L410 300 L520 240 L600 300 V420 H0Z" fill="#2f6b5a" className="m-capa m-capa-2" />
        <path d="M0 365 L130 290 L230 340 L340 275 L470 350 L600 310 V420 H0Z" fill="#14302b" className="m-capa m-capa-3" />
        <path d="M180 395 H300 M220 407 H270" stroke="#f6f3ec" strokeWidth={4} strokeLinecap="round" />
      </g>
    </svg>
  )
}
