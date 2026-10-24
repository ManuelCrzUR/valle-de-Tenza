import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from './ui'
import type { TabBarItem } from './ui'
import { Logo } from './Logo'
import { Cargando } from './Cargando'
import { AvisoVersion } from './AvisoVersion'
import { EstadoConexion } from './EstadoConexion'
import { useAjustes } from '../state/ajustes'
import { useUsuario } from '../state/reservas'

const NAV: TabBarItem[] = [
  { id: 'itinerario', label: 'Itinerario', icon: 'itinerario' },
  { id: 'lugares', label: 'Lugares', icon: 'naturaleza' },
  { id: 'mapa', label: 'Mapa', icon: 'mapa' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
]
const base = import.meta.env.BASE_URL

export function Layout() {
  const ajustes = useAjustes()
  const { pathname } = useLocation()
  const go = useNavigate()
  const usuario = useUsuario()
  const prest = usuario ? { to: '/prestadores/panel', texto: 'Mi panel' } : { to: '/prestadores', texto: 'Soy prestador' }
  const seg = pathname.split('/')[1] ?? ''
  return (
    <div className="shell">
      <button type="button" className="skip" onClick={() => document.getElementById('contenido')?.focus()}>Saltar al contenido</button>

      <header className="appbar">
        <div className="wrap appbar-in">
          <Link to="/" className="appbar-logo" aria-label="Valle Directo, inicio"><Logo size={40} /></Link>
          <nav className="topnav" aria-label="Principal">
            {NAV.map((n) => <NavLink key={n.id} to={`/${n.id}`}>{n.label}</NavLink>)}
            <NavLink to="/como-llegar">Cómo llegar</NavLink>
            <NavLink to="/galeria">Galería</NavLink>
          </nav>
        </div>
      </header>
      <EstadoConexion />
      <AvisoVersion />

      <main id="contenido" tabIndex={-1}>
        <div key={pathname} className="ruta-entra"><Suspense fallback={<Cargando />}><Outlet /></Suspense></div>
      </main>

      <footer className="footer">
        <div className="wrap footer-in">
          <img src={`${base}logos/vd-horizontal-fondo-oscuro.svg`} alt="Valle Directo, Valle de Tenza" height={44} />
          <dl className="footer-datos">
            {ajustes.contacto && <div><dt>Contacto</dt><dd>{ajustes.contacto}</dd></div>}
            {ajustes.horario && <div><dt>Horario de embajadores</dt><dd>{ajustes.horario}</dd></div>}
            {ajustes.redes.length > 0 && (
              <div><dt>Redes</dt><dd>{ajustes.redes.map((r, i) => (
                <span key={r.nombre}>{i > 0 && ' · '}{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.nombre}</a> : r.nombre}</span>
              ))}</dd></div>
            )}
          </dl>
          <nav className="footer-nav" aria-label="Pie de página">
            <Link to={prest.to}>{prest.texto}</Link>
            <Link to="/privacidad">Privacidad</Link>
          </nav>
          <p className="footer-nota">Hecho en el Valle de Tenza, Boyacá.</p>
        </div>
      </footer>

      <div className="tabbar-fixed">
        <TabBar items={NAV} value={NAV.some((n) => n.id === seg) ? seg : ''} onChange={(id) => go(`/${id}`)} />
      </div>
    </div>
  )
}
