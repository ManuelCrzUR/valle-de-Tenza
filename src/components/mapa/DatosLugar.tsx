import { NOMBRE_MUNICIPIO, tieneUbicacion } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'

const AVISO_PRECISION: Record<string, string> = {
  direccion: 'Ubicación aproximada: calculada a partir de la dirección.',
  vereda: 'Ubicación aproximada: centro de la vereda.',
  cabecera: 'Ubicación aproximada: zona urbana del municipio.',
}

// Datos del lugar (dónde, capacidad, horario...) y avisos de precisión. Lo comparten la ficha del mapa y la página de detalle.
export function DatosLugar({ lugar }: { lugar: Lugar }) {
  const x = lugar.extra
  const lugarTexto = [lugar.direccion || (lugar.vereda ? `Vereda ${lugar.vereda}` : ''), NOMBRE_MUNICIPIO[lugar.municipio]].filter(Boolean).join(' · ')
  return (
    <>
      <dl className="ficha-datos">
        <div><dt>Dónde</dt><dd>{lugarTexto}</dd></div>
        {x?.habitaciones ? <div><dt>Capacidad</dt><dd>{x.habitaciones} habitaciones{x.camas ? `, ${x.camas} camas` : ''}</dd></div> : x?.camas ? <div><dt>Capacidad</dt><dd>{x.camas} camas</dd></div> : null}
        {x?.horario && <div><dt>Horario</dt><dd>{x.horario}</dd></div>}
        {x?.nivel && <div><dt>Nivel de atención</dt><dd>{x.nivel}</dd></div>}
        {x?.descripcion && <div><dt>Sobre el lugar</dt><dd>{x.descripcion}</dd></div>}
      </dl>
      {!tieneUbicacion(lugar) && <p className="ficha-aviso">Este lugar aún no tiene ubicación en el mapa.</p>}
      {lugar.precision && AVISO_PRECISION[lugar.precision] && <p className="ficha-aviso">{AVISO_PRECISION[lugar.precision]}</p>}
    </>
  )
}
