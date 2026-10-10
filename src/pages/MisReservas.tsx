import { useState } from 'react'
import { PlaceCard } from '../components/ui'
import type { ChipProps } from '../components/ui'
import { Button } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Icon } from '../components/Icon'
import { getLugar, NOMBRE_MUNICIPIO } from '../data/lugares'
import { useDemo, useMisReservas, cambiarEstado, LUGAR_NEGOCIO } from '../state/demo'
import type { EstadoReserva } from '../state/demo'
import { usePagina } from '../usePagina'
import { fechaLarga } from './Reservar'
import '../styles/reservas.css'

const TONO: Record<EstadoReserva, ChipProps['tone']> = { pendiente: 'soft', confirmada: 'success', rechazada: 'danger', cancelada: 'danger' }
const ETIQUETA: Record<EstadoReserva, string> = { pendiente: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada' }

export default function MisReservas() {
  usePagina('Mis reservas')
  const demo = useDemo()
  const reservas = useMisReservas()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const cancelar = (id: string) => {
    const r = cambiarEstado(id, 'cancelada')
    setError(r.ok ? '' : r.error)
    setConfirmando(null)
  }
  const nombreLugar = (lugarId: string) =>
    getLugar(lugarId)?.nombre ?? demo.negocios.find((n) => n.lugarId === lugarId)?.nombre ?? 'Lugar'
  const enlace = (lugarId: string) => (lugarId.startsWith(LUGAR_NEGOCIO) ? null : `/lugares/${lugarId}`)

  return (
    <div className="wrap pagina res-pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Mis reservas</h1>
      <p className="res-aviso"><Icon name="alerta" size={20} />Modo demostración: los datos se guardan solo en este navegador.</p>
      <div aria-live="polite">{error && <p className="res-error"><Icon name="alerta" size={18} />{error}</p>}</div>
      {reservas.length === 0 ? (
        <>
          <p className="sub">Aún no has enviado ninguna solicitud. Explora los lugares y reserva donde quieras.</p>
          <LinkButton to="/lugares" variant="primary">Explorar lugares</LinkButton>
        </>
      ) : (
        <ul className="res-lista">
          {reservas.map((r) => {
            const nombre = nombreLugar(r.lugarId)
            const lugar = getLugar(r.lugarId)
            const detalle = [
              fechaLarga(r.fecha),
              r.hora && `${r.hora}`,
              r.noches && `${r.noches} ${r.noches === 1 ? 'noche' : 'noches'}`,
              `${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}`,
            ].filter(Boolean).join(' · ')
            const activa = r.estado === 'pendiente' || r.estado === 'confirmada'
            const link = enlace(r.lugarId)
            return (
              <li key={r.id}>
                <PlaceCard className="res-item" chip={ETIQUETA[r.estado]} chipTone={TONO[r.estado]}
                  title={nombre} description={lugar ? NOMBRE_MUNICIPIO[lugar.municipio] ?? lugar.municipio : undefined} meta={detalle}>
                  {r.estado === 'pendiente' && <span className="res-nota">Pendiente hasta que el negocio o un embajador la gestione.</span>}
                  <div className="res-acciones">
                    {link && <LinkButton to={link} variant="ghost">Ver lugar</LinkButton>}
                    {activa && confirmando !== r.id && (
                      <Button variant="secondary" onClick={() => setConfirmando(r.id)} aria-label={`Cancelar reserva en ${nombre}`}>Cancelar</Button>
                    )}
                  </div>
                  {confirmando === r.id && (
                    <div className="res-confirmar" role="group" aria-label={`Confirmar cancelación en ${nombre}`}>
                      <p>¿Cancelar esta reserva?</p>
                      <Button variant="primary" onClick={() => cancelar(r.id)}>Sí, cancelar</Button>
                      <Button variant="ghost" onClick={() => setConfirmando(null)}>No, conservar</Button>
                    </div>
                  )}
                </PlaceCard>
              </li>
            )
          })}
        </ul>
      )}
      <p className="res-nota">Las reservas se guardan solo en este navegador.</p>
    </div>
  )
}
