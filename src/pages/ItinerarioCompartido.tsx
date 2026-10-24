import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LinkButton } from '../components/LinkButton'
import { useItinerario } from '../state/itinerario'
import { verItinerario } from '../state/compartir'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'

// /i/:id — carga la elección guardada y muestra el mismo itinerario en /itinerario.
export default function ItinerarioCompartido() {
  usePagina('Itinerario compartido')
  const { id = '' } = useParams()
  const { cargarEleccion } = useItinerario()
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no-existe' | 'error'>('cargando')
  useEffect(() => {
    let vivo = true
    setEstado('cargando')
    verItinerario(id)
      .then((e) => { if (vivo) setEstado(e && cargarEleccion(e) ? 'listo' : 'no-existe') })
      .catch(() => { if (vivo) setEstado('error') })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (estado === 'listo') return <Navigate to="/itinerario" replace />
  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Itinerario compartido</h1>
      <div aria-live="polite">
        {estado === 'cargando' && <p className="it-aviso">Buscando el itinerario…</p>}
        {estado === 'no-existe' && <p className="it-aviso" role="status">No encontramos este itinerario. Puede que el enlace esté incompleto o ya no exista.</p>}
        {estado === 'error' && <p className="it-aviso" role="status">No pudimos abrir el itinerario: revisa tu conexión e intenta de nuevo.</p>}
      </div>
      {estado !== 'cargando' && <LinkButton to="/itinerario" variant="cta">Armar mi propio itinerario</LinkButton>}
    </div>
  )
}
