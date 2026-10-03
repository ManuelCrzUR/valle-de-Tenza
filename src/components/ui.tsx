import { useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

// ---------- Button ----------
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'cta' | 'secondary' | 'ghost'
  icon?: IconName
  block?: boolean
}
export function Button({ variant = 'primary', icon, block, className, children, type = 'button', ...rest }: ButtonProps): ReactElement {
  return (
    <button type={type} className={cx('vd-btn', `vd-btn-${variant}`, block && 'vd-btn-block', className)} {...rest}>
      {icon && <Icon name={icon} size={20} />}{children}
    </button>
  )
}

// ---------- Option ----------
export interface OptionProps extends ButtonHTMLAttributes<HTMLButtonElement> { selected?: boolean; icon?: IconName }
export function Option({ selected, icon, className, children, ...rest }: OptionProps): ReactElement {
  return (
    <button type="button" aria-pressed={!!selected} className={cx('vd-opt', className)} {...rest}>
      {icon && <Icon name={icon} size={20} />}{children}
    </button>
  )
}

// ---------- Chip ----------
export interface ChipProps { tone?: 'strong' | 'soft' | 'success' | 'danger'; icon?: IconName; children?: ReactNode; className?: string }
export function Chip({ tone = 'soft', icon, children, className }: ChipProps): ReactElement {
  return <span className={cx('vd-chip', `vd-chip-${tone}`, className)}>{icon && <Icon name={icon} size={16} />}{children}</span>
}

// ---------- PlaceCard ----------
export interface PlaceCardProps {
  title: ReactNode; description?: ReactNode; meta?: ReactNode
  chip?: ReactNode; chipTone?: ChipProps['tone']; chipIcon?: IconName
  image?: string; imageAlt?: string
  onClick?: () => void; children?: ReactNode; className?: string
}
export function PlaceCard({ title, description, meta, chip, chipTone, chipIcon, image, imageAlt, onClick, children, className }: PlaceCardProps): ReactElement {
  const inner = (
    <>
      {image && <img className="vd-card-img" src={image} alt={imageAlt ?? ''} />}
      {chip && <Chip tone={chipTone ?? 'soft'} icon={chipIcon}>{chip}</Chip>}
      <span className="vd-card-title">{title}</span>
      {description && <span className="vd-card-desc">{description}</span>}
      {meta && <span className="vd-card-meta">{meta}</span>}
      {children}
    </>
  )
  return onClick
    ? <button type="button" className={cx('vd-card', 'vd-card-action', className)} onClick={onClick}>{inner}</button>
    : <article className={cx('vd-card', className)}>{inner}</article>
}

// ---------- TextField ----------
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string; hint?: string; error?: string }
export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps): ReactElement {
  const auto = useId()
  const fid = id ?? auto
  const desc = error || hint ? `${fid}-d` : undefined
  return (
    <div className={cx('vd-field', error && 'vd-field-error', className)}>
      <label htmlFor={fid} className="vd-field-label">{label}</label>
      <input id={fid} className="vd-input" aria-invalid={error ? true : undefined} aria-describedby={desc} {...rest} />
      {desc && <span id={desc} className="vd-field-msg">{error && <Icon name="alerta" size={16} />}{error || hint}</span>}
    </div>
  )
}

// ---------- ChatBubble ----------
export interface ChatBubbleProps { from?: 'bot' | 'me' | 'ambassador'; author?: string; children?: ReactNode; className?: string }
export function ChatBubble({ from = 'bot', author, children, className }: ChatBubbleProps): ReactElement {
  return <div className={cx('vd-msg', `vd-msg-${from}`, className)}>{author && <span className="vd-msg-author">{author}</span>}{children}</div>
}

// ---------- TabBar ----------
export interface TabBarItem { id: string; label: string; icon: IconName }
export interface TabBarProps { items: TabBarItem[]; value: string; onChange?: (id: string) => void; label?: string; className?: string }
export function TabBar({ items, value, onChange, label = 'Navegación principal', className }: TabBarProps): ReactElement {
  return (
    <nav className={cx('vd-tabbar', className)} aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" className="vd-tab" aria-current={it.id === value ? 'page' : undefined} onClick={() => onChange?.(it.id)}>
          <span className="vd-tab-pill"><Icon name={it.icon} size={24} /></span>
          <span className="vd-tab-label">{it.label}</span>
        </button>
      ))}
    </nav>
  )
}
