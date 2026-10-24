import { useState } from 'react'
import type { FormEvent } from 'react'
import { PlaceCard } from '../components/ui'
import type { ChipProps } from '../components/ui'
import { Button, TextField } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Icon } from '../components/Icon'
import { getLugar, NOMBRE_MUNICIPIO } from '../data/lugares'
import { useOperacion, useMisReservasEstado, buscarReserva, cancelarMiReserva, LUGAR_NEGOCIO } from '../state/reservas'
import type { EstadoReserva } from '../state/reservas'
import { hoy } from '../state/reservas'
import { usePagina } from '../usePagina'
import { fechaLarga } from './Reservar'
import '../styles/reservas.css'
import '../styles/prestador.css'

const TONO: Record<EstadoReserva, ChipProps['tone']> = { pendiente: 'soft', confirmada: 'success', rechazada: 'danger', cancelada: 'danger', vencida: 'danger' }
const ETIQUETA: Record<EstadoReserva, string> = { pendiente: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', vencida: 'Vencida' }

// Último día de la visita + 1: desde ahí se puede reseñar (igual que la base: fecha + noches).
function finDeVisita(fecha: string, noches?: number) {
  const d = new Date(`${fecha}T12:00:00`); d.setDate(d.getDate() + (noches ?? 0)); return d.toLocaleDateString('en-CA')
}

export default function MisReservas() {
  usePagina('Mis reservas')
  const demo = useOperacion()
  const { reservas, cargando } = useMisReservasEstado()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const cancelar = async (codigo: string, contacto: string) => {
    const r = await cancelarMiReserva(codigo, contacto)
    setError(r.ok ? '' : r.error)
    setConfirmando(null)
  }
  const [codigo, setCodigo] = useState('')
  const [tel, setTel] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const buscar = async (e: FormEvent) => {
    e.preventDefault()
    if (!codigo.trim() || !tel.trim()) return setMsg({ ok: false, texto: 'Escribe el código y el teléfono con que reservaste.' })
    setBuscando(true); setMsg(null)
    const r = await buscarReserva(codigo.trim().toUpperCase(), tel.trim())
    setBuscando(false)
    if (r.ok) { setMsg({ ok: true, texto: `Encontramos tu reserva ${r.reserva?.codigo} y la agregamos a tu lista.` }); setCodigo(''); setTel('') }
    else setMsg({ ok: false, texto: r.error })
  }
  const nombreLugar = (lugarId: string) =>
    getLugar(lugarId)?.nombre ?? demo.negocios.find((n) => n.lugarId === lugarId)?.nombre ?? 'Lugar'
  const enlace = (lugarId: string) => (lugarId.startsWith(LUGAR_NEGOCIO) ? null : `/lugares/${lugarId}`)

  return (
    <div className="wrap pagina res-pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Mis reservas</h1>
      <div aria-live="polite">{demo.sinConexion && <p className="res-aviso"><Icon name="alerta" size={20} />Sin conexión: por ahora no se pueden hacer reservas.</p>}</div>
      <div aria-live="polite">{error && <p className="res-error"><Icon name="alerta" size={18} />{error}</p>}</div>
      {cargando ? <p className="sub" role="status">Cargando tus reservas…</p> : reservas.length === 0 ? (
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
                  title={nombre} description={lugar ? NOMBRE_MUNICIPIO[lugar.municipio] ?? lugar.municipio : undefined} meta={`${detalle} · Código ${r.codigo}`}>
                  {r.estado === 'pendiente' && <span className="res-nota">Pendiente hasta que el negocio o un embajador la gestione.</span>}
                  <div className="res-acciones">
                    {link && <LinkButton to={link} variant="ghost">Ver lugar</LinkButton>}
                    {r.estado === 'confirmada' && hoy() >= finDeVisita(r.fecha, r.noches) && <LinkButton to={`/resena/${r.codigo}`} variant="secondary">Dejar una reseña</LinkButton>}
                    {activa && confirmando !== r.id && (
                      <Button variant="secondary" onClick={() => setConfirmando(r.id)} aria-label={`Cancelar reserva en ${nombre}`}>Cancelar</Button>
                    )}
                  </div>
                  {confirmando === r.id && (
                    <div className="res-confirmar" role="group" aria-label={`Confirmar cancelación en ${nombre}`}>
                      <p>¿Cancelar esta reserva?</p>
                      <Button variant="primary" onClick={() => cancelar(r.codigo, r.contacto)}>Sí, cancelar</Button>
                      <Button variant="ghost" onClick={() => setConfirmando(null)}>No, conservar</Button>
                    </div>
                  )}
                </PlaceCard>
              </li>
            )
          })}
        </ul>
      )}
      <form className="res-buscar" onSubmit={buscar} noValidate aria-labelledby="h-buscar">
        <h2 id="h-buscar" className="t-h3">Buscar mi reserva</h2>
        <p className="res-nota">¿Reservaste desde otro navegador? Escribe tu código y el teléfono que dejaste.</p>
        <TextField label="Código de la reserva" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" autoCapitalize="characters" required />
        <TextField label="Teléfono o WhatsApp" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" required />
        <div aria-live="polite">{msg && <p className={msg.ok ? 'pr-ok' : 'res-error'}>{msg.texto}</p>}</div>
        <Button type="submit" variant="primary" disabled={buscando || demo.sinConexion}>{buscando ? 'Buscando…' : 'Buscar'}</Button>
      </form>
      <p className="res-nota">Las reservas se guardan solo en este navegador.</p>
    </div>
  )
}
