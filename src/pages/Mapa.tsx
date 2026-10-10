import { Suspense, lazy, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Option } from '../components/ui'
import { NOMBRE_MUNICIPIO, tieneUbicacion, tipoReserva } from '../data/lugares'
import { LinkButton } from '../components/LinkButton'
import { Cargando } from '../components/Cargando'
import { useItinerario } from '../state/itinerario'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'

// Leaflet pesa bastante: solo se descarga al abrir la vista de lugares.
const MapaLugares = lazy(() => import('../components/mapa/MapaLugares'))

const MapaLeaflet = lazy(() => import('../components/mapa/MapaLeaflet'))

function MiRuta() {
  const { itinerario } = useItinerario()
  const [sel, setSel] = useState<string | null>(null)
  if (!itinerario) {
    return (
      <div className="vacio vacio-col">
        <p>Aún no tienes una ruta. Genera tu itinerario y aquí verás sus puntos en orden.</p>
        <LinkButton to="/itinerario" variant="cta" icon="itinerario">Armar mi itinerario</LinkButton>
      </div>
    )
  }
  const orden = [...itinerario.paradas, ...(itinerario.comida ? [itinerario.comida] : []), ...(itinerario.hospedaje ? [itinerario.hospedaje] : [])]
  const puntos = orden.filter(tieneUbicacion)
  return (
    <div className="mapa-grid">
      <div className="mapa-ruta">
        <Suspense fallback={<Cargando />}>
          <MapaLeaflet puntos={puntos} seleccionadoId={sel} onElegir={setSel} />
        </Suspense>
      </div>
      <div>
        <h2 className="t-h3">{itinerario.plan.titulo}</h2>
        {orden.length ? (
          <ol className="paradas">
            {orden.map((l, i) => (
              <li key={l.id} className={`parada${sel === l.id ? ' parada-sel' : ''}`}>
                <button type="button" className="parada-elegir" aria-pressed={sel === l.id} onClick={() => setSel(l.id)}>
                  <span className="parada-n" aria-hidden="true">{i + 1}</span>
                  <span className="parada-txt"><strong>{l.nombre}</strong><small>{NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}</small></span>
                </button>
                {tipoReserva(l) && <LinkButton to={`/reservar/${l.id}`} variant="secondary">Reservar</LinkButton>}
              </li>
            ))}
          </ol>
        ) : <p className="sub">Este itinerario no tiene lugares disponibles.</p>}
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
