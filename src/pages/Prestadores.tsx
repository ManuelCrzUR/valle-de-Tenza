import { config } from '../config'
import { usePagina } from '../usePagina'

const BENEFICIOS = [
  ['Red de integración', 'Conecta y comunica a empresas, prestadores y emprendimientos locales.'],
  ['Disponibilidad real', 'Cada negocio mantiene su propia disponibilidad al día, organizada por municipio y vereda.'],
  ['Cadena de suministro', 'Intercambio de insumos y economía circular entre los negocios de la región.'],
]

export default function Prestadores() {
  usePagina('Para prestadores y emprendedores')
  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Para prestadores y emprendedores</h1>
      <p className="sub">Una red que conecta hospedajes, guías, artesanos y gastronomía de todo el Valle de Tenza, sin intermediarios externos.</p>
      <dl className="beneficios">
        {BENEFICIOS.map(([t, d]) => <div key={t}><dt className="t-h3">{t}</dt><dd>{d}</dd></div>)}
      </dl>
      <p className="contacto-prest">¿Quieres hacer parte? Escríbenos a <strong>{config.contacto}</strong>.</p>
    </div>
  )
}
