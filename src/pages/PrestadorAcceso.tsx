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
  const [enviado, setEnviado] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to="/prestadores/panel" replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(''); setEnviado('')
    setEnviando(true)
    const r = await entrarConEnlace(correo)
    setEnviando(false)
    if (r.ok) setEnviado(correo.trim().toLowerCase())
    else setError(r.error)
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Acceso para prestadores</h1>
      <p className="sub">Escribe tu correo y te enviamos un enlace para entrar. No necesitas contraseña.</p>
      <div className="pr-acceso">
        <form className="pr-form" onSubmit={enviar} noValidate>
          <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" inputMode="email" required />
          <Button type="submit" variant="cta" block disabled={enviando || !lista}>{enviando ? 'Enviando…' : 'Enviarme el enlace'}</Button>
        </form>
        <div aria-live="polite">
          {enviado && <p className="pr-ok">Te enviamos un enlace a {enviado}. Ábrelo en este dispositivo para entrar; si no lo ves, revisa la carpeta de spam.</p>}
          {error && <p className="pr-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  )
}
