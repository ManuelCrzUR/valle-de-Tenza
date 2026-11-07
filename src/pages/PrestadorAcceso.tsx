import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  usePagina('Iniciar sesión')
  const { configurado, usuario } = useSesion()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [modo, setModo] = useState<'entrar' | 'crear'>(params.get('alta') === '1' ? 'crear' : 'entrar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (usuario) nav('/prestadores/panel', { replace: true })
  }, [usuario, nav])

  function cambiarModo(siguiente: 'entrar' | 'crear') {
    setModo(siguiente)
    setError('')
    setAviso('')
  }

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

  const titulo = modo === 'crear' ? 'Crear cuenta' : 'Iniciar sesión'
  return (
    <div className="wrap acceso">
      <section className="acceso-card" aria-busy={ocupado}>
        <p className="overline">Prestadores</p>
        <h1 id="titulo" tabIndex={-1} className="t-h1">{titulo}</h1>
        <p className="sub">
          {modo === 'crear'
            ? 'La cuenta es para publicar tu negocio. Quien viaja no la necesita.'
            : 'Entra para ver tu panel, tus borradores y lo que ya publicaste.'}
        </p>
        <div className="opts acceso-modos" role="group" aria-label="Elegir entre entrar y crear cuenta">
          <button type="button" className="vd-opt" aria-pressed={modo === 'entrar'} onClick={() => cambiarModo('entrar')}>Iniciar sesión</button>
          <button type="button" className="vd-opt" aria-pressed={modo === 'crear'} onClick={() => cambiarModo('crear')}>Crear cuenta</button>
        </div>
        {!configurado && (
          <p className="acceso-aviso" role="status">
            Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en este build. El formulario espera esas claves publicables y no guarda una sesión en el navegador.
          </p>
        )}
        <form className="acceso-form" onSubmit={(e) => void enviar(e)}>
          {modo === 'crear' && (
            <TextField label="Nombre del perfil" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} disabled={!configurado || ocupado} />
          )}
          <TextField
            label="Correo"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
            disabled={!configurado || ocupado}
          />
          <TextField
            label="Contraseña"
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
            enterKeyHint="go"
            required
            minLength={6}
            disabled={!configurado || ocupado}
          />
          {error && <p className="acceso-error" role="alert">{error}</p>}
          {aviso && <p className="acceso-aviso" role="status">{aviso}</p>}
          <Button type="submit" variant="cta" disabled={!configurado || ocupado}>
            {ocupado ? 'Espera…' : titulo}
          </Button>
        </form>
        <p className="acceso-cambio">
          {modo === 'entrar' ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button type="button" onClick={() => cambiarModo(modo === 'entrar' ? 'crear' : 'entrar')}>
            {modo === 'entrar' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </p>
        <p><Link to="/prestadores">Volver a Soy prestador</Link></p>
      </section>
    </div>
  )
}
