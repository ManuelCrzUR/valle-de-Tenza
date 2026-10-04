import { ArrowLeft, ExternalLink } from 'lucide-react'
import { CATEGORIA_POR_ID, NOMBRE_MUNICIPIO, esAproximado, tieneUbicacion } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'
import { Chip } from '../ui'
import { LinkButton } from '../LinkButton'
import { CategoriaIcono } from './iconos'

const AVISO_PRECISION: Record<string, string> = {
  direccion: 'Ubicación aproximada: calculada a partir de la dirección.',
  vereda: 'Ubicación aproximada: centro de la vereda.',
  cabecera: 'Ubicación aproximada: zona urbana del municipio.',
}

export function FichaLugar({ lugar, onVolver }: { lugar: Lugar; onVolver: () => void }) {
  const cat = CATEGORIA_POR_ID[lugar.categoria]
  const x = lugar.extra
  const lugarTexto = [lugar.direccion || (lugar.vereda ? `Vereda ${lugar.vereda}` : ''), NOMBRE_MUNICIPIO[lugar.municipio]].filter(Boolean).join(' · ')
  const osm = tieneUbicacion(lugar) ? `https://www.openstreetmap.org/?mlat=${lugar.lat}&mlon=${lugar.lon}#map=17/${lugar.lat}/${lugar.lon}` : null
  return (
    <article className="ficha" aria-label={lugar.nombre}>
      <button type="button" className="atras ficha-atras" onClick={onVolver}><ArrowLeft size={20} aria-hidden /> Volver a la lista</button>
      <div className="ficha-cab">
        <span className={`pin${lugar.esServicio ? ' pin-servicio' : ''}${esAproximado(lugar) ? ' pin-aprox' : ''}`} aria-hidden><CategoriaIcono id={lugar.categoria} size={22} /></span>
        <div>
          <h2 id="ficha-titulo" tabIndex={-1} className="t-h2">{lugar.nombre}</h2>
          <p className="ficha-sub">{cat.singular}{lugar.subtipo && lugar.categoria === 'alojamiento' ? ` · ${lugar.subtipo}` : ''}</p>
        </div>
      </div>
      {lugar.conRegistro && <Chip tone="strong">Con registro de turismo</Chip>}
      <dl className="ficha-datos">
        <div><dt>Dónde</dt><dd>{lugarTexto}</dd></div>
        {x?.habitaciones ? <div><dt>Capacidad</dt><dd>{x.habitaciones} habitaciones{x.camas ? `, ${x.camas} camas` : ''}</dd></div> : x?.camas ? <div><dt>Capacidad</dt><dd>{x.camas} camas</dd></div> : null}
        {x?.horario && <div><dt>Horario</dt><dd>{x.horario}</dd></div>}
        {x?.nivel && <div><dt>Nivel de atención</dt><dd>{x.nivel}</dd></div>}
        {x?.descripcion && <div><dt>Sobre el lugar</dt><dd>{x.descripcion}</dd></div>}
      </dl>
      {!tieneUbicacion(lugar) && <p className="ficha-aviso">Este lugar aún no tiene ubicación en el mapa.</p>}
      {lugar.precision && AVISO_PRECISION[lugar.precision] && <p className="ficha-aviso">{AVISO_PRECISION[lugar.precision]}</p>}
      {lugar.categoria === 'alojamiento' && <p className="ficha-aviso">Para confirmar cupo y precios, habla con un embajador.</p>}
      <div className="ficha-acciones">
        {osm && <a className="vd-btn vd-btn-secondary" href={osm} target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap <ExternalLink size={16} aria-hidden /></a>}
        {x?.web && /^https?:\/\//.test(x.web) && <a className="vd-btn vd-btn-ghost" href={x.web} target="_blank" rel="noopener noreferrer">Sitio web <ExternalLink size={16} aria-hidden /></a>}
        <LinkButton to="/chat" variant="ghost" icon="embajador">Hablar con un embajador</LinkButton>
      </div>
      <p className="ficha-fuente">Fuente: {lugar.fuentes.join(', ')}</p>
    </article>
  )
}
