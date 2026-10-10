import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Montanas } from '../components/Montanas'
import { Button, Option, TextField } from '../components/ui'
import { config } from '../config'
import { supabase } from '../supabase'
import { usePagina } from '../usePagina'

const BENEFICIOS = [
  ['Red de integración', 'Conecta y comunica a empresas, prestadores y emprendimientos locales.'],
  ['Disponibilidad real', 'Cada negocio mantiene su propia disponibilidad al día, organizada por municipio y vereda.'],
  ['Cadena de suministro', 'Intercambio de insumos y economía circular entre los negocios de la región.'],
]

export default function Prestadores() {
  usePagina('Para prestadores y emprendedores')

  const [session, setSession] = useState<Session | null>(null)
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [negocio, setNegocio] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const enviar = async () => {
    setError(''); setAviso(''); setCargando(true)
    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
      if (error) setError('Correo o contraseña incorrectos.')
    } else {
      if (!negocio.trim()) { setError('Escribe el nombre de tu negocio.'); setCargando(false); return }
      if (clave.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); setCargando(false); return }
      const { error } = await supabase.auth.signUp({
        email,
        password: clave,
        options: { data: { negocio: negocio.trim(), rol: 'prestador' } },
      })
      if (error) setError(error.message)
      else setAviso('Cuenta creada. Revisa tu correo para confirmarla.')
    }
    setCargando(false)
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Para prestadores y emprendedores</h1>
      <p className="sub">Una red que conecta hospedajes, guías, artesanos y gastronomía de todo el Valle de Tenza, sin intermediarios externos.</p>
      <div className="prest-grid">
        <dl className="beneficios">
          {BENEFICIOS.map(([t, d], i) => <div key={t} className="aparece" style={{ '--i': i } as CSSProperties}><dt className="t-h3">{t}</dt><dd>{d}</dd></div>)}
        </dl>

        <aside className="panel prest-aside">
          <Montanas variante="cultura" className="prest-arte" />

          {session ? (
            <div>
              <p className="t-h3">Hola, {session.user.user_metadata?.negocio ?? session.user.email}</p>
              <p className="sub">Pronto podrás administrar tu negocio desde aquí.</p>
              <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
            </div>
          ) : (
            <div>
              <div className="opts" role="group" aria-label="Acceso de prestadores">
                <Option selected={modo === 'login'} onClick={() => { setModo('login'); setError(''); setAviso('') }}>Iniciar sesión</Option>
                <Option selected={modo === 'registro'} onClick={() => { setModo('registro'); setError(''); setAviso('') }}>Crear cuenta de prestador</Option>
              </div>

              {modo === 'registro' && (
                <TextField label="Nombre del negocio" value={negocio} onChange={(e) => setNegocio(e.target.value)} />
              )}
              <TextField label="Correo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField
                label="Contraseña"
                type="password"
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                error={error || undefined}
                hint={aviso || (modo === 'registro' ? 'Mínimo 8 caracteres' : undefined)}
              />
              <Button variant="cta" block onClick={enviar} disabled={cargando}>
                {modo === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Button>
            </div>
          )}

          <p className="contacto-prest">¿Dudas? Escríbenos a <strong>{config.contacto}</strong>.</p>
        </aside>
      </div>
    </div>
  )
}
