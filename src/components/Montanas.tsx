// Ilustración de marca: capas de montaña planas (niebla, teal, bosque) + sol ámbar. Sin degradados.
export type Variante = 'aventura' | 'gastro' | 'cultura'

const SOL: Record<Variante, { cx: number; cy: number; r: number }> = {
  aventura: { cx: 440, cy: 120, r: 44 },
  gastro: { cx: 150, cy: 135, r: 40 },
  cultura: { cx: 300, cy: 95, r: 52 },
}

export function Montanas({ variante = 'aventura', className }: { variante?: Variante; className?: string }) {
  const sol = SOL[variante]
  const espejo = variante === 'gastro' ? 'translate(600 0) scale(-1 1)' : undefined
  const baja = variante === 'cultura' ? 'translate(0 14)' : undefined
  return (
    <svg className={className} viewBox="0 0 600 420" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <circle {...sol} fill="#e0902f" />
      <g transform={[espejo, baja].filter(Boolean).join(' ') || undefined}>
        <path d="M0 260 L90 190 L170 240 L260 160 L360 250 L450 190 L600 270 V420 H0Z" fill="#a2b9af" />
        <path d="M0 310 L110 230 L200 290 L300 215 L410 300 L520 240 L600 300 V420 H0Z" fill="#2f6b5a" />
        <path d="M0 365 L130 290 L230 340 L340 275 L470 350 L600 310 V420 H0Z" fill="#14302b" />
        <path d="M180 395 H300 M220 407 H270" stroke="#f6f3ec" strokeWidth={4} strokeLinecap="round" />
      </g>
    </svg>
  )
}
