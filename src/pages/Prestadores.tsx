import { Link } from 'react-router-dom'
import { LinkButton } from '../components/LinkButton'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

export default function Prestadores() {
  usePagina('Prestadores')
  const { configurado, usuario } = useSesion()
  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Tengo un negocio en el Valle</h1>
      <p className="sub">Publica el lugar para que pueda verse en el mapa y entrar en un plan. Quien viaja sigue sin cuenta. Publicar no confirma cupo ni reserva.</p>
      {!configurado && (
        <p className="prestador-aviso" role="status">
          El panel necesita <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en el build del navegador. Son la clave publicable, no la service role. Sin ellas no hay registro ni sesión, y no guardo una cuenta en este navegador.
        </p>
      )}
      <div className="prestador-acciones">
        {configurado && !usuario && <LinkButton to="/prestadores/entrar" variant="cta">Entrar o crear cuenta</LinkButton>}
        {usuario && <LinkButton to="/prestadores/panel" variant="cta">Ir a mi panel</LinkButton>}
        <Link to="/">Volver al inicio</Link>
      </div>
    </div>
  )
}
