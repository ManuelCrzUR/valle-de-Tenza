import { Link } from 'react-router-dom'
import { Option, PlaceCard, Button } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Montanas } from '../components/Montanas'
import { PLANES } from '../data/planes'
import { CATEGORIA_POR_ID, MUNICIPIOS, NOMBRE_MUNICIPIO, tipoReserva } from '../data/lugares'
import type { Lugar } from '../data/lugares'
import { useItinerario } from '../state/itinerario'
import { cupoLibre, hoy, negocioDeLugar, useDemo } from '../state/demo'
import { config } from '../config'
import { Icon } from '../components/Icon'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'

const sitio = (l: Lugar) => `${CATEGORIA_POR_ID[l.categoria]?.singular ?? l.categoria} · ${NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}`

function Acciones({ l, cta }: { l: Lugar; cta?: boolean }) {
  return (
    <div className="it-acciones">
      {tipoReserva(l) && <LinkButton to={`/reservar/${l.id}`} variant={cta ? 'cta' : 'secondary'}>Reservar</LinkButton>}
      <Link className="it-enlace" to={`/lugares/${l.id}`}>Ver detalle</Link>
    </div>
  )
}

export default function Itinerario() {
  usePagina('Tu itinerario')
  const { itinerario, eleccion, elegir, setMunicipio, otro } = useItinerario()
  const demo = useDemo()
  const plan = itinerario?.plan
  const hosp = itinerario?.hospedaje

  let chip = 'Cupo por confirmar'
  let tone: 'strong' | 'soft' = 'soft'
  let icono: 'cupo-verificado' | undefined
  if (hosp) {
    const n = negocioDeLugar(demo.negocios, hosp.id)
    if (n) {
      if (cupoLibre(demo, n, hoy()) > 0) { chip = 'Cupo disponible'; tone = 'strong'; icono = 'cupo-verificado' } else chip = 'Sin cupo hoy'
    }
  }

  return (
    <div className="wrap pagina pagina-split">
      <div className="split-lado">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Tu itinerario a la medida</h1>
        <p className="sub">Elige tu plan y generamos el itinerario, sin buscar en catálogos.</p>
        <div className="opts opts-col" role="group" aria-label="Plan">
          {PLANES.map((p) => (
            <Option key={p.id} icon={p.icono} selected={plan?.id === p.id} onClick={() => elegir(p.id)}>{p.opcion}</Option>
          ))}
        </div>
        {eleccion && (
          <div className="it-controles">
            <label htmlFor="it-municipio">Municipio base</label>
            <select id="it-municipio" className="vd-input" value={eleccion.municipio} onChange={(e) => setMunicipio(e.target.value)}>
              <option value="">El mejor para este plan</option>
              {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
            </select>
            <Button variant="secondary" onClick={otro}>Generar otro</Button>
          </div>
        )}
      </div>

      <div className="split-main" aria-live="polite">
        {itinerario && plan ? (
          <section key={`${plan.id}-${eleccion?.semilla}-${eleccion?.municipio}`} className="panel resultado" aria-label={plan.titulo}>
            <h2 className="t-h2">{plan.titulo}</h2>
            <p className="sub">Municipio base: {NOMBRE_MUNICIPIO[itinerario.municipio] ?? itinerario.municipio} · {plan.duracion}</p>
            {!hosp && !itinerario.paradas.length && <p className="it-aviso">No encontramos lugares con ubicación para este plan. Prueba con otro municipio o plan.</p>}
            <div className="resultado-grid">
              <div className="it-bloque">
                <h3 className="t-h3">Dónde dormir</h3>
                {hosp ? (
                  <PlaceCard chip={chip} chipTone={tone} chipIcon={icono} title={hosp.nombre}
                    description={hosp.extra?.descripcion} meta={sitio(hosp)}>
                    <Acciones l={hosp} cta />
                  </PlaceCard>
                ) : <p className="it-aviso">No encontramos alojamiento registrado cerca de esta ruta.</p>}
                {itinerario.comida && (
                  <>
                    <h3 className="t-h3">Dónde comer</h3>
                    <PlaceCard title={itinerario.comida.nombre} description={itinerario.comida.extra?.descripcion} meta={sitio(itinerario.comida)}>
                      <Acciones l={itinerario.comida} />
                    </PlaceCard>
                  </>
                )}
              </div>
              <div>
                <h3 className="t-h3">Ruta sugerida</h3>
                {itinerario.paradas.length ? (
                  <ol className="it-ruta-lista ruta" style={{ listStyle: 'none' }}>
                    {itinerario.paradas.map((x) => (
                      <li key={x.id}>
                        <span>{x.nombre}</span><small>{sitio(x)}</small>
                        <Acciones l={x} />
                      </li>
                    ))}
                  </ol>
                ) : <p className="it-aviso">No hay paradas disponibles para este plan en el municipio elegido.</p>}
              </div>
            </div>
            <p className="embajador"><Icon name="embajador" size={24} />
              <span><strong>Tu embajador.</strong> Red de confianza del Valle de Tenza en {config.ciudadEmbajadores}.</span></p>
            <div className="it-pie">
              <LinkButton to="/mapa?vista=ruta" variant="cta" icon="mapa">Ver mi ruta en el mapa</LinkButton>
              <LinkButton to="/reservas" variant="secondary">Mis reservas</LinkButton>
            </div>
          </section>
        ) : (
          <div className="panel vacio-panel">
            <Montanas className="vacio-arte" />
            <p>Toca una opción y aquí aparece tu hospedaje y tu ruta.</p>
          </div>
        )}
      </div>
    </div>
  )
}
