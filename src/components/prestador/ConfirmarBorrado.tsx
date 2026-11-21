import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button, TextField } from '../ui'

interface Props {
  abierto: boolean
  titulo: string
  /** Texto que se debe escribir para confirmar (nombre del negocio o correo). */
  confirmar: string
  /** Qué se borra y que no se puede deshacer. */
  children: ReactNode
  etiquetaBoton: string
  /** Etiqueta del campo de confirmación. */
  etiquetaCampo?: string
  ocupado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

const normal = (s: string) => s.trim().toLocaleLowerCase('es')

/** Diálogo modal nativo para acciones destructivas: exige escribir el nombre. Devuelve el foco al botón que lo abrió. */
export function ConfirmarBorrado({ abierto, titulo, confirmar, children, etiquetaBoton, etiquetaCampo = 'Escribe el nombre para confirmar', ocupado, onConfirmar, onCancelar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const origen = useRef<HTMLElement | null>(null)
  const [texto, setTexto] = useState('')
  const idTitulo = useId()
  const idDesc = useId()
  const coincide = confirmar.trim() !== '' && normal(texto) === normal(confirmar)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierto && !d.open) {
      origen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setTexto('')
      d.showModal()
      d.querySelector<HTMLInputElement>('input')?.focus()
    } else if (!abierto && d.open) {
      d.close()
    }
  }, [abierto])

  function alCerrar() {
    origen.current?.focus()
    origen.current = null
    if (abierto) onCancelar()
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (coincide && !ocupado) onConfirmar()
  }

  return (
    <dialog ref={ref} className="confirmar-borrado" aria-labelledby={idTitulo} aria-describedby={idDesc} onClose={alCerrar} onCancel={(e) => { if (ocupado) e.preventDefault() }}>
      <form onSubmit={enviar} className="confirmar-borrado-form">
        <h2 id={idTitulo} className="t-h2">{titulo}</h2>
        <div id={idDesc} className="confirmar-borrado-desc">{children}</div>
        <TextField
          label={etiquetaCampo}
          hint={confirmar}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <div className="confirmar-borrado-acciones">
          <Button type="button" variant="secondary" onClick={() => ref.current?.close()} disabled={ocupado}>Cancelar</Button>
          <Button type="submit" className="vd-btn-peligro" disabled={!coincide || ocupado}>{ocupado ? 'Borrando…' : etiquetaBoton}</Button>
        </div>
      </form>
    </dialog>
  )
}
