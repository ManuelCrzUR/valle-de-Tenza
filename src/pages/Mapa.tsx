import { Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Option } from '../components/ui'
import { RouteMap } from '../components/RouteMap'
import { LinkButton } from '../components/LinkButton'
import { Cargando } from '../components/Cargando'
import { useItinerario } from '../state/itinerario'
import { usePagina } from '../usePagina'

// Leaflet pesa bastante: solo se descarga al abrir la vista de lugares.
const MapaLugares = lazy(() => import('../components/mapa/MapaLugares'))

function MiRuta() {
  const { plan } = useItinerario()
  if (!plan) {
    return (
      <div className="vacio vacio-col">
        <p>Aún no tienes una ruta. Genera tu itinerario y aquí verás sus puntos en orden.</p>
        <LinkButton to="/itinerario" variant="cta" icon="itinerario">Armar mi itinerario</LinkButton>
      </div>
    )
  }
  return (
    <div className="mapa-grid">
      <RouteMap paradas={plan.paradas} />
      <div>
        <h2 className="t-h3">{plan.titulo}</h2>
        <ol className="stops">{plan.paradas.map((x) => <li key={x.id}>{x.nombre}</li>)}</ol>
        <p className="sub">Duermes en {plan.hospedaje.nombre}.</p>
        <LinkButton to="/itinerario" variant="secondary">Cambiar de plan</LinkButton>
      </div>
    </div>
  )
}

export default function Mapa() {
  usePagina('Tu mapa')
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'ruta' ? 'ruta' : 'lugares'
  const ir = (v: 'lugares' | 'ruta') => setParams(v === 'ruta' ? { vista: 'ruta' } : {}, { replace: true })
  return (
    <div className={`wrap pagina${vista === 'lugares' ? ' pagina-mapa' : ''}`}>
      <h1 id="titulo" tabIndex={-1} className="t-h1">Tu mapa</h1>
      <p className="sub">
        {vista === 'lugares' ? 'Lugares reales de los siete municipios: dónde comer, dormir, qué visitar y servicios útiles.' : 'Muestra solo la ruta de tu itinerario ya generado. No es un buscador libre.'}
      </p>
      <div className="opts" role="group" aria-label="Vista del mapa">
        <Option selected={vista === 'lugares'} icon="mapa" onClick={() => ir('lugares')}>Lugares del Valle</Option>
        <Option selected={vista === 'ruta'} icon="ruta" onClick={() => ir('ruta')}>Mi ruta</Option>
      </div>
      {vista === 'ruta' ? <MiRuta /> : <Suspense fallback={<Cargando />}><MapaLugares /></Suspense>}
    </div>
  )
}
