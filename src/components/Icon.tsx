import type { ReactElement } from 'react'

export type IconName =
  | 'naturaleza' | 'gastronomia' | 'cultura' | 'hospedaje' | 'ruta' | 'mapa'
  | 'embajador' | 'chat' | 'cupo-verificado' | 'itinerario' | 'alerta'

type Part = [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string | number>]

// Mismo set que assets/Iconos del sistema de marca, en currentColor.
const ICONS: Record<IconName, Part[]> = {
  naturaleza: [['path', { d: 'M2 20 L9 9 L13 15 L16 11 L22 20 Z' }], ['circle', { cx: 17, cy: 5, r: 2 }]],
  gastronomia: [['path', { d: 'M4 11 H20 A8 8 0 0 1 4 11 Z' }], ['path', { d: 'M8 7 C8 5 10 5 10 3 M13 7 C13 5 15 5 15 3' }], ['path', { d: 'M7 21 H17' }]],
  cultura: [['path', { d: 'M5 9 H19 L17 21 H7 Z' }], ['path', { d: 'M8 9 C8 5 16 5 16 9' }], ['path', { d: 'M6 13 L9 16 L12 13 L15 16 L18 13' }]],
  hospedaje: [['path', { d: 'M3 11 L12 4 L21 11' }], ['path', { d: 'M5 10 V20 H19 V10' }], ['path', { d: 'M10 20 V15 H14 V20' }]],
  ruta: [['circle', { cx: 5, cy: 19, r: 2 }], ['path', { d: 'M7.5 18 C13 17 8 11 13.5 11', strokeDasharray: '2 2.6' }], ['path', { d: 'M18 2.5 C15.8 2.5 14.5 4.2 14.5 6 C14.5 8.8 18 11.5 18 11.5 C18 11.5 21.5 8.8 21.5 6 C21.5 4.2 20.2 2.5 18 2.5 Z' }], ['circle', { cx: 18, cy: 6, r: 1 }]],
  mapa: [['path', { d: 'M3 6 L9 3 L15 6 L21 3 V18 L15 21 L9 18 L3 21 Z' }], ['path', { d: 'M9 3 V18 M15 6 V21' }]],
  embajador: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M3 20 C3 15.5 6 13.5 9 13.5 C12 13.5 15 15.5 15 20' }], ['path', { d: 'M15 4 H21 V9 H18 L16 11 V9 H15 Z' }]],
  chat: [['path', { d: 'M4 5 H20 V16 H11 L6 20 V16 H4 Z' }], ['path', { d: 'M8 10 H8.01 M12 10 H12.01 M16 10 H16.01' }]],
  'cupo-verificado': [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8 12 L11 15 L16 9' }]],
  itinerario: [['rect', { x: 4, y: 4, width: 16, height: 17, rx: 2 }], ['path', { d: 'M8 2 V6 M16 2 V6 M4 9 H20' }], ['path', { d: 'M8 13 H16 M8 17 H13' }]],
  alerta: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5 V13 M12 16.5 H12.01' }]],
}

export interface IconProps { name: IconName; size?: number; label?: string; className?: string }

export function Icon({ name, size = 24, label, className }: IconProps): ReactElement {
  return (
    <svg
      className={['vd-icon', className].filter(Boolean).join(' ')}
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"
    >
      {ICONS[name].map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  )
}
