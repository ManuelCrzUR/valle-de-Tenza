import { Link } from 'react-router-dom'
import { Option, PlaceCard, Button } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Foto } from '../components/Foto'
import { PLANES } from '../data/planes'
import { CATEGORIA_POR_ID, MUNICIPIOS, NOMBRE_MUNICIPIO, tipoReserva } from '../data/lugares'
import type { Lugar } from '../data/lugares'
import { useItinerario } from '../state/itinerario'
import { MAX_SALTO_M, DIAS_MAX, distanciasRuta, km, ordenRuta } from '../data/generarPlan'
import { cupoLibre, hoy, negocioDeLugar, useDemo } from '../state/demo'
import { config } from '../config'
import { Icon } from '../components/Icon'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'

const sitio = (l: Lugar) => `${CATEGORIA_POR_ID[l.categoria]?.singular ?? l.categoria} · ${NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}`

function Distancia({ m }: { m?: number }) {
  if (m === undefined) return null
  const lejos = m > MAX_SALTO_M
  return <p className={`it-dist${lejos ? ' it-dist-lejos' : ''}`}>{lejos && <strong>Queda lejos: </strong>}a {km(m)} de la parada anterior</p>
}

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
  const { itinerario, eleccion, elegir, setMunicipio, setDias, otro } = useItinerario()
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

  const pasos = itinerario ? ordenRuta(itinerario) : []
  const dist = distanciasRuta(pasos)
  const medidas = dist.filter((d): d is number => d !== undefined)
  const total = medidas.length ? medidas.reduce((a, b) => a + b, 0) : undefined
  const diasSel = eleccion?.dias ?? 2

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
            <div role="group" aria-label="Días" className="it-dias">
              {Array.from({ length: DIAS_MAX }, (_, i) => i + 1).map((n) => (
                <Option key={n} selected={diasSel === n} onClick={() => setDias(n)}>{n} {n === 1 ? 'día' : 'días'}</Option>
              ))}
            </div>
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
          <section key={`${plan.id}-${eleccion?.semilla}-${eleccion?.municipio}-${eleccion?.dias}`} className="panel resultado" aria-label={plan.titulo}>
            <h2 className="t-h2">{plan.titulo}</h2>
            <p className="sub">
              Centrada en {NOMBRE_MUNICIPIO[itinerario.municipio] ?? itinerario.municipio} · {itinerario.dias.length} {itinerario.dias.length === 1 ? 'día' : 'días'}
              {total !== undefined && ` · ~${km(total)} en total`}
            </p>
            {eleccion?.ruta && <p className="it-aviso" role="status">Esta ruta la armó el asistente del chat. Si cambias el plan, el municipio o los días, la reemplazamos por una nueva.</p>}
            {itinerario.avisos.length > 0 && (
              <div className="it-aviso it-avisos" role="status">
                <ul>{itinerario.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            {!pasos.length && <p className="it-aviso">No encontramos lugares con ubicación para este plan. Prueba con otro municipio o plan.</p>}
            {itinerario.dias.map((d) => (
              <div key={d.n} className="it-dia">
                <h3 className="t-h3">Día {d.n}</h3>
                <ol className="it-ruta-lista ruta" style={{ listStyle: 'none' }}>
                  {pasos.map((p, i) => p.dia === d.n && (
                    <li key={`${p.rol}-${p.lugar.id}`} className="it-paso">
                      {p.rol === 'parada' && (
                        <>
                          <span>{p.lugar.nombre}</span><small>{sitio(p.lugar)}</small>
                          <Distancia m={dist[i]} />
                          <Acciones l={p.lugar} />
                        </>
                      )}
                      {p.rol === 'comida' && (
                        <>
                          <h4 className="it-rol">Dónde comer</h4>
                          <Distancia m={dist[i]} />
                          <PlaceCard title={p.lugar.nombre} description={p.lugar.extra?.descripcion} meta={sitio(p.lugar)}>
                            <Acciones l={p.lugar} />
                          </PlaceCard>
                        </>
                      )}
                      {p.rol === 'hospedaje' && (
                        <>
                          <h4 className="it-rol">Dónde dormir</h4>
                          <Distancia m={dist[i]} />
                          <PlaceCard chip={chip} chipTone={tone} chipIcon={icono} title={p.lugar.nombre}
                            description={p.lugar.extra?.descripcion} meta={sitio(p.lugar)}>
                            <Acciones l={p.lugar} cta />
                          </PlaceCard>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                {!d.paradas.length && !d.comida && <p className="it-aviso">No hay paradas disponibles para este día.</p>}
              </div>
            ))}
            {!hosp && pasos.length > 0 && <p className="it-aviso">No encontramos alojamiento registrado cerca de esta ruta.</p>}
            <p className="embajador"><Icon name="embajador" size={24} />
              <span><strong>Tu embajador.</strong> Red de confianza del Valle de Tenza en {config.ciudadEmbajadores}.</span></p>
            <div className="it-pie">
              <LinkButton to="/mapa?vista=ruta" variant="cta" icon="mapa">Ver mi ruta en el mapa</LinkButton>
              <LinkButton to="/reservas" variant="secondary">Mis reservas</LinkButton>
            </div>
          </section>
        ) : (
          <div className="panel vacio-panel">
            <Foto n={13} className="vacio-arte" />
            <p>Toca una opción y aquí aparece tu hospedaje y tu ruta.</p>
          </div>
        )}
      </div>
    </div>
  )
}
