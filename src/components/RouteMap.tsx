import type { Parada } from '../data/planes'

// Esquema de la ruta: puntos numerados bosque + línea punteada ámbar. No es un buscador ni va a escala.
export function RouteMap({ paradas }: { paradas: Parada[] }) {
  const n = paradas.length, w = 520, h = 300
  const paso = n > 1 ? (w - 100) / (n - 1) : 0
  const pts = paradas.map((_, i): [number, number] => [n > 1 ? 50 + i * paso : w / 2, i % 2 ? 200 : 100])
  return (
    <svg className="route-map" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Esquema de la ruta con ${n} paradas`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={18} fill="var(--primary)" />
          <text x={x} y={y + 6} textAnchor="middle" fill="var(--on-primary)" fontSize={16} fontWeight={700}>{i + 1}</text>
        </g>
      ))}
      <text x={12} y={h - 12} fill="var(--ink-muted)" fontSize={13}>Esquema ilustrativo, no a escala</text>
    </svg>
  )
}
