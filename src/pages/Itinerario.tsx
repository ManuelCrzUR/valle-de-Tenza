import type { CSSProperties } from 'react'
import { Option, PlaceCard } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Montanas } from '../components/Montanas'
import { PLANES } from '../data/planes'
import { useItinerario } from '../state/itinerario'
import { config } from '../config'
import { Icon } from '../components/Icon'
import { usePagina } from '../usePagina'

export default function Itinerario() {
  usePagina('Tu itinerario')
  const { plan, elegir } = useItinerario()
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
      </div>

      <div className="split-main" aria-live="polite">
        {plan ? (
          <section key={plan.id} className="panel resultado" aria-label={plan.titulo}>
            <h2 className="t-h2">{plan.titulo}</h2>
            <div className="resultado-grid">
              <PlaceCard chip="Cupo verificado hoy" chipTone="strong" chipIcon="cupo-verificado"
                title={plan.hospedaje.nombre} description={plan.hospedaje.descripcion} meta={plan.duracion} />
              <div>
                <h3 className="t-h3">Ruta sugerida</h3>
                <ol className="ruta">
                  {plan.paradas.map((x, i) => (
                    <li key={x.id} className="aparece" style={{ '--i': i + 2 } as CSSProperties}><span>{x.nombre}</span><small>{x.detalle}</small></li>
                  ))}
                </ol>
              </div>
            </div>
            <p className="embajador"><Icon name="embajador" size={24} />
              <span><strong>Tu embajador.</strong> Red de confianza del Valle de Tenza en {config.ciudadEmbajadores}.</span></p>
            <LinkButton to="/mapa?vista=ruta" variant="cta" icon="mapa">Ver mi ruta en el mapa</LinkButton>
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
