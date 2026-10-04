import { CATEGORIAS, MUNICIPIOS } from '../../data/lugares'
import type { CategoriaId } from '../../data/lugares'
import { CategoriaIcono } from './iconos'

interface Props {
  activas: Set<CategoriaId>
  conteo: Partial<Record<CategoriaId, number>>   // cantidad por categoría con el municipio elegido
  municipio: string                                // '' = todos
  onToggle: (id: CategoriaId) => void
  onTodas: () => void
  onNinguna: () => void
  onMunicipio: (slug: string) => void
}

// Leyenda = filtro. Cada fila es un botón (aria-pressed) con ícono + nombre + cantidad: no depende del color.
export function LeyendaMapa({ activas, conteo, municipio, onToggle, onTodas, onNinguna, onMunicipio }: Props) {
  return (
    <div className="leyenda">
      <label className="leyenda-mun">
        <span className="vd-field-label">Municipio</span>
        <select className="vd-input" value={municipio} onChange={(e) => onMunicipio(e.target.value)}>
          <option value="">Los 7 municipios</option>
          {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
        </select>
      </label>
      <div className="leyenda-cab">
        <h3 className="t-h3">Qué mostrar</h3>
        <span className="leyenda-acc">
          <button type="button" className="enlace" onClick={onTodas}>Todo</button>
          <button type="button" className="enlace" onClick={onNinguna}>Nada</button>
        </span>
      </div>
      <ul className="leyenda-lista">
        {CATEGORIAS.map((c) => {
          const n = conteo[c.id] ?? 0
          return (
            <li key={c.id}>
              <button type="button" className="leyenda-item" aria-pressed={activas.has(c.id)} disabled={n === 0} onClick={() => onToggle(c.id)}>
                <span className={`pin pin-mini${c.servicio ? ' pin-servicio' : ''}`} aria-hidden><CategoriaIcono id={c.id} size={18} /></span>
                <span className="leyenda-nombre">{c.etiqueta}</span>
                <span className="leyenda-n">{n}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="leyenda-nota"><span className="pin pin-mini pin-aprox" aria-hidden /> Contorno punteado = ubicación aproximada.</p>
    </div>
  )
}
