// Contenido editable por el coordinador: acceso a lugares, eventos, embajadores y ajustes del sitio.
import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button, Chip, Option, TextField } from '../components/ui'
import { useCatalogo } from '../data/lugares'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import { refrescarAjustes } from '../state/ajustes'
import { fechaLarga, rangoFechas, refrescarEventos } from '../state/contenido'
import { DIAS_ISO, etiquetaDias } from '../state/logistica'
import { hoy } from '../state/reservas'

type Tablas = Database['public']['Tables']
type EventoFila = Tablas['eventos']['Row']
type EmbajadorFila = Tablas['embajadores']['Row']
type Franja = { dias: number[]; desde: string; hasta: string }
type Red = { nombre: string; url: string }

const mensajeDe = (e: { message?: string; code?: string } | null, defecto: string) =>
  !e ? '' : e.code === '42501' ? 'No tienes permiso para esto.' : `${defecto}${e.message ? ` (${e.message})` : ''}`

function Selector({ label, value, onChange, children, required }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; required?: boolean }) {
  const id = useId()
  return (
    <div className="vd-field">
      <label htmlFor={id} className="vd-field-label">{label}</label>
      <select id={id} className="vd-input pr-select" value={value} onChange={(e) => onChange(e.target.value)} required={required}>{children}</select>
    </div>
  )
}
function Area({ label, value, onChange, placeholder, max, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; rows?: number }) {
  const id = useId()
  return (
    <div className="vd-field">
      <label htmlFor={id} className="vd-field-label">{label}</label>
      <textarea id={id} className="pr-area" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} rows={rows} />
      {max && <span className="vd-field-msg">{value.length} de {max} caracteres.</span>}
    </div>
  )
}

// ---------- Acceso a lugares ----------
type LugarFila = { id: string; nombre: string; municipio: string; acceso: string | null; verificado_en: string | null; visible: boolean }
const PLANTILLA = `Cómo se llega: …
Propiedad privada: sí/no (a quién pedir permiso)
Requiere guía: sí/no
Dificultad: fácil / media / difícil (tiempo aproximado)`

