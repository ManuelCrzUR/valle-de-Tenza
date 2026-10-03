import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

// Enlace con la forma de un Button de la marca.
export function LinkButton({ to, variant = 'primary', icon, block, children }: {
  to: string; variant?: 'primary' | 'cta' | 'secondary' | 'ghost'; icon?: IconName; block?: boolean; children: ReactNode
}) {
  const cls = ['vd-btn', `vd-btn-${variant}`, block && 'vd-btn-block'].filter(Boolean).join(' ')
  return <Link to={to} className={cls}>{icon && <Icon name={icon} size={20} />}{children}</Link>
}
