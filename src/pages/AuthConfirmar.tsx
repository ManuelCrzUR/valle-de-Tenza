import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { Icon } from '../components/Icon'
import { traducirErrorAuth } from '../lib/enlaceAuth'
import { supabase } from '../lib/supabase'
import { useEnfriamiento } from '../lib/useEnfriamiento'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'

type Estado = 'verificando' | 'ok' | 'error' | 'sin-token'

const TIPOS: EmailOtpType[] = ['signup', 'recovery', 'email_change', 'invite', 'magiclink', 'email']

export default function AuthConfirmar() {
  usePagina('Confirmar correo')
  const nav = useNavigate()
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash') ?? ''
  const tipoParam = params.get('type') ?? ''
  const estadoParam = params.get('estado')
  const tipo = TIPOS.find((t) => t === tipoParam)
  const [estado, setEstado] = useState<Estado>(() => {
    if (estadoParam === 'ok') return 'ok'
    if (estadoParam === 'error') return 'error'
    return tokenHash && tipo ? 'verificando' : 'sin-token'
  })
  const consumido = useRef(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const [correo, setCorreo] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const { restan, iniciar } = useEnfriamiento()

  useEffect(() => {
    if (estado !== 'verificando' || consumido.current) return
    consumido.current = true
    if (!supabase || !tipo) { setEstado('error'); return }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo }).then(({ error: err }) => {
      if (err) { setEstado('error'); return }
      if (tipo === 'recovery') nav('/prestadores/clave-nueva', { replace: true })
      else setEstado('ok')
    }).catch(() => setEstado('error'))
  }, [estado, tipo, tokenHash, nav])

  useEffect(() => { titulo.current?.focus() }, [estado])

  const esRecuperacion = tipo === 'recovery' || tipoParam === 'recovery'

  async function reenviar(e: FormEvent) {
    e.preventDefault()
    if (!supabase || restan > 0) return
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: correo.trim(),
        options: { emailRedirectTo: `${window.location.origin}/#/prestadores/confirmar` },
      })
      if (err) { setError(traducirErrorAuth(err.message, err.status)); return }
      setAviso('Si ese correo está pendiente de confirmar, te enviamos un enlace nuevo.')
      iniciar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="wrap acceso">
      <section className="acceso-card" aria-busy={estado === 'verificando'}>
        <p className="overline">Prestadores</p>
        {estado === 'verificando' && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Verificando tu enlace…</h1>
            <p className="sub" role="status">Un momento, estamos confirmando tu correo.</p>
          </>
        )}
        {estado === 'ok' && (
          <>
            <div className="confirmar-icono" aria-hidden="true"><Icon name="cupo-verificado" size={40} /></div>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Confirmamos tu correo</h1>
            <p className="sub" role="status">Tu cuenta quedó lista. Ya puedes entrar a tu panel y publicar tu negocio.</p>
            <Button variant="cta" onClick={() => nav('/prestadores/panel')}>Ir a mi panel</Button>
          </>
        )}
        {estado === 'error' && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Este enlace venció o ya se usó</h1>
            {esRecuperacion ? (
              <>
                <p className="sub">Para cambiar tu contraseña pide un enlace nuevo.</p>
                <Button variant="cta" onClick={() => nav('/prestadores/entrar?recuperar=1')}>Pedir otro enlace</Button>
              </>
            ) : (
              <>
                <p className="sub">Si ya confirmaste tu correo, entra con tu contraseña. Si no, pide otro correo de confirmación.</p>
                <form className="acceso-form" onSubmit={(ev) => void reenviar(ev)}>
                  <TextField
                    label="Correo"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={correo}
                    onChange={(ev) => setCorreo(ev.target.value)}
                    autoComplete="email"
                    required
                    disabled={ocupado}
                  />
                  {error && <p className="acceso-error" role="alert">{error}</p>}
                  <p className="acceso-aviso" role="status" hidden={!aviso}>{aviso}</p>
                  <Button type="submit" variant="cta" disabled={ocupado || restan > 0 || !supabase}>
                    {restan > 0 ? `Reenviar correo (${restan} s)` : 'Reenviar correo'}
                  </Button>
                </form>
              </>
            )}
            <p><Link to="/prestadores/entrar">Iniciar sesión</Link></p>
          </>
        )}
        {estado === 'sin-token' && (
          <>
            <h1 ref={titulo} tabIndex={-1} className="t-h1">Falta el enlace de confirmación</h1>
            <p className="sub">Abre el enlace que te enviamos por correo. Si no lo encuentras, inicia sesión y pide otro.</p>
            <Link className="vd-btn vd-btn-cta" to="/prestadores/entrar">Iniciar sesión</Link>
          </>
        )}
      </section>
    </div>
  )
}
