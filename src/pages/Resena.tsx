// /resena/:codigo — el viajero (sin cuenta) deja su reseña con el código y el teléfono de la reserva.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { Button, TextField } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Icon } from '../components/Icon'
import { contactoGuardado } from '../state/reservas'
import { MAX_COMENTARIO, dejarResena, resenaPendiente } from '../state/resenas'
import type { Pendiente } from '../state/resenas'
import { usePagina } from '../usePagina'
import '../styles/reservas.css'
import '../styles/resenas.css'

const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const NOMBRE_NOTA = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente']

export default function Resena() {
  usePagina('Dejar una reseña')
  const codigo = (useParams().codigo ?? '').trim().toUpperCase()
  const [tel, setTel] = useState(() => contactoGuardado(codigo))
  const [pend, setPend] = useState<Pendiente | null>(null)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviada, setEnviada] = useState(false)

  const verificar = async (e: FormEvent) => {
    e.preventDefault()
    if (!tel.trim()) return setError('Escribe el teléfono con el que reservaste.')
    setTrabajando(true); setError('')
    const r = await resenaPendiente(codigo, tel.trim())
    setTrabajando(false)
    if (!r.ok || !r.pendiente) return setError(r.ok ? 'No pudimos consultar la reserva.' : r.error)
    setPend(r.pendiente)
  }
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (nota < 1) return setError('Elige una calificación de 1 a 5.')
    setTrabajando(true); setError('')
    const r = await dejarResena(codigo, tel.trim(), nota, comentario.trim())
    setTrabajando(false)
    if (r.ok) setEnviada(true); else setError(r.error)
  }

  return (
    <div className="wrap pagina rs-pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Cuéntanos cómo te fue</h1>
      {enviada ? (
        <>
          <p role="status" className="pr-ok">¡Gracias! Recibimos tu reseña.</p>
          <p className="sub">Se publica después de que el equipo la revise. No mostramos tu nombre ni tu teléfono.</p>
          <LinkButton to="/lugares" variant="primary">Explorar más lugares</LinkButton>
        </>
      ) : !pend ? (
        <form className="rs-form" onSubmit={verificar} noValidate aria-labelledby="titulo">
          <p className="sub">Reserva con código <strong>{codigo}</strong>. Para dejar tu reseña, escribe el teléfono con el que reservaste.</p>
          <TextField label="Teléfono o WhatsApp" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" required />
          <div aria-live="polite">{error && <p className="res-error" role="alert"><Icon name="alerta" size={18} />{error}</p>}</div>
          <Button type="submit" variant="primary" disabled={trabajando}>{trabajando ? 'Buscando…' : 'Continuar'}</Button>
        </form>
      ) : !pend.puede ? (
        <>
          <p className="res-aviso" role="status"><Icon name="alerta" size={20} />{pend.motivo}</p>
          <LinkButton to="/reservas" variant="secondary">Ver mis reservas</LinkButton>
        </>
      ) : (
        <form className="rs-form" onSubmit={enviar} noValidate>
          <p className="sub">{pend.negocioNombre ? <>Tu visita a <strong>{pend.negocioNombre}</strong>{pend.fecha ? ` (${fechaLarga(pend.fecha)})` : ''}.</> : 'Tu visita.'}</p>
          <fieldset className="rs-estrellas">
            <legend>Calificación, de 1 a 5 estrellas</legend>
            <div className="rs-opciones">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="rs-opcion">
                  <input type="radio" name="calificacion" value={n} checked={nota === n} onChange={() => setNota(n)} />
                  <span><Star size={18} aria-hidden className="rs-estrella-ico" fill={nota >= n ? 'currentColor' : 'none'} /><span aria-hidden>{n}</span><span className="sr-only">{n} {n === 1 ? 'estrella' : 'estrellas'}: {NOMBRE_NOTA[n]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="vd-field">
            <label htmlFor="rs-comentario" className="vd-field-label">Comentario (opcional)</label>
            <textarea id="rs-comentario" className="vd-input rs-area" value={comentario} maxLength={MAX_COMENTARIO} onChange={(e) => setComentario(e.target.value)} aria-describedby="rs-contador" />
            <p id="rs-contador" className="rs-contador">{comentario.length} / {MAX_COMENTARIO}</p>
          </div>
          <p className="rs-aviso">Tu reseña se publica después de que el equipo la revise. No mostramos tu nombre ni tu teléfono.</p>
          <div aria-live="polite">{error && <p className="res-error" role="alert"><Icon name="alerta" size={18} />{error}</p>}</div>
          <Button type="submit" variant="primary" disabled={trabajando}>{trabajando ? 'Enviando…' : 'Enviar reseña'}</Button>
        </form>
      )}
    </div>
  )
}
