import { CATEGORIA_POR_ID, NOMBRE_MUNICIPIO, tieneUbicacion } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'
import { CategoriaIcono } from './iconos'

export function Resultados({ lugares, seleccionado, onElegir }: { lugares: Lugar[]; seleccionado: string | null; onElegir: (id: string) => void }) {
  if (!lugares.length) return <p className="vacio vacio-col">No hay lugares con estos filtros. Prueba con otra categoría u otro municipio.</p>
  return (
    <ul className="resultados" aria-label="Lugares">
      {lugares.map((l) => (
        <li key={l.id}>
          <button type="button" className="resultado-item" aria-current={l.id === seleccionado ? 'true' : undefined} onClick={() => onElegir(l.id)}>
            <span className={`pin pin-mini${l.esServicio ? ' pin-servicio' : ''}`} aria-hidden><CategoriaIcono id={l.categoria} size={18} /></span>
            <span className="resultado-txt">
              <strong>{l.nombre}</strong>
              <small>{NOMBRE_MUNICIPIO[l.municipio]} · {CATEGORIA_POR_ID[l.categoria].singular}{!tieneUbicacion(l) ? ' · sin ubicación en el mapa' : ''}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
