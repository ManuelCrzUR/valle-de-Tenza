import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Chip, Option, TextField } from '../components/ui'
import { NOMBRE_MUNICIPIO, TIPOS_RESERVA, tipoReserva, useCatalogo } from '../data/lugares'
import type { TipoReserva } from '../data/lugares'
import { cambiarEstado, cupoLibre, digitosWhatsapp, enlaceWhatsapp, fechaCorta, guardarCupoDia, guardarNegocio, hoy, LUGAR_NEGOCIO, quitarNegocio, salir, useMisNegocios, useOperacion, useReservasDeMisNegocios, useSesionLista, useUsuario } from '../state/reservas'
import type { EstadoReserva, Negocio, Operacion, Reserva } from '../state/reservas'
import { useMetricasPrestador, useOcupacion } from '../state/metricas'
import type { OcupacionDia } from '../state/metricas'
import { PedirResenas, ResenasRecibidas } from './PrestadorResenas'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RESERVA.map((t) => [t.id, t.etiqueta])) as Record<TipoReserva, string>
const ESTADOS: { id: EstadoReserva | 'todas'; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas' }, { id: 'pendiente', etiqueta: 'Pendientes' }, { id: 'confirmada', etiqueta: 'Confirmadas' },
  { id: 'rechazada', etiqueta: 'Rechazadas' }, { id: 'cancelada', etiqueta: 'Canceladas' }, { id: 'vencida', etiqueta: 'Vencidas' },
]
const TONO: Record<EstadoReserva, 'soft' | 'success' | 'danger' | 'strong'> = { pendiente: 'soft', confirmada: 'success', rechazada: 'danger', cancelada: 'danger', vencida: 'danger' }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function PrestadorPanel() {
  usePagina('Panel de prestador')
  const usuario = useUsuario()
  const lista = useSesionLista()
  if (!lista) return <div className="wrap pagina"><p className="sub" role="status">Cargando tu sesión…</p></div>
  if (!usuario) return <Navigate to="/prestadores/entrar" replace />
  return (
    <div className="wrap pagina">
      <div className="pr-cab">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Hola, {usuario.nombre}</h1>
        <Button variant="secondary" onClick={salir}>Cerrar sesión</Button>
      </div>
      <Negocios />
      <Reservas />
      <PedirResenas />
      <ResenasRecibidas />
    </div>
  )
}

