// Secciones del panel del prestador: pedir reseñas por WhatsApp y ver las recibidas con su estado de moderación.
import { Button, Chip } from '../components/ui'
import { digitosWhatsapp, enlaceWhatsapp, useMisNegocios } from '../state/reservas'
import { useResenasModeracion, useReservasParaResena } from '../state/resenas'
import '../styles/prestador.css'
import '../styles/resenas.css'

const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const estrellas = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export function PedirResenas() {
  const mios = useMisNegocios()
  const c = useReservasParaResena()
  const nombre = (id: string | null) => mios.negocios.find((n) => n.id === id)?.nombre ?? 'nuestro negocio'
  return (
    <section className="pr-seccion" aria-labelledby="h-pedir-resenas">
      <h2 id="h-pedir-resenas" className="t-h2">Pedir reseñas</h2>
      <p className="pr-nota">Reservas confirmadas que ya terminaron y todavía no tienen reseña. El viajero la deja con su código y su teléfono; el equipo la revisa antes de publicarla.</p>
      <div aria-live="polite">
        {c.cargando ? <p className="pr-nota" role="status">Cargando…</p>
          : c.error ? <p className="pr-error" role="alert">{c.error} <Button variant="ghost" onClick={c.recargar}>Reintentar</Button></p>
          : c.datos.length === 0 ? <div className="pr-vacio"><p>No hay reservas pendientes de reseña.</p></div>
          : (
            <ul className="pr-lista">
              {c.datos.map((r) => {
                const num = digitosWhatsapp(r.contacto)
                const texto = `Hola ${r.nombre}, gracias por visitarnos en ${nombre(r.negocioId)}. ¿Nos cuentas cómo te fue? Tu opinión nos ayuda mucho: ${location.origin}/resena/${r.codigo}`
                return (
                  <li key={r.reservaId} className="pr-item">
                    <div className="pr-meta"><h3 className="t-h3">{r.nombre}</h3><span>Visita del {fecha(r.fecha)}</span></div>
                    <div className="pr-acciones">
                      {num
                        ? <a className="vd-btn vd-btn-secondary" href={enlaceWhatsapp(num, texto)} target="_blank" rel="noopener noreferrer" aria-label={`Pedir reseña por WhatsApp a ${r.nombre}`}>Pedir reseña por WhatsApp</a>
                        : <span className="pr-nota">Su contacto no sirve para WhatsApp: {r.contacto}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
    </section>
  )
}

export function ResenasRecibidas() {
  const mios = useMisNegocios()
  const c = useResenasModeracion()
  const ids = new Set(mios.negocios.map((n) => n.id))
  const lista = c.datos.filter((r) => r.negocioId && ids.has(r.negocioId))
  return (
    <section className="pr-seccion" aria-labelledby="h-resenas-rec">
      <h2 id="h-resenas-rec" className="t-h2">Reseñas recibidas</h2>
      <div aria-live="polite">
        {c.cargando ? <p className="pr-nota" role="status">Cargando…</p>
          : c.error ? <p className="pr-error" role="alert">{c.error} <Button variant="ghost" onClick={c.recargar}>Reintentar</Button></p>
          : lista.length === 0 ? <div className="pr-vacio"><p>Aún no tienes reseñas.</p></div>
          : (
            <ul className="pr-lista">
              {lista.map((r) => (
                <li key={r.id} className="pr-item">
                  <div className="pr-meta">
                    <span aria-label={`${r.calificacion} de 5 estrellas`}>{estrellas(r.calificacion)}</span>
                    <Chip tone={r.visible ? 'success' : 'soft'}>{r.visible ? 'Publicada' : 'En moderación'}</Chip>
                    <span>{r.negocioNombre} · {fecha(r.creada.slice(0, 10))}</span>
                  </div>
                  {r.comentario && <p className="pr-nota">{r.comentario}</p>}
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}
