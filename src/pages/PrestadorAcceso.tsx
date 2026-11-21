import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { traducirErrorAuth } from '../lib/enlaceAuth'
import { supabase } from '../lib/supabase'
import { useEnfriamiento } from '../lib/useEnfriamiento'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

type Modo = 'entrar' | 'crear' | 'recuperar'

const TITULOS: Record<Modo, string> = { entrar: 'Iniciar sesión', crear: 'Crear cuenta', recuperar: 'Recuperar contraseña' }
const NEUTRO_RECUPERAR = 'Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva.'

export default function PrestadorAcceso() {
  usePagina('Iniciar sesión')
  const { configurado, usuario } = useSesion()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [modo, setModo] = useState<Modo>(params.get('recuperar') === '1' ? 'recuperar' : params.get('alta') === '1' ? 'crear' : 'entrar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Correo al que se envió la confirmación o al que hay que reenviarla (cuenta sin confirmar).
  const [pendiente, setPendiente] = useState('')
  const { restan, iniciar } = useEnfriamiento()
  const titulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (usuario) nav('/prestadores/panel', { replace: true })
  }, [usuario, nav])

  useEffect(() => { titulo.current?.focus() }, [modo])

  function cambiarModo(siguiente: Modo) {
    setModo(siguiente)
    setError('')
    setAviso('')
    setPendiente('')
  }

  async function reenviar(destino: string) {
    if (!supabase || restan > 0) return
    setError('')
    setOcupado(true)
    try {
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: destino,
        options: { emailRedirectTo: `${window.location.origin}/#/prestadores/confirmar` },
      })
      if (err) { setError(traducirErrorAuth(err.message, err.status)); return }
      setAviso(`Te enviamos otro correo a ${destino}.`)
      iniciar()
    } finally {
      setOcupado(false)
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    setAviso('')
    setPendiente('')
    setOcupado(true)
    const email = correo.trim()
    try {
      if (modo === 'crear') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password: clave,
          options: { emailRedirectTo: `${window.location.origin}/#/prestadores/confirmar` },
        })
        if (err) { setError(traducirErrorAuth(err.message, err.status)); return }
        if (data.session && data.user && nombre.trim()) {
          await supabase.from('profiles').update({ name: nombre.trim() }).eq('id', data.user.id)
        }
        if (!data.session) {
          setPendiente(email)
          iniciar()
          setClave('')
          return
        }
        nav('/prestadores/panel')
      } else if (modo === 'recuperar') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/#/prestadores/clave-nueva`,
        })
        // Solo el límite de envíos se dice tal cual; cualquier otro resultado es neutral para no revelar cuentas.
        if (err && (err.status === 429 || /rate limit|security purposes/i.test(err.message))) {
          setError(traducirErrorAuth(err.message, err.status))
          return
        }
        setAviso(NEUTRO_RECUPERAR)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password: clave })
        if (err) {
          if (err.message.toLowerCase().includes('email not confirmed')) setPendiente(email)
          setError(traducirErrorAuth(err.message, err.status))
          return
        }
        setClave('')
        nav('/prestadores/panel')
      }
    } finally {
      setOcupado(false)
    }
  }

  const titularPagina = TITULOS[modo]
  const textoBoton = modo === 'recuperar' ? 'Enviar enlace' : titularPagina
  const reenvio = (
    <Button variant="secondary" disabled={!configurado || ocupado || restan > 0} onClick={() => void reenviar(pendiente)}>
      {restan > 0 ? `Reenviar correo (${restan} s)` : 'Reenviar correo'}
    </Button>
  )
  return (
    <div className="wrap acceso">
      <section className="acceso-card" aria-busy={ocupado}>
        <p className="overline">Prestadores</p>
        <h1 id="titulo" ref={titulo} tabIndex={-1} className="t-h1">{titularPagina}</h1>
        <p className="sub">
          {modo === 'crear' && 'La cuenta es para publicar tu negocio. Quien viaja no la necesita.'}
          {modo === 'entrar' && 'Entra para ver tu panel, tus borradores y lo que ya publicaste.'}
          {modo === 'recuperar' && 'Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.'}
        </p>
        {modo !== 'recuperar' && (
          <div className="opts acceso-modos" role="group" aria-label="Elegir entre entrar y crear cuenta">
            <button type="button" className="vd-opt" aria-pressed={modo === 'entrar'} onClick={() => cambiarModo('entrar')}>Iniciar sesión</button>
            <button type="button" className="vd-opt" aria-pressed={modo === 'crear'} onClick={() => cambiarModo('crear')}>Crear cuenta</button>
          </div>
        )}
        {!configurado && (
          <p className="acceso-aviso" role="status">
            Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en este build. El formulario espera esas claves publicables y no guarda una sesión en el navegador.
          </p>
        )}
        {modo === 'crear' && pendiente ? (
          <div className="acceso-form">
            <p className="acceso-aviso" role="status">
              Te enviamos un correo a {pendiente}. Abre el enlace para confirmar tu cuenta.
            </p>
            {error && <p className="acceso-error" role="alert">{error}</p>}
            <div role="status">{aviso && <p className="acceso-aviso">{aviso}</p>}</div>
            {reenvio}
          </div>
        ) : (
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
            {modo !== 'recuperar' && (
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
            )}
            {error && <p className="acceso-error" role="alert">{error}</p>}
            <div role="status">{aviso && <p className="acceso-aviso">{aviso}</p>}</div>
            {modo === 'entrar' && pendiente && reenvio}
            <Button type="submit" variant="cta" disabled={!configurado || ocupado}>
              {ocupado ? 'Espera…' : textoBoton}
            </Button>
            {modo === 'entrar' && (
              <button type="button" className="acceso-enlace" onClick={() => cambiarModo('recuperar')}>¿Olvidaste tu contraseña?</button>
            )}
          </form>
        )}
        <p className="acceso-cambio">
          {modo === 'recuperar' ? '¿Ya la recordaste? ' : modo === 'entrar' ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button type="button" onClick={() => cambiarModo(modo === 'entrar' ? 'crear' : 'entrar')}>
            {modo === 'entrar' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </p>
        <p><Link to="/prestadores">Volver a Soy prestador</Link></p>
      </section>
    </div>
  )
}
