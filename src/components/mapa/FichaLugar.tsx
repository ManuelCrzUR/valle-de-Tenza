import { ArrowLeft, ExternalLink } from 'lucide-react'
import { etiquetaSubtipo, CATEGORIA_POR_ID, esAproximado, tieneUbicacion, tipoReserva } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'
import { Chip } from '../ui'
import { LinkButton } from '../LinkButton'
import { CategoriaIcono } from './iconos'
import { DatosLugar } from './DatosLugar'

export function FichaLugar({ lugar, onVolver }: { lugar: Lugar; onVolver: () => void }) {
  const cat = CATEGORIA_POR_ID[lugar.categoria]
  const x = lugar.extra
  const osm = tieneUbicacion(lugar) ? `https://www.openstreetmap.org/?mlat=${lugar.lat}&mlon=${lugar.lon}#map=17/${lugar.lat}/${lugar.lon}` : null
  return (
    <article className="ficha" aria-label={lugar.nombre}>
      <button type="button" className="atras ficha-atras" onClick={onVolver}><ArrowLeft size={20} aria-hidden /> Volver a la lista</button>
      <div className="ficha-cab">
        <span className={`pin${lugar.esServicio ? ' pin-servicio' : ''}${esAproximado(lugar) ? ' pin-aprox' : ''}`} aria-hidden><CategoriaIcono id={lugar.categoria} size={22} /></span>
        <div>
          <h2 id="ficha-titulo" tabIndex={-1} className="t-h2">{lugar.nombre}</h2>
          <p className="ficha-sub">{cat.singular}{lugar.subtipo && lugar.categoria === 'alojamiento' ? ` · ${etiquetaSubtipo(lugar.subtipo)}` : ''}</p>
        </div>
      </div>
      {lugar.conRegistro && <Chip tone="strong">Con registro de turismo</Chip>}
      <DatosLugar lugar={lugar} />
      <div className="ficha-acciones">
        {tipoReserva(lugar) && <LinkButton to={`/reservar/${lugar.id}`} variant="cta">Reservar</LinkButton>}
        {osm && <a className="vd-btn vd-btn-secondary" href={osm} target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap <ExternalLink size={16} aria-hidden /></a>}
        {x?.web && /^https?:\/\//.test(x.web) && <a className="vd-btn vd-btn-ghost" href={x.web} target="_blank" rel="noopener noreferrer">Sitio web <ExternalLink size={16} aria-hidden /></a>}
        <LinkButton to="/chat" variant="ghost" icon="embajador">Hablar con un embajador</LinkButton>
      </div>
      <p className="ficha-fuente">Fuente: {lugar.fuentes.join(', ')}</p>
    </article>
  )
}
