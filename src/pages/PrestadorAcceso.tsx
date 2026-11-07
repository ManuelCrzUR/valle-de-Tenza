import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { supabase } from '../lib/supabase'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Entra con la contraseña.'
  if (m.includes('password')) return 'La contraseña no cumple lo que pide el proyecto. Prueba una más larga.'
  if (m.includes('email')) return 'Revisa el correo. No pude crear la cuenta con ese dato.'
  return 'No pude completar el acceso. Revisa los datos e inténtalo de nuevo.'
}

export default function PrestadorAcceso() {
  usePagina('Entrar como prestador')
  const { configurado, usuario } = useSesion()
  const nav = useNavigate()
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (usuario) nav('/prestadores/panel', { replace: true })
  }, [usuario, nav])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      if (modo === 'crear') {
        const { data, error: err } = await supabase.auth.signUp({ email: correo.trim(), password: clave })
        if (err) { setError(traducir(err.message)); return }
        if (data.session && data.user && nombre.trim()) {
          await supabase.from('profiles').update({ name: nombre.trim() }).eq('id', data.user.id)
        }
        if (!data.session) {
          setAviso('Cuenta creada. Si el proyecto pide confirmación, abre el enlace del correo antes de entrar. La contraseña no queda guardada en este navegador.')
          setClave('')
          return
        }
        nav('/prestadores/panel')
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
        if (err) { setError(traducir(err.message)); return }
        setClave('')
        nav('/prestadores/panel')
      }
    } finally {
      setOcupado(false)
    }
  }

  if (!configurado) {
    return (
      <div className="wrap pagina">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Entrar</h1>
        <p role="status">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. No hay una sesión local que pueda usar.</p>
        <Link to="/prestadores">Volver</Link>
      </div>
    )
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">{modo === 'crear' ? 'Crear cuenta de prestador' : 'Entrar'}</h1>
      <div className="opts" role="group" aria-label="Modo de acceso">
        <button type="button" className="vd-opt" aria-pressed={modo === 'entrar'} onClick={() => setModo('entrar')}>Entrar</button>
        <button type="button" className="vd-opt" aria-pressed={modo === 'crear'} onClick={() => setModo('crear')}>Crear cuenta</button>
      </div>
      <form className="prestador-form" onSubmit={(e) => void enviar(e)}>
        {modo === 'crear' && <TextField label="Nombre del perfil" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} />}
        <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" required />
        <TextField label="Contraseña" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} required minLength={6} />
        {error && <p role="alert">{error}</p>}
        {aviso && <p role="status">{aviso}</p>}
        <Button type="submit" variant="cta" disabled={ocupado}>{ocupado ? 'Espera…' : modo === 'crear' ? 'Crear cuenta' : 'Entrar'}</Button>
      </form>
      <p><Link to="/prestadores">Volver</Link></p>
    </div>
  )
}
