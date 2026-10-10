import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Chip, Option, TextField } from '../components/ui'
import { LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO, TIPOS_RESERVA, tipoReserva } from '../data/lugares'
import type { TipoReserva } from '../data/lugares'
import { cambiarEstado, cupoLibre, guardarNegocio, hoy, LUGAR_NEGOCIO, quitarNegocio, salir, useDemo, useUsuario } from '../state/demo'
import type { EstadoReserva, Negocio, Reserva } from '../state/demo'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'

const AVISO_DEMO = 'Modo demostración: las cuentas y reservas se guardan solo en este navegador; no uses una contraseña real.'
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RESERVA.map((t) => [t.id, t.etiqueta])) as Record<TipoReserva, string>
const ESTADOS: { id: EstadoReserva | 'todas'; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas' }, { id: 'pendiente', etiqueta: 'Pendientes' }, { id: 'confirmada', etiqueta: 'Confirmadas' },
  { id: 'rechazada', etiqueta: 'Rechazadas' }, { id: 'cancelada', etiqueta: 'Canceladas' },
]
const TONO: Record<EstadoReserva, 'soft' | 'success' | 'danger' | 'strong'> = { pendiente: 'soft', confirmada: 'success', rechazada: 'danger', cancelada: 'danger' }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function PrestadorPanel() {
  usePagina('Panel de prestador')
  const usuario = useUsuario()
  if (!usuario) return <Navigate to="/prestadores/entrar" replace />
  return (
    <div className="wrap pagina">
      <div className="pr-cab">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Hola, {usuario.nombre}</h1>
        <Button variant="secondary" onClick={salir}>Cerrar sesión</Button>
      </div>
      <p className="pr-aviso" role="note">{AVISO_DEMO}</p>
      <Negocios usuarioId={usuario.id} />
      <Reservas usuarioId={usuario.id} />
    </div>
  )
}

// ---------- Mis negocios ----------
function Negocios({ usuarioId }: { usuarioId: string }) {
  const { negocios } = useDemo()
  const mios = negocios.filter((n) => n.usuarioId === usuarioId)
  const [editando, setEditando] = useState<Negocio | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="pr-seccion" aria-labelledby="h-negocios">
      <h2 id="h-negocios" className="t-h2">Mis negocios</h2>
      {mios.length === 0 && !abierto && (
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
                <Button variant="cta" onClick={() => { quitarNegocio(n.id); setQuitando(null) }}>Sí, quitar</Button>
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
  const { negocios } = useDemo()
  const reclamados = useMemo(() => new Set(negocios.filter((n) => n.id !== editando?.id).map((n) => n.lugarId)), [negocios, editando])
  const [modo, setModo] = useState<'mapa' | 'nuevo'>(editando && editando.lugarId.startsWith(LUGAR_NEGOCIO) ? 'nuevo' : editando ? 'mapa' : 'mapa')
  const [busca, setBusca] = useState('')
  const [lugarId, setLugarId] = useState<string | null>(editando && !editando.lugarId.startsWith(LUGAR_NEGOCIO) ? editando.lugarId : null)
  const [nombre, setNombre] = useState(editando?.nombre ?? '')
  const [municipio, setMunicipio] = useState(editando?.municipio ?? '')
  const [tipo, setTipo] = useState<TipoReserva>(editando?.tipo ?? 'restaurante')
  const [cupo, setCupo] = useState(String(editando?.cupoDiario ?? 10))
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '')
  const [error, setError] = useState('')

  const candidatos = useMemo(() => {
    const q = norm(busca.trim())
    if (q.length < 2) return []
    return LUGARES.filter((l) => tipoReserva(l) !== null && !reclamados.has(l.id) && norm(l.nombre).includes(q)).slice(0, 8)
  }, [busca, reclamados])

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

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (modo === 'mapa' && !lugarId) return setError('Elige un lugar del mapa o registra uno nuevo.')
    if (modo === 'nuevo' && !municipio) return setError('Elige el municipio.')
    const r = guardarNegocio({
      id: editando?.id, lugarId: modo === 'mapa' ? lugarId : editando && editando.lugarId.startsWith(LUGAR_NEGOCIO) ? editando.lugarId : null,
      nombre, municipio, tipo, cupoDiario: Math.floor(Number(cupo)), descripcion: descripcion.trim(),
    })
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
      <div className="vd-field">
        <label htmlFor="pr-desc" className="vd-field-label">Descripción</label>
        <textarea id="pr-desc" className="pr-area" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <p className="pr-error" role="alert" aria-live="assertive">{error}</p>
      <div className="pr-acciones">
        <Button type="submit" variant="cta">{editando ? 'Guardar cambios' : 'Guardar negocio'}</Button>
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

function Reservas({ usuarioId }: { usuarioId: string }) {
  const datos = useDemo()
  const mios = datos.negocios.filter((n) => n.usuarioId === usuarioId)
  const [negId, setNegId] = useState('')
  const [filtro, setFiltro] = useState<EstadoReserva | 'todas'>('todas')
  const [error, setError] = useState('')
  const negocio = mios.find((n) => n.id === negId) ?? mios[0]

  const reservas = negocio ? datos.reservas.filter((r) => r.negocioId === negocio.id) : []
  const hoyStr = hoy()
  const pendientes = reservas.filter((r) => r.estado === 'pendiente').length
  const confirmadasHoy = reservas.filter((r) => r.estado === 'confirmada' && r.fecha === hoyStr).length
  const visibles = reservas
    .filter((r) => filtro === 'todas' || r.estado === filtro)
    .sort((a, b) => `${a.fecha} ${a.hora ?? ''}`.localeCompare(`${b.fecha} ${b.hora ?? ''}`))

  function mover(id: string, estado: EstadoReserva) {
    const r = cambiarEstado(id, estado)
    setError(r.ok ? '' : r.error)
  }

  return (
    <section className="pr-seccion" aria-labelledby="h-reservas">
      <h2 id="h-reservas" className="t-h2">Reservas</h2>
      {!negocio ? (
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
            <div className="pr-cifra"><strong>{cupoLibre(datos, negocio, hoyStr)}</strong><span>Cupo libre hoy</span></div>
          </div>
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
              {visibles.map((r) => <FilaReserva key={r.id} r={r} onMover={mover} />)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function FilaReserva({ r, onMover }: { r: Reserva; onMover: (id: string, e: EstadoReserva) => void }) {
  const c = contactoEnlace(r.contacto)
  const fecha = new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const cerrada = r.estado === 'rechazada' || r.estado === 'cancelada'
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
    </li>
  )
}
