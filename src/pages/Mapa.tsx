import { RouteMap } from '../components/RouteMap'
import { LinkButton } from '../components/LinkButton'
import { useItinerario } from '../state/itinerario'
import { usePagina } from '../usePagina'

export default function Mapa() {
  usePagina('Tu mapa')
  const { plan } = useItinerario()
  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Tu mapa</h1>
      <p className="sub">Muestra solo la ruta de tu itinerario ya generado. No es un buscador libre.</p>
      {!plan ? (
        <div className="vacio vacio-col">
          <p>Aún no tienes una ruta. Genera tu itinerario y aquí verás sus puntos en orden.</p>
          <LinkButton to="/itinerario" variant="cta" icon="itinerario">Armar mi itinerario</LinkButton>
        </div>
      ) : (
        <div className="mapa-grid">
          <RouteMap paradas={plan.paradas} />
          <div>
            <h2 className="t-h3">{plan.titulo}</h2>
            <ol className="stops">{plan.paradas.map((x) => <li key={x.id}>{x.nombre}</li>)}</ol>
            <p className="sub">Duermes en {plan.hospedaje.nombre}.</p>
            <LinkButton to="/itinerario" variant="secondary">Cambiar de plan</LinkButton>
          </div>
        </div>
      )}
    </div>
  )
}
