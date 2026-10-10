import { Fragment, Suspense, lazy, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Option } from '../components/ui'
import { NOMBRE_MUNICIPIO, tieneUbicacion, tipoReserva } from '../data/lugares'
import { LinkButton } from '../components/LinkButton'
import { Cargando } from '../components/Cargando'
import { useItinerario } from '../state/itinerario'
import { distanciasRuta, km, MAX_SALTO_M, ordenRuta } from '../data/generarPlan'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'

// Leaflet pesa bastante: solo se descarga al abrir la vista de lugares.
const MapaLugares = lazy(() => import('../components/mapa/MapaLugares'))

const MapaRuta = lazy(() => import('../components/mapa/MapaRuta'))

function MiRuta() {
  const { itinerario } = useItinerario()
  const [sel, setSel] = useState<string | null>(null)
  const [corrida, setCorrida] = useState(0)   // sube para repetir la animación del recorrido
  if (!itinerario) {
    return (
      <div className="vacio vacio-col">
        <p>Aún no tienes una ruta. Genera tu itinerario y aquí verás sus puntos en orden.</p>
        <LinkButton to="/itinerario" variant="cta" icon="itinerario">Armar mi itinerario</LinkButton>
      </div>
    )
  }
  const orden = ordenRuta(itinerario)
  const dist = distanciasRuta(orden)
  const ROL = { parada: 'Parada', comida: 'Comida', hospedaje: 'Dormir' }
  // Cada parada conserva su número de la lista; las que no tienen ubicación no se dibujan, pero no cambian la numeración.
  const puntos = orden.flatMap((p, i) => (tieneUbicacion(p.lugar) ? [{ n: i + 1, lugar: p.lugar }] : []))
  return (
    <div className="mapa-grid">
      <div className="mapa-ruta">
        <Suspense fallback={<Cargando />}>
          <MapaRuta paradas={puntos} seleccionadoId={sel} onElegir={setSel} corrida={corrida} />
        </Suspense>
        {puntos.length > 1 && <button type="button" className="vd-btn vd-btn-secondary ruta-repetir" onClick={() => setCorrida((c) => c + 1)}>Ver el recorrido otra vez</button>}
      </div>
      <div>
        <h2 className="t-h3">{itinerario.plan.titulo}</h2>
        {itinerario.avisos.length > 0 && (
          <div className="it-aviso it-avisos" role="status">
            <ul>{itinerario.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
        {orden.length ? (
          <ol className="paradas">
            {orden.map((p, i) => {
              const l = p.lugar
              const d = dist[i]
              return (
                <Fragment key={`${p.rol}-${l.id}`}>
                  {(i === 0 || orden[i - 1].dia !== p.dia) && <li className="parada-dia" aria-hidden="true">Día {p.dia}</li>}
                  <li className={`parada${sel === l.id ? ' parada-sel' : ''}`}>
                    <button type="button" className="parada-elegir" aria-pressed={sel === l.id} onClick={() => setSel(l.id)}>
                      <span className="parada-n" aria-hidden="true">{i + 1}</span>
                      <span className="parada-txt">
                        <strong>{l.nombre}</strong>
                        <small>Día {p.dia} · {ROL[p.rol]} · {NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}</small>
                        {d !== undefined && <small className={d > MAX_SALTO_M ? 'it-dist-lejos' : undefined}>{d > MAX_SALTO_M ? 'Queda lejos: ' : ''}a {km(d)} del anterior</small>}
                      </span>
                    </button>
                    {tipoReserva(l) && <LinkButton to={`/reservar/${l.id}`} variant="secondary">Reservar</LinkButton>}
                  </li>
                </Fragment>
              )
            })}
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