// ---------- Mis negocios ----------
function Negocios() {
  const { negocios: mios, cargando, error: errorCarga } = useMisNegocios()
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Negocio | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="pr-seccion" aria-labelledby="h-negocios">
      <h2 id="h-negocios" className="t-h2">Mis negocios</h2>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando tus negocios…</p>}
        {(errorCarga || error) && <p className="pr-error">{errorCarga || error}</p>}
      </div>
      {!cargando && mios.length === 0 && !abierto && (
        <div className="pr-vacio"><p>Aún no tienes negocios. Agrega uno para empezar a recibir solicitudes de reserva.</p></div>
      )}
      <ul className="pr-lista">
        {mios.map((n) => (
          <li key={n.id} className="pr-item">
            <h3 className="t-h3">{n.nombre}</h3>
            <div className="pr-meta">
              <Chip tone="strong">{ETIQUETA_TIPO[n.tipo]}</Chip>
              <span>{NOMBRE_MUNICIPIO[n.municipio] ?? n.municipio}</span>
              <span>Cupo diario: {n.cupoDiario} {n.cupoDiario === 1 ? 'persona' : 'personas'}</span>
              {!n.lugarId.startsWith(LUGAR_NEGOCIO) && <span>En el mapa</span>}
            </div>
            {n.descripcion && <p className="pr-nota">{n.descripcion}</p>}
            {quitando === n.id ? (
              <div className="pr-confirma" role="group" aria-label={`Confirmar quitar ${n.nombre}`}>
                <p>¿Quitar «{n.nombre}»? Sus reservas dejarán de aparecer en tu panel.</p>
                <Button variant="cta" onClick={async () => { const r = await quitarNegocio(n.id); setError(r.ok ? '' : r.error); setQuitando(null) }}>Sí, quitar</Button>
                <Button variant="ghost" onClick={() => setQuitando(null)}>Cancelar</Button>
              </div>
            ) : (
              <div className="pr-acciones">
                <Button variant="secondary" onClick={() => { setEditando(n); setAbierto(true) }} aria-label={`Editar ${n.nombre}`}>Editar</Button>
                <Button variant="ghost" onClick={() => setQuitando(n.id)} aria-label={`Quitar ${n.nombre}`}>Quitar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {abierto
        ? <FormNegocio key={editando?.id ?? 'nuevo'} editando={editando} onListo={() => { setAbierto(false); setEditando(null) }} />
        : <div><Button variant="primary" onClick={() => setAbierto(true)}>Agregar negocio</Button></div>}
    </section>
  )
}

function FormNegocio({ editando, onListo }: { editando: Negocio | null; onListo: () => void }) {
  const { lugares: LUGARES, municipios: MUNICIPIOS } = useCatalogo()
  const { negocios } = useOperacion()
  const reclamados = useMemo(() => new Set(negocios.filter((n) => n.id !== editando?.id).map((n) => n.lugarId)), [negocios, editando])
  const [modo, setModo] = useState<'mapa' | 'nuevo'>(editando && editando.lugarId.startsWith(LUGAR_NEGOCIO) ? 'nuevo' : editando ? 'mapa' : 'mapa')
  const [busca, setBusca] = useState('')
  const [lugarId, setLugarId] = useState<string | null>(editando && !editando.lugarId.startsWith(LUGAR_NEGOCIO) ? editando.lugarId : null)
  const [nombre, setNombre] = useState(editando?.nombre ?? '')
  const [municipio, setMunicipio] = useState(editando?.municipio ?? '')
  const [tipo, setTipo] = useState<TipoReserva>(editando?.tipo ?? 'restaurante')
  const [cupo, setCupo] = useState(String(editando?.cupoDiario ?? 10))
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '')
  const [whatsapp, setWhatsapp] = useState(editando?.whatsapp ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const candidatos = useMemo(() => {
    const q = norm(busca.trim())
    if (q.length < 2) return []
    return LUGARES.filter((l) => tipoReserva(l) !== null && !reclamados.has(l.id) && norm(l.nombre).includes(q)).slice(0, 8)
  }, [LUGARES, busca, reclamados])

  const elegir = (id: string) => {
    const l = LUGARES.find((x) => x.id === id)
    if (!l) return
    setLugarId(l.id); setNombre(l.nombre); setMunicipio(l.municipio); setTipo(tipoReserva(l) ?? 'restaurante'); setBusca('')
  }
  const cambiarModo = (m: 'mapa' | 'nuevo') => {
    if (m === modo) return
    setModo(m); setError(''); setLugarId(null)
    if (!editando) { setNombre(''); setMunicipio('') }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (modo === 'mapa' && !lugarId) return setError('Elige un lugar del mapa o registra uno nuevo.')
    if (modo === 'nuevo' && !municipio) return setError('Elige el municipio.')
    if (whatsapp.replace(/\D/g, '').length < 7) return setError('Escribe el WhatsApp del negocio, con indicativo (ej. 57 3001234567).')
    setGuardando(true)
    const r = await guardarNegocio({
      id: editando?.id, lugarId: modo === 'mapa' ? lugarId : editando && editando.lugarId.startsWith(LUGAR_NEGOCIO) ? editando.lugarId : null,
      nombre, municipio, tipo, cupoDiario: Math.floor(Number(cupo)), descripcion: descripcion.trim(), whatsapp: whatsapp.trim(),
    })
    setGuardando(false)
    if (r.ok) onListo(); else setError(r.error)
  }

  const lugar = lugarId ? LUGARES.find((l) => l.id === lugarId) : undefined
  return (
    <form className="pr-form pr-form-negocio" onSubmit={enviar} noValidate aria-labelledby="h-form-negocio">
      <h3 id="h-form-negocio" className="t-h3">{editando ? 'Editar negocio' : 'Agregar negocio'}</h3>
      <div className="pr-tabs" role="group" aria-label="Origen del negocio">
        <Option selected={modo === 'mapa'} onClick={() => cambiarModo('mapa')}>Elegir del mapa</Option>
        <Option selected={modo === 'nuevo'} onClick={() => cambiarModo('nuevo')}>Registrar uno nuevo</Option>
      </div>

      {modo === 'mapa' ? (
        <>
          <TextField label="Buscar tu lugar por nombre" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} hint="Solo aparecen lugares reservables que nadie ha reclamado." autoComplete="off" />
          {busca.trim().length >= 2 && (
            candidatos.length > 0
              ? <ul className="pr-resultados" aria-label="Resultados">
                  {candidatos.map((l) => (
                    <li key={l.id}><Option onClick={() => elegir(l.id)}>{l.nombre} · {NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}</Option></li>
                  ))}
                </ul>
              : <p className="pr-nota" role="status">No encontramos lugares disponibles con ese nombre. Puedes registrarlo como uno nuevo.</p>
          )}
          {lugar && <p className="pr-ok" role="status">Lugar elegido: {lugar.nombre}, {NOMBRE_MUNICIPIO[lugar.municipio] ?? lugar.municipio}.</p>}
        </>
      ) : (
        <>
          <TextField label="Nombre del negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <div className="vd-field">
            <label htmlFor="pr-mun" className="vd-field-label">Municipio</label>
            <select id="pr-mun" className="vd-input pr-select" value={municipio} onChange={(e) => setMunicipio(e.target.value)} required>
              <option value="">Selecciona…</option>
              {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="vd-field">
        <label htmlFor="pr-tipo" className="vd-field-label">Tipo de módulo de reserva</label>
        <select id="pr-tipo" className="vd-input pr-select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoReserva)}>
          {TIPOS_RESERVA.map((t) => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
        </select>
      </div>
      <TextField label="Cupo diario (personas)" type="number" min={1} step={1} inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} required />
      <TextField label="WhatsApp del negocio" type="tel" autoComplete="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} hint="Solo lo ve la persona que reserva al avisarte; no se publica." required />
      <div className="vd-field">
        <label htmlFor="pr-desc" className="vd-field-label">Descripción</label>
        <textarea id="pr-desc" className="pr-area" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <p className="pr-error" role="alert" aria-live="assertive">{error}</p>
      <div className="pr-acciones">
        <Button type="submit" variant="cta" disabled={guardando}>{guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar negocio'}</Button>
        <Button variant="ghost" onClick={onListo}>Cancelar</Button>
      </div>
    </form>
  )
}

// ---------- Reservas ----------
function contactoEnlace(c: string) {
  const t = c.trim()
  if (/^\S+@\S+\.\S+$/.test(t)) return { href: `mailto:${t}`, texto: t }
  if (!/^\+?[\d\s().-]+$/.test(t)) return null
  const d = t.replace(/\D/g, '')
  if (d.length < 7 || d.length > 15) return null
  // wa.me exige código de país: solo se arma con «+» o con celular colombiano de 10 dígitos que empieza en 3.
  const wa = t.startsWith('+') ? d : d.length === 10 && d.startsWith('3') ? `57${d}` : d.length === 12 && d.startsWith('57') ? d : null
  return { href: `tel:${t.startsWith('+') ? '+' : ''}${d}`, wa: wa ? `https://wa.me/${wa}` : null, texto: t }
}

function Reservas() {
  const op = useOperacion()
  const { negocios: mios, cargando: cargandoN } = useMisNegocios()
  const { reservas: todas, cargando: cargandoR, error: errorCarga, aviso, limpiarAviso } = useReservasDeMisNegocios()
  const [negId, setNegId] = useState('')
  const [filtro, setFiltro] = useState<EstadoReserva | 'todas'>('todas')
  const [error, setError] = useState('')
  const negocio = mios.find((n) => n.id === negId) ?? mios[0]

  const reservas = negocio ? todas.filter((r) => r.negocioId === negocio.id) : []
  const hoyStr = hoy()
  const pendientes = reservas.filter((r) => r.estado === 'pendiente').length
  const confirmadasHoy = reservas.filter((r) => r.estado === 'confirmada' && r.fecha === hoyStr).length
  const visibles = reservas
    .filter((r) => filtro === 'todas' || r.estado === filtro)
    .sort((a, b) => `${a.fecha} ${a.hora ?? ''}`.localeCompare(`${b.fecha} ${b.hora ?? ''}`))

  async function mover(id: string, estado: EstadoReserva) {
    const r = await cambiarEstado(id, estado)
    setError(r.ok ? '' : r.error)
  }

  return (
    <section className="pr-seccion" aria-labelledby="h-reservas">
      <h2 id="h-reservas" className="t-h2">Reservas</h2>
      <div aria-live="polite" className="pr-vivo">
        {aviso && (
          <p className="pr-aviso-vivo">
            <span>{aviso}</span>
            <Button variant="ghost" onClick={limpiarAviso} aria-label="Cerrar aviso">Entendido</Button>
          </p>
        )}
      </div>
      {cargandoN || cargandoR ? (
        <p className="pr-nota" role="status">Cargando reservas…</p>
      ) : errorCarga ? (
        <p className="pr-error" role="alert">{errorCarga}</p>
      ) : !negocio ? (
        <div className="pr-vacio"><p>Agrega un negocio para ver aquí sus solicitudes.</p></div>
      ) : (
        <>
          {mios.length > 1 && (
            <div className="vd-field">
              <label htmlFor="pr-neg" className="vd-field-label">Negocio</label>
              <select id="pr-neg" className="vd-input pr-select" value={negocio.id} onChange={(e) => { setNegId(e.target.value); setError('') }}>
                {mios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="pr-cifras" aria-label={`Resumen de ${negocio.nombre}`}>
            <div className="pr-cifra"><strong>{pendientes}</strong><span>Pendientes</span></div>
            <div className="pr-cifra"><strong>{confirmadasHoy}</strong><span>Confirmadas hoy</span></div>
            <div className="pr-cifra"><strong>{cupoLibre(op, negocio, hoyStr)}</strong><span>Cupo libre hoy</span></div>
          </div>
          <MetricasNegocio negocio={negocio} reservas={reservas} />
          <CalendarioCupo op={op} negocio={negocio} />
          <div className="pr-filtros" role="group" aria-label="Filtrar por estado">
            {ESTADOS.map((e) => <Option key={e.id} selected={filtro === e.id} onClick={() => setFiltro(e.id)}>{e.etiqueta}</Option>)}
          </div>
          <p className="pr-error" role="alert" aria-live="assertive">{error}</p>
          {visibles.length === 0 ? (
            <div className="pr-vacio">
              <p>{reservas.length === 0 ? 'Todavía no hay solicitudes para este negocio.' : 'No hay reservas con ese estado.'}</p>
              {reservas.length === 0 && <p>Las solicitudes llegan cuando un viajero usa «Reservar» en Lugares, Mapa o Itinerario.</p>}
            </div>
          ) : (
            <ul className="pr-lista">
              {visibles.map((r) => <FilaReserva key={r.id} r={r} lugar={negocio.nombre} onMover={mover} />)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

// ---------- Calendario de 30 días ----------
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
function diasDesdeHoy(n: number): string[] {
  return Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toLocaleDateString('en-CA') })
}
function CalendarioCupo({ op, negocio }: { op: Operacion; negocio: Negocio }) {
  const dias = useMemo(() => diasDesdeHoy(30), [])
  const [sel, setSel] = useState<string | null>(null)
  const [cupo, setCupo] = useState('')
  const [cerrado, setCerrado] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const estado = (f: string) => {
    const dia = op.cupos.find((c) => c.negocio_id === negocio.id && c.fecha === f)
    const total = dia?.cerrado ? 0 : dia?.cupo ?? negocio.cupoDiario
    return { dia, total, libre: cupoLibre(op, negocio, f), cerrado: !!dia?.cerrado }
  }
  const elegir = (f: string) => {
    const { dia } = estado(f)
    setSel(f); setCupo(dia?.cupo != null ? String(dia.cupo) : ''); setCerrado(!!dia?.cerrado); setError(''); setOk('')
  }
  const guardar = async (c: { cupo?: number | null; cerrado?: boolean }) => {
    if (!sel) return
    setGuardando(true); setError(''); setOk('')
    const r = await guardarCupoDia(negocio.id, sel, c)
    setGuardando(false)
    if (r.ok) setOk(`Guardado: ${fechaCorta(sel)}.`); else setError(r.error)
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const n = cupo.trim() === '' ? null : Number(cupo)
    if (n !== null && !(Number.isInteger(n) && n >= 0)) return setError('El cupo debe ser un número entero, 0 o más.')
    guardar({ cupo: n, cerrado })
  }
  const vacios = (new Date(`${dias[0]}T12:00:00`).getDay() + 6) % 7   // lunes primero
  const e = sel ? estado(sel) : null
  return (
    <div className="pr-cal" role="group" aria-labelledby="h-cal">
      <h3 id="h-cal" className="t-h3">Calendario de cupos · próximos 30 días</h3>
      <p className="pr-nota">Toca un día para cerrarlo o cambiar su cupo. Sin cambios, vale tu cupo diario ({negocio.cupoDiario}).</p>
      <div className="pr-cal-semana" aria-hidden="true">{DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="pr-cal-grid">
        {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
        {dias.map((f) => {
          const x = estado(f)
          const txt = x.cerrado ? 'Cerrado' : x.libre === 0 ? 'Lleno' : `${x.libre} ${x.libre === 1 ? 'libre' : 'libres'}`
          const clase = x.cerrado ? 'pr-dia-cerrado' : x.libre === 0 ? 'pr-dia-lleno' : x.libre < x.total ? 'pr-dia-parcial' : ''
          return (
            <button key={f} type="button" className={`pr-dia ${clase}`} aria-pressed={sel === f} onClick={() => elegir(f)} aria-label={`${fechaCorta(f)}: ${txt}`}>
              <strong>{Number(f.slice(8))}</strong><small>{txt}</small>
            </button>
          )
        })}
      </div>
      <div aria-live="polite">
        {sel && e && (
          <form className="pr-form pr-cal-form" onSubmit={enviar} noValidate aria-label={`Cupo del ${fechaCorta(sel)}`}>
            <h4 className="t-h3">{fechaCorta(sel)}</h4>
            <p className="pr-nota">{e.cerrado ? 'Día cerrado.' : `Quedan ${e.libre} de ${e.total} cupos.`}</p>
            <TextField label="Cupo de este día (personas)" type="number" min={0} step={1} inputMode="numeric" value={cupo} onChange={(ev) => setCupo(ev.target.value)} hint={`Vacío = cupo diario (${negocio.cupoDiario}).`} />
            <label className="pr-check"><input type="checkbox" checked={cerrado} onChange={(ev) => setCerrado(ev.target.checked)} /> Cerrar este día (no recibe reservas)</label>
            <div className="pr-acciones">
              <Button type="submit" variant="cta" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar día'}</Button>
              <Button variant="ghost" onClick={() => { setCupo(''); setCerrado(false); guardar({ cupo: null, cerrado: false }) }} disabled={guardando}>Volver al cupo diario</Button>
            </div>
          </form>
        )}
        {error && <p className="pr-error" role="alert">{error}</p>}
        {ok && <p className="pr-ok">{ok}</p>}
      </div>
    </div>
  )
}

function mensajeViajero(r: Reserva, lugar: string): string {
  const f = fechaCorta(r.fecha)
  return r.estado === 'confirmada'
    ? `Hola ${r.nombre}, tu reserva en ${lugar} para el ${f} (${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}) quedó confirmada. Código: ${r.codigo}.`
    : `Hola ${r.nombre}, lamentamos avisarte que no pudimos confirmar tu solicitud en ${lugar} para el ${f}. Código: ${r.codigo}. Puedes intentar otra fecha en Valle Directo.`
}
function FilaReserva({ r, lugar, onMover }: { r: Reserva; lugar: string; onMover: (id: string, e: EstadoReserva) => Promise<void> }) {
  const c = contactoEnlace(r.contacto)
  const fecha = new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const cerrada = r.estado === 'rechazada' || r.estado === 'cancelada' || r.estado === 'vencida'
  return (
    <li className="pr-item">
      <div className="pr-meta">
        <h3 className="t-h3">{r.nombre}</h3>
        <Chip tone={TONO[r.estado]}>{r.estado[0].toUpperCase() + r.estado.slice(1)}</Chip>
      </div>
      <div className="pr-meta">
        <span>{fecha}{r.hora ? `, ${r.hora}` : ''}</span>
        <span>{r.personas} {r.personas === 1 ? 'persona' : 'personas'}</span>
        {r.noches ? <span>{r.noches} {r.noches === 1 ? 'noche' : 'noches'}</span> : null}
      </div>
      <div className="pr-meta">
        <span>Contacto:</span>
        {c ? (
          <>
            <a className="pr-tel" href={c.href}>{c.texto}</a>
            {'wa' in c && c.wa && <a className="pr-tel" href={c.wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </>
        ) : <span>{r.contacto}</span>}
      </div>
      {r.nota && <p className="pr-nota">Nota: {r.nota}</p>}
      <div className="pr-acciones">
        {r.estado !== 'confirmada' && r.estado !== 'cancelada' && <Button variant="primary" onClick={() => onMover(r.id, 'confirmada')} aria-label={`Confirmar reserva de ${r.nombre}`}>Confirmar</Button>}
        {!cerrada && <Button variant="secondary" onClick={() => onMover(r.id, 'rechazada')} aria-label={`Rechazar reserva de ${r.nombre}`}>Rechazar</Button>}
      </div>
      {(r.estado === 'confirmada' || r.estado === 'rechazada') && (() => {
        const num = digitosWhatsapp(r.contacto)
        return num ? (
          <div className="pr-acciones">
            <a className="vd-btn vd-btn-secondary" href={enlaceWhatsapp(num, mensajeViajero(r, lugar))} target="_blank" rel="noopener noreferrer" aria-label={`Avisar a ${r.nombre} por WhatsApp`}>Avisar al viajero</a>
          </div>
        ) : null
      })()}
    </li>
  )
}

// ---------- Métricas: solicitudes por estado, ocupación de 30 días, tasa y tiempo de respuesta ----------
const ESTADOS_RESUMEN: { id: EstadoReserva; plural: string }[] = [
  { id: 'pendiente', plural: 'Pendientes' }, { id: 'confirmada', plural: 'Confirmadas' }, { id: 'rechazada', plural: 'Rechazadas' },
  { id: 'cancelada', plural: 'Canceladas' }, { id: 'vencida', plural: 'Vencidas' },
]
function textoRespuesta(horas: number | null): string {
  if (horas === null) return 'sin datos'
  if (horas < 1) return `responde en ~${Math.max(1, Math.round(horas * 60))} min`
  return `responde en ~${Math.round(horas)} h`
}
function MetricasNegocio({ negocio, reservas }: { negocio: Negocio; reservas: Reserva[] }) {
  const ocupacion = useOcupacion(negocio.id)
  const metricas = useMetricasPrestador()
  const m = metricas.datos.find((x) => x.negocioId === negocio.id)
  const cuenta = (e: EstadoReserva) => reservas.filter((r) => r.estado === e).length
  return (
    <div className="pr-metricas" role="group" aria-labelledby="h-metricas">
      <h3 id="h-metricas" className="t-h3">Solicitudes y ocupación</h3>
      <div className="pr-cifras pr-cifras-5" role="list" aria-label="Solicitudes por estado">
        {ESTADOS_RESUMEN.map((e) => <div key={e.id} role="listitem" className="pr-cifra"><strong>{cuenta(e.id)}</strong><span>{e.plural}</span></div>)}
      </div>
      <div aria-live="polite">
        {metricas.error && <p className="pr-error">{metricas.error}</p>}
        {!metricas.error && (
          <p className="pr-nota" role="status">
            {metricas.cargando ? 'Calculando tu tasa de confirmación…' : <>
              <strong>Tasa de confirmación:</strong> {m?.tasaConfirmacion != null ? `${Math.round(m.tasaConfirmacion * 100)} %` : 'sin datos'}
              {' · '}<strong>Tiempo de respuesta:</strong> {textoRespuesta(m?.respuestaHoras ?? null)}
            </>}
          </p>
        )}
      </div>
      {ocupacion.cargando ? <p className="pr-nota" role="status">Cargando la ocupación…</p>
        : ocupacion.error ? <p className="pr-error" role="alert">{ocupacion.error}</p>
        : ocupacion.datos.length === 0 ? <p className="pr-nota">Aún no hay datos de ocupación para este negocio.</p>
        : <GraficoOcupacion dias={ocupacion.datos} nombre={negocio.nombre} />}
    </div>
  )
}

const BARRA = 22, SEP = 6, ALTO = 110, BASE = 20
function GraficoOcupacion({ dias, nombre }: { dias: OcupacionDia[]; nombre: string }) {
  const ancho = dias.length * (BARRA + SEP)
  const frase = (d: OcupacionDia) =>
    `${fechaCorta(d.fecha)}: ${d.cupo === 0 ? 'cerrado o sin cupo' : `${d.ocupado} de ${d.cupo} cupos ocupados${d.ocupado >= d.cupo ? ', lleno' : ''}`}`
  const llenos = dias.filter((d) => d.cupo > 0 && d.ocupado >= d.cupo).length
  const conReservas = dias.filter((d) => d.ocupado > 0).length
  const resumen = `Ocupación de ${nombre} en los próximos ${dias.length} días: ${conReservas} ${conReservas === 1 ? 'día con reservas' : 'días con reservas'}, ${llenos} ${llenos === 1 ? 'día lleno' : 'días llenos'}.`
  return (
    <figure className="pr-grafico">
      <figcaption className="pr-nota"><strong>Ocupación de los próximos {dias.length} días</strong> · alto de la barra = personas ocupadas / cupo del día</figcaption>
      <div className="pr-grafico-scroll" tabIndex={0} role="region" aria-label="Gráfico de ocupación por día, desplazable">
        <svg role="img" aria-label={resumen} width={ancho} height={ALTO + BASE} viewBox={`0 0 ${ancho} ${ALTO + BASE}`}>
          {dias.map((d, i) => {
            const x = i * (BARRA + SEP) + SEP / 2
            const prop = d.cupo > 0 ? Math.min(1, d.ocupado / d.cupo) : 0
            const lleno = d.cupo > 0 && d.ocupado >= d.cupo
            return (
              <g key={d.fecha}>
                <title>{frase(d)}</title>
                <rect x={x} y={0} width={BARRA} height={ALTO} rx={3} className={d.cupo === 0 ? 'pr-bar-cerrado' : 'pr-bar-pista'} />
                {prop > 0 && <rect x={x} y={ALTO - ALTO * prop} width={BARRA} height={ALTO * prop} rx={3} className={lleno ? 'pr-bar-lleno' : 'pr-bar-ocupado'} />}
                {d.cupo === 0 && <text x={x + BARRA / 2} y={ALTO / 2} className="pr-bar-x" textAnchor="middle">×</text>}
                <text x={x + BARRA / 2} y={ALTO + 14} className="pr-bar-dia" textAnchor="middle">{Number(d.fecha.slice(8))}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="pr-nota pr-leyenda">Verde: ocupado · Naranja: lleno · × : cerrado o sin cupo. Desliza el gráfico para ver todos los días.</p>
      <div className="sr-only"><table>
        <caption>{resumen}</caption>
        <thead><tr><th scope="col">Fecha</th><th scope="col">Ocupado</th><th scope="col">Cupo</th></tr></thead>
        <tbody>{dias.map((d) => <tr key={d.fecha}><th scope="row">{fechaCorta(d.fecha)}</th><td>{d.ocupado}</td><td>{d.cupo}</td></tr>)}</tbody>
      </table></div>
    </figure>
  )
}
