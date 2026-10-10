import type { CSSProperties } from 'react'
import { Montanas } from '../components/Montanas'
import { LinkButton } from '../components/LinkButton'
import { useUsuario } from '../state/demo'
import { config } from '../config'
import '../styles/prestador.css'
import { usePagina } from '../usePagina'

const BENEFICIOS = [
  ['Red de integración', 'Conecta y comunica a empresas, prestadores y emprendimientos locales.'],
  ['Disponibilidad real', 'Cada negocio mantiene su propia disponibilidad al día, organizada por municipio y vereda.'],
  ['Cadena de suministro', 'Intercambio de insumos y economía circular entre los negocios de la región.'],
]

export default function Prestadores() {
  usePagina('Para prestadores y emprendedores')
  const usuario = useUsuario()
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
          <p className="contacto-prest">¿Quieres hacer parte? Escríbenos a <strong>{config.contacto}</strong>.</p>
        </aside>
      </div>
      <p className="sub">Recibe solicitudes de reserva con cuatro módulos: restaurante, caminata, actividad y hotel.</p>
      <div className="acciones-fila">
        {usuario
          ? <LinkButton to="/prestadores/panel" variant="cta">Ir a mi panel</LinkButton>
          : <><LinkButton to="/prestadores/entrar" variant="cta">Crear mi cuenta</LinkButton><LinkButton to="/prestadores/entrar" variant="secondary">Entrar</LinkButton></>}
      </div>
    </div>
  )
}
