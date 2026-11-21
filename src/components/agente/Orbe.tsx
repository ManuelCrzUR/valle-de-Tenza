import type { ReactElement } from 'react'
import '../../styles/agente.css'

export type EstadoOrbe = 'listo' | 'escuchando' | 'pensando' | 'hablando' | 'error'

/** Orbe decorativo del asistente: dos ojos que parpadean y reaccionan al estado. */
export function Orbe({
  estado = 'listo',
  tamano = 'md',
  className,
}: {
  estado?: EstadoOrbe
  tamano?: 'sm' | 'md' | 'lg'
  className?: string
}): ReactElement {
  return (
    <span
      className={`orbe orbe-${estado} orbe-${tamano} ${className ?? ''}`.trim()}
      aria-hidden="true"
    />
  )
}
