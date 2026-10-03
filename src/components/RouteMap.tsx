import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { Parada } from '../data/planes'

// Esquema de la ruta: puntos numerados bosque + línea punteada ámbar. No es un buscador ni va a escala.
// La línea se "dibuja" con una máscara (así conserva el punteado de la marca) y los puntos aparecen en orden.
export function RouteMap({ paradas }: { paradas: Parada[] }) {
  const mask = useId()
  const n = paradas.length, w = 520, h = 300
  const paso = n > 1 ? (w - 100) / (n - 1) : 0
  const pts = paradas.map((_, i): [number, number] => [n > 1 ? 50 + i * paso : w / 2, i % 2 ? 200 : 100])
  const linea = pts.map((p) => p.join(',')).join(' ')
  return (
    <svg className="route-map" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Esquema de la ruta con ${n} paradas`}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <polyline className="route-trazo" points={linea} fill="none" stroke="#fff" strokeWidth={16} pathLength={1} strokeDasharray={1} />
        </mask>
      </defs>
      <polyline points={linea} fill="none" stroke="var(--accent)" strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" mask={`url(#${mask})`} />
      {pts.map(([x, y], i) => (
        <g key={i} className="route-punto" style={{ '--i': i } as CSSProperties}>
          <circle cx={x} cy={y} r={18} fill="var(--primary)" />
          <text x={x} y={y + 6} textAnchor="middle" fill="var(--on-primary)" fontSize={16} fontWeight={700}>{i + 1}</text>
        </g>
      ))}
      <text x={12} y={h - 12} fill="var(--ink-muted)" fontSize={13}>Esquema ilustrativo, no a escala</text>
    </svg>
  )
}
