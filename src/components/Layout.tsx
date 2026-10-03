import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from './ui'
import type { TabBarItem } from './ui'
import { Logo } from './Logo'
import { Cargando } from './Cargando'
import { config } from '../config'

const NAV: TabBarItem[] = [
  { id: 'itinerario', label: 'Itinerario', icon: 'itinerario' },
  { id: 'lugares', label: 'Lugares', icon: 'naturaleza' },
  { id: 'mapa', label: 'Mapa', icon: 'mapa' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
]
const base = import.meta.env.BASE_URL

export function Layout() {
  const { pathname } = useLocation()
  const go = useNavigate()
  const seg = pathname.split('/')[1] ?? ''
  return (
    <div className="shell">
      <button type="button" className="skip" onClick={() => document.getElementById('contenido')?.focus()}>Saltar al contenido</button>

      <header className="appbar">
        <div className="wrap appbar-in">
          <Link to="/" className="appbar-logo" aria-label="Valle Directo, inicio"><Logo size={40} /></Link>
          <nav className="topnav" aria-label="Principal">
            {NAV.map((n) => <NavLink key={n.id} to={`/${n.id}`}>{n.label}</NavLink>)}
            <NavLink to="/prestadores">Soy prestador</NavLink>
          </nav>
          <Link to="/prestadores" className="appbar-prest">Soy prestador</Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1}>
        <div key={pathname} className="ruta-entra"><Suspense fallback={<Cargando />}><Outlet /></Suspense></div>
      </main>

      <footer className="footer">
        <div className="wrap footer-in">
          <img src={`${base}logos/vd-horizontal-fondo-oscuro.svg`} alt="Valle Directo, Valle de Tenza" height={44} />
          <dl className="footer-datos">
            <div><dt>Contacto</dt><dd>{config.contacto}</dd></div>
            <div><dt>Horario de embajadores</dt><dd>{config.horario}</dd></div>
            <div><dt>Redes</dt><dd>{config.redes}</dd></div>
          </dl>
          <p className="footer-nota">Hecho en el Valle de Tenza, Boyacá.</p>
        </div>
      </footer>

      <div className="tabbar-fixed">
        <TabBar items={NAV} value={NAV.some((n) => n.id === seg) ? seg : ''} onChange={(id) => go(`/${id}`)} />
      </div>
    </div>
  )
}
