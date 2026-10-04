import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

// Hoja inferior (móvil y tablet): sube sobre el mapa, se cierra con la X o con Escape.
export function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCerrar])
  return (
    <div className="hoja" role="dialog" aria-label={titulo} ref={ref} tabIndex={-1}>
      <div className="hoja-cab">
        <h2 className="t-h3">{titulo}</h2>
        <button type="button" className="hoja-x" onClick={onCerrar} aria-label={`Cerrar ${titulo.toLowerCase()}`}><X size={24} aria-hidden /></button>
      </div>
      <div className="hoja-cuerpo">{children}</div>
    </div>
  )
}
