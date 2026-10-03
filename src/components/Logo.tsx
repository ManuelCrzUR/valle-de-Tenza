import { useId } from 'react'
import type { ReactElement } from 'react'

export interface LogoProps {
  variant?: 'horizontal' | 'stacked' | 'symbol'
  size?: number
  onDark?: boolean
  tagline?: boolean
  className?: string
}

function Mark({ size }: { size: number }) {
  const id = useId()
  return (
    <svg className="vd-logo-mark" width={size} height={size} viewBox="0 0 200 200" aria-hidden focusable="false">
      <defs><clipPath id={id}><circle cx={100} cy={100} r={76} /></clipPath></defs>
      <circle cx={100} cy={100} r={96} fill="#14302b" />
      <circle cx={100} cy={100} r={99} fill="none" style={{ stroke: 'var(--vd-logo-ring, transparent)' }} strokeWidth={2} />
      <circle cx={100} cy={100} r={84} fill="none" stroke="#e0902f" strokeWidth={3} />
      <g clipPath={`url(#${id})`}>
        <rect width={200} height={200} fill="#f6f3ec" />
        <circle cx={132} cy={70} r={16} fill="#e0902f" />
        <path d="M20 118 L58 94 L88 114 L124 80 L180 118 V200 H20Z" fill="#2f6b5a" />
        <path d="M20 134 L62 114 L94 132 L132 104 L180 134 V200 H20Z" fill="#14302b" />
        <path d="M62 152 H138 M80 164 H120" stroke="#f6f3ec" strokeWidth={5} strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function Logo({ variant = 'horizontal', size = 44, onDark, tagline = true, className }: LogoProps): ReactElement {
  const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')
  if (variant === 'symbol') {
    return <span className={cls('vd-logo', onDark && 'vd-logo-ondark', className)} role="img" aria-label="Valle Directo"><Mark size={size} /></span>
  }
  return (
    <span className={cls('vd-logo', `vd-logo-${variant}`, onDark && 'vd-logo-ondark', className)} role="img" aria-label="Valle Directo, Valle de Tenza">
      <Mark size={size} />
      <span className="vd-logo-words" aria-hidden>
        <span className="vd-logo-name" style={{ fontSize: Math.round(size * 0.58) }}>Valle Directo</span>
        {tagline && <span className="vd-logo-tag" style={{ fontSize: Math.max(10, Math.round(size * 0.2)) }}>VALLE DE TENZA</span>}
      </span>
    </span>
  )
}
