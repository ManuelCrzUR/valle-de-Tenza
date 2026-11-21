import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { traducirErrorAuth } from '../lib/enlaceAuth'
import { supabase } from '../lib/supabase'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

export default function ClaveNueva() {
  usePagina('Contraseña nueva')
  const { listo, usuario } = useSesion()
  const nav = useNavigate()
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const vencido = listo && !usuario && !hecho

  useEffect(() => { titulo.current?.focus() }, [vencido, hecho])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    if (clave.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (clave !== repetida) { setError('Las contraseñas no coinciden.'); return }
    setOcupado(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: clave })
      if (err) { setError(traducirErrorAuth(err.message, err.status)); return }
      setClave('')
      setRepetida('')
      setHecho(true)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="wrap acceso">
      <section className="acceso-card" aria-busy={!listo || ocupado}>
        <p className="overline">Prestadores</p>
        {!listo && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Contraseña nueva</h1>
            <p className="sub" role="status">Revisando tu enlace…</p>
          </>
        )}
        {vencido && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">El enlace venció</h1>
            <p className="sub">Para crear una contraseña nueva necesitas un enlace vigente. Pide otro y ábrelo desde tu correo.</p>
            <Button variant="cta" onClick={() => nav('/prestadores/entrar?recuperar=1')}>Pedir otro enlace</Button>
          </>
        )}
        {listo && usuario && !hecho && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Crea tu contraseña nueva</h1>
            <p className="sub">Elige una contraseña de al menos 8 caracteres.</p>
            <form className="acceso-form" onSubmit={(ev) => void enviar(ev)}>
              <TextField
                label="Contraseña nueva"
                type="password"
                value={clave}
                onChange={(ev) => setClave(ev.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={ocupado}
              />
              <TextField
                label="Repite la contraseña"
                type="password"
                value={repetida}
                onChange={(ev) => setRepetida(ev.target.value)}
                autoComplete="new-password"
                enterKeyHint="go"
                required
                minLength={8}
                disabled={ocupado}
              />
              {error && <p className="acceso-error" role="alert">{error}</p>}
              <Button type="submit" variant="cta" disabled={ocupado}>{ocupado ? 'Espera…' : 'Guardar contraseña'}</Button>
            </form>
          </>
        )}
        {hecho && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Contraseña actualizada</h1>
            <p className="acceso-aviso" role="status">Listo. Desde ahora entras con tu contraseña nueva.</p>
            <Button variant="cta" onClick={() => nav('/prestadores/panel')}>Ir a mi panel</Button>
          </>
        )}
        <p><Link to="/prestadores/entrar">Volver a iniciar sesión</Link></p>
      </section>
    </div>
  )
}
