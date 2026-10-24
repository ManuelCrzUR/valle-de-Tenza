// «Reseñas por moderar»: el coordinador publica u oculta. Nacen ocultas; solo cambia `visible`.
import { useState } from 'react'
import { Button, Chip } from '../components/ui'
import { cambiarVisibilidad, useResenasModeracion } from '../state/resenas'
import '../styles/prestador.css'
import '../styles/resenas.css'

const estrellas = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export default function CoordinadorResenas() {
  const c = useResenasModeracion()
  const [error, setError] = useState('')
  const mover = async (id: string, visible: boolean) => {
    const r = await cambiarVisibilidad(id, visible)
    setError(r.ok ? '' : r.error)
    if (r.ok) c.recargar()
  }
  const pendientes = c.datos.filter((r) => !r.visible).length
  return (
    <section className="pr-seccion" aria-labelledby="h-resenas-mod">
      <h2 id="h-resenas-mod" className="t-h2">Reseñas por moderar</h2>
      <p className="pr-nota">{c.cargando ? 'Cargando…' : `${pendientes} ${pendientes === 1 ? 'oculta' : 'ocultas'} de ${c.datos.length}. Una reseña se muestra en la ficha del lugar solo si la publicas.`}</p>
      <p className="pr-error" role="alert">{error}</p>
      <div aria-live="polite">
        {c.error ? <p className="pr-error" role="alert">{c.error} <Button variant="ghost" onClick={c.recargar}>Reintentar</Button></p>
          : !c.cargando && c.datos.length === 0 ? <div className="pr-vacio"><p>Todavía no hay reseñas.</p></div>
          : (
            <ul className="pr-lista">
              {c.datos.map((r) => (
                <li key={r.id} className="pr-item">
                  <div className="pr-meta">
                    <span aria-label={`${r.calificacion} de 5 estrellas`}>{estrellas(r.calificacion)}</span>
                    <Chip tone={r.visible ? 'success' : 'soft'}>{r.visible ? 'Publicada' : 'Oculta'}</Chip>
                    <span>{r.negocioNombre} · {fecha(r.creada)}</span>
                  </div>
                  {r.comentario ? <p className="pr-nota">{r.comentario}</p> : <p className="pr-nota">Sin comentario.</p>}
                  <div className="pr-acciones">
                    {r.visible
                      ? <Button variant="secondary" onClick={() => mover(r.id, false)} aria-label={`Ocultar reseña de ${r.negocioNombre} del ${fecha(r.creada)}`}>Ocultar</Button>
                      : <Button variant="primary" onClick={() => mover(r.id, true)} aria-label={`Publicar reseña de ${r.negocioNombre} del ${fecha(r.creada)}`}>Publicar</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}
