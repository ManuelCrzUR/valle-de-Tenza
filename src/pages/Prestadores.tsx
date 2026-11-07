import { Link } from 'react-router-dom'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

export default function Prestadores() {
  usePagina('Soy prestador')
  const { configurado, usuario } = useSesion()
  return (
    <div className="wrap acceso">
      <section className="acceso-card">
        <p className="overline">Prestadores</p>
        <h1 id="titulo" tabIndex={-1} className="t-h1">Soy prestador</h1>
        <p className="sub">Publica tu negocio para que pueda verse en el mapa y entrar en un plan. Quien viaja sigue sin cuenta. Publicar no confirma cupo ni reserva.</p>
        {!configurado && (
          <p className="acceso-aviso" role="status">
            El panel necesita VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Son la clave publicable, no la service role. Sin ellas no hay registro ni sesión.
          </p>
        )}
        <div className="acceso-acciones">
          {usuario
            ? <Link to="/prestadores/panel" className="vd-btn vd-btn-cta">Ir a mi panel</Link>
            : <Link to="/prestadores/entrar" className="vd-btn vd-btn-cta">Iniciar sesión</Link>}
          {!usuario && <Link to="/prestadores/entrar?alta=1" className="vd-btn vd-btn-secondary">Crear cuenta</Link>}
        </div>
        <p><Link to="/">Volver al inicio</Link></p>
      </section>
    </div>
  )
}
