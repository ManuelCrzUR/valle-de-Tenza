import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Option, TextField } from '../components/ui'
import { entrar, registrar, useUsuario } from '../state/demo'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'

const AVISO_DEMO = 'Modo demostración: las cuentas y reservas se guardan solo en este navegador; no uses una contraseña real.'

export default function PrestadorAcceso() {
  usePagina('Acceso de prestadores')
  const usuario = useUsuario()
  const go = useNavigate()
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to="/prestadores/panel" replace />

  const crear = modo === 'crear'
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const r = crear ? await registrar(nombre, correo, clave) : await entrar(correo, clave)
    setEnviando(false)
    if (r.ok) go('/prestadores/panel', { replace: true })
    else setError(r.error)
  }
  const cambiar = (m: 'entrar' | 'crear') => { setModo(m); setError('') }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Acceso para prestadores</h1>
      <p className="sub">Administra tus negocios y las solicitudes de reserva que llegan desde Valle Directo.</p>
      <div className="pr-acceso">
        <p className="pr-aviso" role="note">{AVISO_DEMO}</p>
        <div className="pr-tabs" role="group" aria-label="Tipo de acceso">
          <Option selected={!crear} onClick={() => cambiar('entrar')}>Entrar</Option>
          <Option selected={crear} onClick={() => cambiar('crear')}>Crear cuenta</Option>
        </div>
        <form className="pr-form" onSubmit={enviar} noValidate>
          {crear && <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required />}
          <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" inputMode="email" required />
          <div className="pr-clave-fila">
            <TextField
              label="Contraseña" type={ver ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)}
              autoComplete={crear ? 'new-password' : 'current-password'} minLength={crear ? 8 : undefined} required
              hint={crear ? 'Mínimo 8 caracteres.' : undefined}
            />
            <Button variant="secondary" aria-pressed={ver} onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Mostrar'}</Button>
          </div>
          <p className="pr-error" role="alert" aria-live="assertive">{error}</p>
          <Button type="submit" variant="cta" block disabled={enviando}>
            {enviando ? 'Enviando…' : crear ? 'Crear mi cuenta' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