export function AccesoLugares() {
  const { municipios } = useCatalogo()
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<LugarFila[]>([])
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const nombreMun = (s: string) => municipios.find((m) => m.slug === s)?.nombre ?? s

  const buscar = useCallback(async (texto: string) => {
    const t = texto.trim().replace(/[,()%*]/g, ' ').trim()
    if (t.length < 2) { setLista([]); setBuscado(false); setError(''); return }
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const slugs = municipios.filter((m) => norm(m.nombre).includes(norm(t))).map((m) => m.slug)
    const filtro = [`nombre.ilike.%${t}%`, ...(slugs.length ? [`municipio.in.(${slugs.join(',')})`] : [])].join(',')
    const { data, error: err } = await supabase!.from('lugares').select('id,nombre,municipio,acceso,verificado_en,visible').or(filtro).order('nombre').limit(25)
    setBuscado(true)
    if (err) setError(mensajeDe(err, 'No se pudo buscar.')); else { setLista(data); setError('') }
  }, [municipios])
  useEffect(() => { const h = setTimeout(() => buscar(q), 300); return () => clearTimeout(h) }, [q, buscar])

  return (
    <section className="pr-seccion" aria-labelledby="h-acceso">
      <h2 id="h-acceso" className="t-h2">Acceso a lugares</h2>
      <p className="sub">Cómo se llega, si es propiedad privada, si requiere guía y la dificultad. Se muestra en la ficha del lugar con la fecha de verificación.</p>
      <TextField label="Buscar lugar por nombre o municipio" type="search" value={q} onChange={(e) => setQ(e.target.value)} hint="Escribe al menos 2 letras." />
      <div aria-live="polite">
        {error && <p className="pr-error">{error}</p>}
        {buscado && !error && !lista.length && <p className="pr-nota">No encontramos lugares con ese texto.</p>}
        {lista.length === 25 && <p className="pr-nota">Mostramos los primeros 25: afina la búsqueda.</p>}
      </div>
      <ul className="pr-lista">
        {lista.map((l) => (
          <li key={l.id} className="pr-item">
            <h3 className="t-h3">{l.nombre}</h3>
            <div className="pr-meta">
              <span>{nombreMun(l.municipio)}</span>
              <Chip tone={l.acceso ? 'success' : 'soft'}>{l.acceso ? 'Con acceso' : 'Sin acceso escrito'}</Chip>
              {!l.visible && <Chip tone="danger">Oculto</Chip>}
            </div>
            {abierto === l.id
              ? <FormAcceso key={l.id} lugar={l} onCerrar={() => setAbierto(null)} onGuardado={(n) => { setLista((x) => x.map((y) => (y.id === n.id ? n : y))); setAbierto(null) }} />
              : <div className="pr-acciones"><Button variant="secondary" onClick={() => setAbierto(l.id)} aria-label={`Editar el acceso de ${l.nombre}`}>Editar acceso</Button></div>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function FormAcceso({ lugar, onCerrar, onGuardado }: { lugar: LugarFila; onCerrar: () => void; onGuardado: (l: LugarFila) => void }) {
  const [acceso, setAcceso] = useState(lugar.acceso ?? '')
  const [verifique, setVerifique] = useState(false)
  const [visible, setVisible] = useState(lugar.visible)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const texto = acceso.trim() || null
    const campos = { acceso: texto, visible, verificado_en: verifique ? hoy() : lugar.verificado_en }
    const { error: err } = await supabase!.from('lugares').update(campos).eq('id', lugar.id)
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudo guardar.'))
    onGuardado({ ...lugar, ...campos })
  }
  return (
    <form className="pr-form pr-form-negocio" onSubmit={enviar} aria-label={`Acceso de ${lugar.nombre}`}>
      <Area label="Acceso" value={acceso} onChange={setAcceso} placeholder={PLANTILLA} max={1200} rows={6} />
      <label className="pr-check"><input type="checkbox" checked={verifique} onChange={(e) => setVerifique(e.target.checked)} /> Verifiqué hoy (se guarda la fecha de hoy)</label>
      <label className="pr-check"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible en la app</label>
      <p className="pr-nota">Verificación actual: {lugar.verificado_en ? `verificado el ${fechaLarga(lugar.verificado_en)}` : 'sin verificar'}.</p>
      <div aria-live="polite">{error && <p className="pr-error">{error}</p>}</div>
      <div className="pr-acciones">
        <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar acceso'}</Button>
        <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
      </div>
    </form>
  )
}

// ---------- Eventos ----------
export function EventosPanel() {
  const { municipios } = useCatalogo()
  const [lista, setLista] = useState<EventoFila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<EventoFila | null>(null)
  const [abierto, setAbierto] = useState(false)
  const nombreMun = (s: string) => municipios.find((m) => m.slug === s)?.nombre ?? s

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase!.from('eventos').select('*').order('desde', { ascending: false }).limit(100)
    if (err) setError('No pudimos cargar los eventos. Revisa tu conexión.'); else { setLista(data); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const tras = async () => { await Promise.all([cargar(), refrescarEventos()]) }
  const borrar = async (e: EventoFila) => {
    const { error: err } = await supabase!.from('eventos').delete().eq('id', e.id)
    setError(mensajeDe(err, 'No se pudo borrar el evento.')); await tras()
  }
  return (
    <section className="pr-seccion" aria-labelledby="h-eventos">
      <h2 id="h-eventos" className="t-h2">Eventos</h2>
      <p className="sub">Fiestas y mercados por municipio. Aparecen en la portada («Este fin de semana en el Valle») y como aviso en los itinerarios de esa fecha.</p>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando eventos…</p>}
        {error && <p className="pr-error">{error}</p>}
      </div>
      {!cargando && !lista.length && <div className="pr-vacio"><p>Aún no hay eventos.</p></div>}
      <ul className="pr-lista">
        {lista.map((e) => (
          <li key={e.id} className="pr-item">
            <h3 className="t-h3">{e.nombre}</h3>
            <div className="pr-meta"><Chip tone="strong">{nombreMun(e.municipio)}</Chip><span>{rangoFechas(e)}</span></div>
            {e.descripcion && <p className="pr-nota">{e.descripcion}</p>}
            <p className="pr-nota">{e.fuente ? `Fuente: ${e.fuente} · ` : ''}{e.verificado_en ? `verificado el ${fechaLarga(e.verificado_en)}` : 'sin verificar'}</p>
            <div className="pr-acciones">
              <Button variant="secondary" onClick={() => { setEditando(e); setAbierto(true) }} aria-label={`Editar el evento ${e.nombre}`}>Editar</Button>
              <Button variant="ghost" onClick={() => borrar(e)} aria-label={`Borrar el evento ${e.nombre}`}>Borrar</Button>
            </div>
          </li>
        ))}
      </ul>
      {abierto
        ? <FormEvento key={editando?.id ?? 'nuevo'} editando={editando} onListo={async () => { setAbierto(false); setEditando(null); await tras() }} onCancelar={() => { setAbierto(false); setEditando(null) }} />
        : <div><Button variant="primary" onClick={() => setAbierto(true)}>Agregar evento</Button></div>}
    </section>
  )
}

function FormEvento({ editando, onListo, onCancelar }: { editando: EventoFila | null; onListo: () => void; onCancelar: () => void }) {
  const { municipios } = useCatalogo()
  const [municipio, setMunicipio] = useState(editando?.municipio ?? '')
  const [nombre, setNombre] = useState(editando?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '')
  const [desde, setDesde] = useState(editando?.desde ?? '')
  const [hasta, setHasta] = useState(editando?.hasta ?? '')
  const [fuente, setFuente] = useState(editando?.fuente ?? '')
  const [verifique, setVerifique] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!municipio) return setError('Elige el municipio.')
    if (!nombre.trim()) return setError('Escribe el nombre del evento.')
    if (!desde) return setError('Elige la fecha de inicio.')
    if (hasta && hasta < desde) return setError('«Hasta» no puede ser anterior a «Desde».')
    setGuardando(true); setError('')
    const campos = {
      municipio, nombre: nombre.trim(), descripcion: descripcion.trim() || null, desde, hasta: hasta || null, fuente: fuente.trim() || null,
      verificado_en: verifique ? hoy() : editando?.verificado_en ?? null,
    }
    const { error: err } = editando ? await supabase!.from('eventos').update(campos).eq('id', editando.id) : await supabase!.from('eventos').insert(campos)
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudo guardar el evento.'))
    onListo()
  }
  return (
    <form className="pr-form pr-form-negocio" onSubmit={enviar} aria-label={editando ? 'Editar evento' : 'Nuevo evento'}>
      <h3 className="t-h3">{editando ? `Editar ${editando.nombre}` : 'Nuevo evento'}</h3>
      <Selector label="Municipio" value={municipio} onChange={setMunicipio} required>
        <option value="">Elige un municipio</option>
        {municipios.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
      </Selector>
      <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required />
      <Area label="Descripción" value={descripcion} onChange={setDescripcion} max={500} />
      <TextField label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
      <TextField label="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} hint="Opcional. Vacío = un solo día." />
      <TextField label="Fuente del dato" value={fuente} onChange={(e) => setFuente(e.target.value)} hint="Por ejemplo: alcaldía, llamada del 12 de mayo." />
      <label className="pr-check"><input type="checkbox" checked={verifique} onChange={(e) => setVerifique(e.target.checked)} /> Verifiqué estos datos (se guarda la fecha de hoy)</label>
      {editando && <p className="pr-nota">Verificación actual: {editando.verificado_en ? `verificado el ${fechaLarga(editando.verificado_en)}` : 'sin verificar'}.</p>}
      <div aria-live="polite">{error && <p className="pr-error">{error}</p>}</div>
      <div className="pr-acciones">
        <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar evento'}</Button>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

// ---------- Embajadores ----------
const franjasDe = (h: unknown): Franja[] => (Array.isArray(h) ? (h as Franja[]).filter((f) => Array.isArray(f?.dias)) : [])

export function EmbajadoresPanel() {
  const { municipios } = useCatalogo()
  const [lista, setLista] = useState<EmbajadorFila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<EmbajadorFila | null>(null)
  const [abierto, setAbierto] = useState(false)
  const nombreMun = (s: string) => municipios.find((m) => m.slug === s)?.nombre ?? s
  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase!.from('embajadores').select('*').order('nombre')
    if (err) setError('No pudimos cargar los embajadores. Revisa tu conexión.'); else { setLista(data); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const alternar = async (e: EmbajadorFila) => {
    const { error: err } = await supabase!.from('embajadores').update({ activo: !e.activo }).eq('id', e.id)
    setError(mensajeDe(err, 'No se pudo cambiar el embajador.')); await cargar()
  }
  return (
    <section className="pr-seccion" aria-labelledby="h-emb">
      <h2 id="h-emb" className="t-h2">Embajadores</h2>
      <p className="sub">Voluntarios que atienden a los viajeros. Solo los activos son visibles, con su nombre y WhatsApp.</p>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando embajadores…</p>}
        {error && <p className="pr-error">{error}</p>}
      </div>
      {!cargando && !lista.length && <div className="pr-vacio"><p>Aún no hay embajadores.</p></div>}
      <ul className="pr-lista">
        {lista.map((e) => (
          <li key={e.id} className="pr-item">
            <h3 className="t-h3">{e.nombre}</h3>
            <div className="pr-meta">
              <Chip tone="strong">{nombreMun(e.municipio)}</Chip>
              <span>WhatsApp {e.whatsapp}</span>
              <Chip tone={e.activo ? 'success' : 'danger'}>{e.activo ? 'Activo' : 'Inactivo'}</Chip>
            </div>
            <p className="pr-nota">{franjasDe(e.horario).length
              ? franjasDe(e.horario).map((f) => `${etiquetaDias([...f.dias].sort())} ${f.desde} a ${f.hasta}`).join(' · ')
              : 'Sin horario: no aparece como disponible.'}</p>
            <div className="pr-acciones">
              <Button variant="secondary" onClick={() => { setEditando(e); setAbierto(true) }} aria-label={`Editar a ${e.nombre}`}>Editar</Button>
              <Button variant="ghost" onClick={() => alternar(e)} aria-label={`${e.activo ? 'Desactivar' : 'Activar'} a ${e.nombre}`}>{e.activo ? 'Desactivar' : 'Activar'}</Button>
            </div>
          </li>
        ))}
      </ul>
      {abierto
        ? <FormEmbajador key={editando?.id ?? 'nuevo'} editando={editando} onListo={async () => { setAbierto(false); setEditando(null); await cargar() }} onCancelar={() => { setAbierto(false); setEditando(null) }} />
        : <div><Button variant="primary" onClick={() => setAbierto(true)}>Agregar embajador</Button></div>}
    </section>
  )
}

function FormEmbajador({ editando, onListo, onCancelar }: { editando: EmbajadorFila | null; onListo: () => void; onCancelar: () => void }) {
  const { municipios } = useCatalogo()
  const [nombre, setNombre] = useState(editando?.nombre ?? '')
  const [municipio, setMunicipio] = useState(editando?.municipio ?? '')
  const [whatsapp, setWhatsapp] = useState(editando?.whatsapp ?? '')
  const [activo, setActivo] = useState(editando?.activo ?? true)
  const [franjas, setFranjas] = useState<Franja[]>(editando ? franjasDe(editando.horario) : [])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambiar = (i: number, p: Partial<Franja>) => setFranjas((x) => x.map((f, j) => (j === i ? { ...f, ...p } : f)))
  const alternarDia = (i: number, d: number) => cambiar(i, { dias: franjas[i].dias.includes(d) ? franjas[i].dias.filter((y) => y !== d) : [...franjas[i].dias, d].sort() })
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribe el nombre.')
    if (!municipio) return setError('Elige el municipio.')
    const wa = whatsapp.replace(/[^\d]/g, '')
    if (wa.length < 10) return setError('Escribe el WhatsApp con indicativo, solo números (por ejemplo 573001234567).')
    for (const [i, f] of franjas.entries()) {
      if (!f.dias.length) return setError(`Franja ${i + 1}: elige al menos un día.`)
      if (!f.desde || !f.hasta || f.hasta <= f.desde) return setError(`Franja ${i + 1}: «Hasta» debe ser posterior a «Desde».`)
    }
    setGuardando(true); setError('')
    const campos = { nombre: nombre.trim(), municipio, whatsapp: wa, activo, horario: franjas }
    const { error: err } = editando ? await supabase!.from('embajadores').update(campos).eq('id', editando.id) : await supabase!.from('embajadores').insert(campos)
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudo guardar el embajador.'))
    onListo()
  }
  return (
    <form className="pr-form pr-form-negocio" onSubmit={enviar} aria-label={editando ? 'Editar embajador' : 'Nuevo embajador'}>
      <h3 className="t-h3">{editando ? `Editar a ${editando.nombre}` : 'Nuevo embajador'}</h3>
      <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required />
      <Selector label="Municipio" value={municipio} onChange={setMunicipio} required>
        <option value="">Elige un municipio</option>
        {municipios.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
      </Selector>
      <TextField label="WhatsApp" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} hint="Con indicativo del país, por ejemplo 573001234567." required />
      <fieldset className="co-franjas">
        <legend className="vd-field-label">Horario de atención</legend>
        {!franjas.length && <p className="pr-nota">Sin franjas: no aparecerá como disponible.</p>}
        {franjas.map((f, i) => (
          <div key={i} className="co-franja">
            <div role="group" aria-label={`Días de la franja ${i + 1}`} className="co-dias">
              {DIAS_ISO.map(([n, c]) => <Option key={n} selected={f.dias.includes(n)} onClick={() => alternarDia(i, n)}>{c}</Option>)}
            </div>
            <TextField label={`Franja ${i + 1}: desde`} type="time" value={f.desde} onChange={(e) => cambiar(i, { desde: e.target.value })} />
            <TextField label={`Franja ${i + 1}: hasta`} type="time" value={f.hasta} onChange={(e) => cambiar(i, { hasta: e.target.value })} />
            <div><Button variant="ghost" onClick={() => setFranjas((x) => x.filter((_, j) => j !== i))} aria-label={`Quitar la franja ${i + 1}`}>Quitar franja</Button></div>
          </div>
        ))}
        <div><Button variant="secondary" onClick={() => setFranjas((x) => [...x, { dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '17:00' }])}>Agregar franja</Button></div>
      </fieldset>
      <label className="pr-check"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo (visible para viajeros)</label>
      <div aria-live="polite">{error && <p className="pr-error">{error}</p>}</div>
      <div className="pr-acciones">
        <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar embajador'}</Button>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

// ---------- Ajustes del sitio ----------
export function AjustesPanel() {
  const [cargando, setCargando] = useState(true)
  const [whatsapp, setWhatsapp] = useState('')
  const [correo, setCorreo] = useState('')
  const [horario, setHorario] = useState('')
  const [redes, setRedes] = useState<Red[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase!.from('ajustes').select('clave,valor').then(({ data, error: err }) => {
      if (err) setError('No pudimos cargar los ajustes. Revisa tu conexión.')
      else {
        const m = Object.fromEntries((data ?? []).map((f) => [f.clave, f.valor])) as Record<string, any>
        setWhatsapp(m.contacto?.whatsapp ?? ''); setCorreo(m.contacto?.correo ?? ''); setHorario(m.horario_embajadores?.texto ?? '')
        setRedes(Array.isArray(m.redes) ? m.redes.map((r: Partial<Red>) => ({ nombre: r?.nombre ?? '', url: r?.url ?? '' })) : [])
      }
      setCargando(false)
    })
  }, [])
  const cambiar = (i: number, p: Partial<Red>) => setRedes((x) => x.map((r, j) => (j === i ? { ...r, ...p } : r)))

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setOk(''); setError('')
    const wa = whatsapp.replace(/[^\d]/g, '')
    if (whatsapp.trim() && wa.length < 10) return setError('El WhatsApp debe llevar indicativo y solo números (por ejemplo 573001234567).')
    for (const r of redes) {
      if (!r.nombre.trim() || !/^https?:\/\//i.test(r.url.trim())) return setError('Cada red necesita un nombre y un enlace que empiece por https://')
    }
    setGuardando(true)
    const { error: err } = await supabase!.from('ajustes').upsert([
      { clave: 'contacto', valor: { whatsapp: wa, correo: correo.trim() } },
      { clave: 'horario_embajadores', valor: { texto: horario.trim() } },
      { clave: 'redes', valor: redes.map((r) => ({ nombre: r.nombre.trim(), url: r.url.trim() })) },
    ])
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudieron guardar los ajustes.'))
    refrescarAjustes()
    setOk('Ajustes guardados. Ya se ven en el pie de la app. Las líneas vacías se ocultan.')
  }
  return (
    <section className="pr-seccion" aria-labelledby="h-ajustes">
      <h2 id="h-ajustes" className="t-h2">Ajustes del sitio</h2>
      <p className="sub">Contacto, horario de los embajadores y redes. Si dejas un dato vacío, la app oculta esa línea.</p>
      {cargando ? <p className="pr-nota" role="status">Cargando ajustes…</p> : (
        <form className="pr-form pr-form-negocio" onSubmit={guardar} aria-label="Ajustes del sitio">
          <TextField label="WhatsApp de contacto" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} hint="Con indicativo, solo números." />
          <TextField label="Correo de contacto" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          <TextField label="Horario de los embajadores" value={horario} onChange={(e) => setHorario(e.target.value)} hint="Por ejemplo: lunes a sábado, 8:00 a 17:00." maxLength={160} />
          <fieldset className="co-franjas">
            <legend className="vd-field-label">Redes sociales</legend>
            {!redes.length && <p className="pr-nota">Sin redes: no se muestra la línea.</p>}
            {redes.map((r, i) => (
              <div key={i} className="co-franja">
                <TextField label={`Red ${i + 1}: nombre`} value={r.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} maxLength={40} />
                <TextField label={`Red ${i + 1}: enlace`} type="url" inputMode="url" value={r.url} onChange={(e) => cambiar(i, { url: e.target.value })} />
                <div><Button variant="ghost" onClick={() => setRedes((x) => x.filter((_, j) => j !== i))} aria-label={`Quitar la red ${i + 1}`}>Quitar red</Button></div>
              </div>
            ))}
            <div><Button variant="secondary" onClick={() => setRedes((x) => [...x, { nombre: '', url: '' }])}>Agregar red</Button></div>
          </fieldset>
          <div aria-live="polite">{error && <p className="pr-error">{error}</p>}{ok && <p className="pr-ok">{ok}</p>}</div>
          <div><Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</Button></div>
        </form>
      )}
    </section>
  )
}
