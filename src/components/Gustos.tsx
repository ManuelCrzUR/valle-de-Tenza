import type { ReactElement } from 'react'
import { etiquetasGustos, hayGustos } from '../../shared/gustos'
import { NOMBRE_MUNICIPIO } from '../data/lugares'
import { borrarGustos, quitarGusto, useGustos } from '../state/gustos'
import '../styles/agente.css'

export function Gustos(): ReactElement | null {
  const g = useGustos()
  if (!hayGustos(g)) return null
  const etiquetas = etiquetasGustos(g, NOMBRE_MUNICIPIO)
  return (
    <div className="gustos">
      <p className="gustos-titulo" id="gustos-titulo">Lo que entendí de ti:</p>
      <ul className="gustos-lista" aria-labelledby="gustos-titulo">
        {etiquetas.map((e) => (
          <li key={e.clave} className="gustos-chip">
            <span>{e.texto}</span>
            <button type="button" className="gustos-quitar" aria-label={`Quitar ${e.texto}`} onClick={() => quitarGusto(e.clave)}>
              <span aria-hidden="true">✕</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="gustos-borrar" onClick={borrarGustos}>Borrar mis gustos</button>
      <p className="gustos-nota">Se guarda solo en este dispositivo.</p>
    </div>
  )
}
