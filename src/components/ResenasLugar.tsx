// Promedio y últimas 5 reseñas visibles de un lugar. Sin reseñas publicadas no muestra nada (no se inventa).
import { textoPromedio, useResenasLugar } from '../state/resenas'
import '../styles/resenas.css'

export function ResenasLugar({ lugarId }: { lugarId: string }) {
  const { resenas, resumen } = useResenasLugar(lugarId)
  if (!resumen || resenas.length === 0) return null
  return (
    <section className="rs-bloque" aria-labelledby="h-resenas">
      <h2 id="h-resenas" className="t-h3">Reseñas de viajeros</h2>
      <p className="rs-resumen">{textoPromedio(resumen)}</p>
      <ul className="rs-lista">
        {resenas.map((r) => (
          <li key={r.id} className="rs-item">
            <div className="rs-cab">
              <span aria-label={`${r.calificacion} de 5 estrellas`}>{'★'.repeat(r.calificacion)}{'☆'.repeat(5 - r.calificacion)}</span>
              <span className="rs-fecha">{new Date(r.creada).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            {r.comentario && <p>{r.comentario}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
