import { FOTOS } from '../data/fotos'
import type { FotoId } from '../data/fotos'
import '../styles/fotos.css'

const base = import.meta.env.BASE_URL

// Foto con su crédito. Ocupa el lugar de las ilustraciones: hereda el tamaño de `className` (hero-arte, detalle-arte...).
export function Foto({ n, className }: { n: FotoId; className?: string }) {
  const x = FOTOS[n]
  return (
    <figure className={['foto', className].filter(Boolean).join(' ')}>
      <img src={`${base}${x.archivo}`} alt={x.pie} loading="lazy" decoding="async" />
      <figcaption>
        {x.pie} · Foto: {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.fuente}</a> : x.fuente}
      </figcaption>
    </figure>
  )
}
