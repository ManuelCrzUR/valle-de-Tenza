import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { entrarConEnlace, useSesionLista, useUsuario } from '../state/reservas'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'

export default function PrestadorAcceso() {
  usePagina('Acceso de prestadores')
  const usuario = useUsuario()
  const lista = useSesionLista()
  const [correo, setCorreo] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to="/prestadores/panel" replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const r = await entrarConEnlace(correo)
    setEnviando(false)
    if (r.ok) setEnviado(true)
    else setError(r.error)
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Acceso para prestadores</h1>
      <p className="sub">Administra tus negocios y las solicitudes de reserva que llegan desde Valle Directo.</p>
      <div className="pr-acceso">
        {enviado ? (
          <p className="pr-ok" role="status">Te enviamos un enlace a {correo.trim()}. Ábrelo en este dispositivo para entrar.</p>
        ) : (
          <form className="pr-form" onSubmit={enviar} noValidate>
            <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" inputMode="email" required />
            <p className="pr-error" role="alert" aria-live="assertive">{error}</p>
            <Button type="submit" variant="cta" block disabled={enviando || !lista}>{enviando ? 'Enviando…' : 'Enviarme un enlace'}</Button>
          </form>
        )}
      </div>
    </div>
  )
}
