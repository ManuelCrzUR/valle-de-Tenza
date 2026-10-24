import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, Chip, Option, TextField } from '../components/ui'
import { TIPOS_RESERVA, useCatalogo } from '../data/lugares'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import { DIAS_ISO, NOMBRE_MODO, NOMBRE_TIPO_ALERTA, etiquetaDias, fechaVerificada, refrescarLogistica, useRol } from '../state/logistica'
import type { ModoTransporte, TipoAlerta } from '../state/logistica'
import { hoy, salir, useSesionLista, useUsuario } from '../state/reservas'
import CoordinadorMetricas from './CoordinadorMetricas'
import CoordinadorResenas from './CoordinadorResenas'
import { AccesoLugares, AjustesPanel, EmbajadoresPanel, EventosPanel } from './CoordinadorContenido'
import { usePagina } from '../usePagina'
import '../styles/prestador.css'
import '../styles/coordinador.css'

type Tablas = Database['public']['Tables']
type Ruta = Tablas['rutas_transporte']['Row']
type Salida = Tablas['salidas']['Row']
type Alerta = Tablas['alertas_via']['Row']
type NegocioFila = Pick<Tablas['negocios']['Row'], 'id' | 'nombre' | 'municipio' | 'tipo' | 'lugar_id' | 'verificado' | 'activo'>

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RESERVA.map((t) => [t.id, t.etiqueta]))
const mensajeDe = (e: { message?: string; code?: string } | null, defecto: string) =>
  !e ? '' : e.code === '23505' ? 'Ya existe una salida con esa hora en esta ruta.' : e.code === '42501' ? 'No tienes permiso para esto.' : `${defecto}${e.message ? ` (${e.message})` : ''}`
// «AAAA-MM-DDTHH:mm» local ↔ ISO
const aLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Selector({ label, value, onChange, children, required }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; required?: boolean }) {
  const id = useId()
  return (
    <div className="vd-field">
      <label htmlFor={id} className="vd-field-label">{label}</label>
      <select id={id} className="vd-input pr-select" value={value} onChange={(e) => onChange(e.target.value)} required={required}>{children}</select>
    </div>
  )
}

export default function Coordinador() {
  usePagina('Panel del coordinador')
  const usuario = useUsuario()
  const lista = useSesionLista()
  const rol = useRol()
  if (!lista || (usuario && rol === undefined)) return <div className="wrap pagina"><p className="sub" role="status">Cargando tu sesión…</p></div>
  if (!usuario || (rol !== 'coordinador' && rol !== 'admin')) return <Navigate to="/prestadores" replace />
  return (
    <div className="wrap pagina">
      <div className="pr-cab">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Panel del coordinador</h1>
        <div className="pr-acciones">
          <Link className="vd-btn vd-btn-ghost" to="/prestadores/panel">Mi panel de prestador</Link>
          <Button variant="secondary" onClick={salir}>Cerrar sesión</Button>
        </div>
      </div>
      <p className="sub">Demanda y operación, rutas de transporte, salidas, avisos de la vía, revisión de negocios, acceso a lugares, eventos, embajadores y ajustes del sitio. Lo que guardas se ve de inmediato en la app.</p>
      <CoordinadorMetricas />
      <Rutas />
      <Alertas />
      <Negocios />
      <CoordinadorResenas />
      <AccesoLugares />
      <EventosPanel />
      <EmbajadoresPanel />
      <AjustesPanel />
    </div>
  )
}

// ---------- Rutas y salidas ----------
function Rutas() {
  const { municipios } = useCatalogo()
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [salidas, setSalidas] = useState<Salida[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Ruta | null>(null)
  const [abierto, setAbierto] = useState(false)
  const nombre = (s: string) => (s === 'bogota' ? 'Bogotá' : municipios.find((m) => m.slug === s)?.nombre ?? s)

  const cargar = useCallback(async () => {
    const [r, s] = await Promise.all([supabase!.from('rutas_transporte').select('*').order('empresa'), supabase!.from('salidas').select('*').order('hora')])
    if (r.error || s.error) setError('No pudimos cargar las rutas. Revisa tu conexión.')
    else { setRutas(r.data); setSalidas(s.data); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const tras = async (e: { message?: string; code?: string } | null, defecto: string) => {
    setError(mensajeDe(e, defecto))
    await Promise.all([cargar(), refrescarLogistica()])
    return !e
  }
  const alternar = async (r: Ruta) => { await tras((await supabase!.from('rutas_transporte').update({ activa: !r.activa }).eq('id', r.id)).error, 'No se pudo cambiar la ruta.') }

  return (
    <section className="pr-seccion" aria-labelledby="h-rutas">
      <h2 id="h-rutas" className="t-h2">Rutas de transporte</h2>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando rutas…</p>}
        {error && <p className="pr-error">{error}</p>}
      </div>
      {!cargando && !rutas.length && <div className="pr-vacio"><p>Aún no hay rutas.</p></div>}
      <ul className="pr-lista">
        {rutas.map((r) => (
          <li key={r.id} className="pr-item">
            <h3 className="t-h3">{r.empresa}</h3>
            <div className="pr-meta">
              <Chip tone="strong">{NOMBRE_MODO[r.modo]}</Chip>
              <span>{nombre(r.origen)} → {nombre(r.destino)}</span>
              <Chip tone={r.activa ? 'success' : 'danger'}>{r.activa ? 'Activa' : 'Desactivada'}</Chip>
            </div>
            <p className="pr-nota">
              {r.terminal ?? 'Terminal por confirmar'} · {r.duracion_min ? `${r.duracion_min} min` : 'duración por confirmar'} · {r.precio_desde_cop !== null ? `desde $${r.precio_desde_cop.toLocaleString('es-CO')}` : 'precio por confirmar'} · {fechaVerificada(r.verificado_en)}
            </p>
            <div className="pr-acciones">
              <Button variant="secondary" onClick={() => { setEditando(r); setAbierto(true) }} aria-label={`Editar ruta de ${r.empresa}`}>Editar</Button>
              <Button variant="ghost" onClick={() => alternar(r)} aria-label={`${r.activa ? 'Desactivar' : 'Activar'} ruta de ${r.empresa}`}>{r.activa ? 'Desactivar' : 'Activar'}</Button>
            </div>
            <SalidasDeRuta ruta={r} salidas={salidas.filter((s) => s.ruta_id === r.id)} tras={tras} />
          </li>
        ))}
      </ul>
      {abierto
        ? <FormRuta key={editando?.id ?? 'nueva'} editando={editando} nombre={nombre} onListo={async () => { setAbierto(false); setEditando(null); await Promise.all([cargar(), refrescarLogistica()]) }} onCancelar={() => { setAbierto(false); setEditando(null) }} />
        : <div><Button variant="primary" onClick={() => setAbierto(true)}>Agregar ruta</Button></div>}
    </section>
  )
}

function FormRuta({ editando, nombre, onListo, onCancelar }: { editando: Ruta | null; nombre: (s: string) => string; onListo: () => void; onCancelar: () => void }) {
  const { municipios } = useCatalogo()
  const [origen, setOrigen] = useState(editando?.origen ?? 'bogota')
  const [destino, setDestino] = useState(editando?.destino ?? 'guateque')
  const [empresa, setEmpresa] = useState(editando?.empresa ?? '')
  const [modo, setModo] = useState<ModoTransporte>(editando?.modo ?? 'bus')
  const [terminal, setTerminal] = useState(editando?.terminal ?? '')
  const [duracion, setDuracion] = useState(editando?.duracion_min?.toString() ?? '')
  const [precio, setPrecio] = useState(editando?.precio_desde_cop?.toString() ?? '')
  const [notas, setNotas] = useState(editando?.notas ?? '')
  const [fuente, setFuente] = useState(editando?.fuente ?? '')
  const [activa, setActiva] = useState(editando?.activa ?? true)
  const [verifique, setVerifique] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const opciones = (conBogota: boolean) => <>{conBogota && <option value="bogota">Bogotá</option>}{municipios.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}</>

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (origen === destino) return setError('El origen y el destino deben ser distintos.')
    if (!empresa.trim()) return setError('Escribe el nombre de la empresa.')
    const d = duracion.trim() === '' ? null : Number(duracion)
    const p = precio.trim() === '' ? null : Number(precio)
    if (d !== null && !(Number.isInteger(d) && d > 0)) return setError('La duración debe ser un número entero de minutos mayor que 0.')
    if (p !== null && !(Number.isInteger(p) && p >= 0)) return setError('El precio debe ser un número entero en pesos.')
    setGuardando(true); setError('')
    const campos = {
      origen, destino, empresa: empresa.trim(), modo, terminal: terminal.trim() || null, duracion_min: d, precio_desde_cop: p,
      notas: notas.trim() || null, fuente: fuente.trim() || null, activa,
      verificado_en: verifique ? hoy() : editando?.verificado_en ?? null,
    }
    const { error: err } = editando
      ? await supabase!.from('rutas_transporte').update(campos).eq('id', editando.id)
      : await supabase!.from('rutas_transporte').insert(campos)
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudo guardar la ruta.'))
    onListo()
  }
  return (
    <form className="pr-form pr-form-negocio" onSubmit={enviar} aria-label={editando ? 'Editar ruta' : 'Nueva ruta'}>
      <h3 className="t-h3">{editando ? `Editar ruta de ${editando.empresa}` : 'Nueva ruta'}</h3>
      <Selector label="Origen" value={origen} onChange={setOrigen}>{opciones(true)}</Selector>
      <Selector label="Destino" value={destino} onChange={setDestino}>{opciones(true)}</Selector>
      <TextField label="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={120} required />
      <Selector label="Modo" value={modo} onChange={(v) => setModo(v as ModoTransporte)}>
        {(Object.keys(NOMBRE_MODO) as ModoTransporte[]).map((m) => <option key={m} value={m}>{NOMBRE_MODO[m]}</option>)}
      </Selector>
      <TextField label="Terminal" value={terminal} onChange={(e) => setTerminal(e.target.value)} hint="Déjalo vacío si no lo sabes: se muestra «por confirmar»." />
      <TextField label="Duración (minutos)" type="number" inputMode="numeric" min={1} value={duracion} onChange={(e) => setDuracion(e.target.value)} hint="Vacío = por confirmar." />
      <TextField label="Precio desde (COP)" type="number" inputMode="numeric" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} hint="Vacío = por confirmar." />
      <div className="vd-field">
        <label htmlFor="ruta-notas" className="vd-field-label">Notas</label>
        <textarea id="ruta-notas" className="pr-area" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <TextField label="Fuente del dato" value={fuente} onChange={(e) => setFuente(e.target.value)} hint="Por ejemplo: llamada a la empresa, el 12 de mayo." />
      <label className="pr-check"><input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Ruta activa (visible para viajeros)</label>
      <label className="pr-check"><input type="checkbox" checked={verifique} onChange={(e) => setVerifique(e.target.checked)} /> Verifiqué estos datos (se guarda la fecha de hoy)</label>
      {editando && <p className="pr-nota">Verificación actual: {fechaVerificada(editando.verificado_en)}. Trayecto: {nombre(editando.origen)} → {nombre(editando.destino)}.</p>}
      <div aria-live="polite">{error && <p className="pr-error">{error}</p>}</div>
      <div className="pr-acciones">
        <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ruta'}</Button>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

function SalidasDeRuta({ ruta, salidas, tras }: { ruta: Ruta; salidas: Salida[]; tras: (e: { message?: string; code?: string } | null, defecto: string) => Promise<boolean> }) {
  const [hora, setHora] = useState('')
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5, 6, 7])
  const [error, setError] = useState('')
  const alternar = (d: number) => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))
  const agregar = async (e: FormEvent) => {
    e.preventDefault()
    if (!hora) return setError('Elige la hora de salida.')
    if (!dias.length) return setError('Elige al menos un día.')
    setError('')
    const ok = await tras((await supabase!.from('salidas').insert({ ruta_id: ruta.id, hora, dias_semana: dias })).error, 'No se pudo guardar la salida.')
    if (ok) setHora('')
  }
  return (
    <div className="co-salidas">
      <h4 className="it-rol">Salidas</h4>
      {salidas.length ? (
        <ul className="pr-lista">
          {salidas.map((s) => (
            <li key={s.id} className="co-salida">
              <span><strong>{s.hora.slice(0, 5)}</strong> · {etiquetaDias([...s.dias_semana].sort())}</span>
              <Button variant="ghost" onClick={async () => { await tras((await supabase!.from('salidas').delete().eq('id', s.id)).error, 'No se pudo quitar la salida.') }}
                aria-label={`Quitar la salida de las ${s.hora.slice(0, 5)} de ${ruta.empresa}`}>Quitar</Button>
            </li>
          ))}
        </ul>
      ) : <p className="pr-nota">Sin salidas registradas: se muestra «horarios por confirmar».</p>}
      <form onSubmit={agregar} className="pr-form" aria-label={`Agregar salida a ${ruta.empresa}`}>
        <TextField label="Hora de salida" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        <div role="group" aria-label="Días de la semana" className="co-dias">
          {DIAS_ISO.map(([n, c]) => <Option key={n} selected={dias.includes(n)} onClick={() => alternar(n)}>{c}</Option>)}
        </div>
        <div aria-live="polite">{error && <p className="pr-error">{error}</p>}</div>
        <div><Button type="submit" variant="secondary">Agregar salida</Button></div>
      </form>
    </div>
  )
}

// ---------- Alertas de vía ----------
function Alertas() {
  const { municipios } = useCatalogo()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [tipo, setTipo] = useState<TipoAlerta>('derrumbe')
  const [municipio, setMunicipio] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [desde, setDesde] = useState(() => aLocal(new Date().toISOString()))
  const [hasta, setHasta] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase!.from('alertas_via').select('*').order('desde', { ascending: false })
    if (err) setError('No pudimos cargar las alertas. Revisa tu conexión.'); else { setAlertas(data); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const tras = async (e: { message?: string; code?: string } | null, defecto: string) => { setError(mensajeDe(e, defecto)); await Promise.all([cargar(), refrescarLogistica()]) }

  const crear = async (e: FormEvent) => {
    e.preventDefault()
    setOk(''); setError('')
    if (!mensaje.trim()) return setError('Escribe el mensaje de la alerta.')
    if (!desde) return setError('Elige desde cuándo aplica.')
    if (hasta && new Date(hasta) <= new Date(desde)) return setError('«Hasta» debe ser posterior a «Desde».')
    setGuardando(true)
    const { error: err } = await supabase!.from('alertas_via').insert({
      tipo, municipio: municipio || null, mensaje: mensaje.trim(), desde: new Date(desde).toISOString(), hasta: hasta ? new Date(hasta).toISOString() : null,
    })
    setGuardando(false)
    if (err) return setError(mensajeDe(err, 'No se pudo guardar la alerta.'))
    setMensaje(''); setHasta(''); setOk('Alerta publicada. Ya se ve en el mapa y en los itinerarios.')
    await Promise.all([cargar(), refrescarLogistica()])
  }
  const vigente = (a: Alerta) => Date.parse(a.desde) <= Date.now() && (!a.hasta || Date.parse(a.hasta) > Date.now())
  const nombre = (s: string | null) => (s ? municipios.find((m) => m.slug === s)?.nombre ?? s : 'Toda la vía')

  return (
    <section className="pr-seccion" aria-labelledby="h-alertas">
      <h2 id="h-alertas" className="t-h2">Alertas de la vía</h2>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando alertas…</p>}
        {error && <p className="pr-error">{error}</p>}
        {ok && <p className="pr-ok">{ok}</p>}
      </div>
      {!cargando && !alertas.length && <div className="pr-vacio"><p>No hay alertas.</p></div>}
      <ul className="pr-lista">
        {alertas.map((a) => (
          <li key={a.id} className="pr-item">
            <div className="pr-meta">
              <Chip tone="strong">{NOMBRE_TIPO_ALERTA[a.tipo]}</Chip>
              <span>{nombre(a.municipio)}</span>
              <Chip tone={vigente(a) ? 'success' : 'soft'}>{vigente(a) ? 'Vigente' : Date.parse(a.desde) > Date.now() ? 'Programada' : 'Terminada'}</Chip>
            </div>
            <p className="pr-nota">{a.mensaje}</p>
            <p className="pr-meta">Desde {fechaHora(a.desde)}{a.hasta ? ` · hasta ${fechaHora(a.hasta)}` : ' · sin fecha de fin'}</p>
            <div className="pr-acciones">
              {vigente(a) && <Button variant="secondary" onClick={async () => { await tras((await supabase!.from('alertas_via').update({ hasta: new Date().toISOString() }).eq('id', a.id)).error, 'No se pudo terminar la alerta.') }}
                aria-label={`Terminar ahora la alerta: ${a.mensaje.slice(0, 40)}`}>Terminar ahora</Button>}
              <Button variant="ghost" onClick={async () => { await tras((await supabase!.from('alertas_via').delete().eq('id', a.id)).error, 'No se pudo borrar la alerta.') }}
                aria-label={`Borrar la alerta: ${a.mensaje.slice(0, 40)}`}>Borrar</Button>
            </div>
          </li>
        ))}
      </ul>
      <form className="pr-form pr-form-negocio" onSubmit={crear} aria-label="Nueva alerta">
        <h3 className="t-h3">Nueva alerta</h3>
        <Selector label="Tipo" value={tipo} onChange={(v) => setTipo(v as TipoAlerta)}>
          {(Object.keys(NOMBRE_TIPO_ALERTA) as TipoAlerta[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO_ALERTA[t]}</option>)}
        </Selector>
        <Selector label="Municipio" value={municipio} onChange={setMunicipio}>
          <option value="">Toda la vía (sin municipio)</option>
          {municipios.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
        </Selector>
        <div className="vd-field">
          <label htmlFor="alerta-msg" className="vd-field-label">Mensaje</label>
          <textarea id="alerta-msg" className="pr-area" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={500} required />
          <span className="vd-field-msg">{mensaje.length} de 500 caracteres.</span>
        </div>
        <TextField label="Desde" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} required />
        <TextField label="Hasta" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} hint="Opcional. Vacío = hasta que la termines." />
        <div><Button type="submit" variant="cta" disabled={guardando}>{guardando ? 'Publicando…' : 'Publicar alerta'}</Button></div>
      </form>
    </section>
  )
}

// ---------- Negocios ----------
function Negocios() {
  const { municipios, lugares } = useCatalogo()
  const [lista, setLista] = useState<NegocioFila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [liberando, setLiberando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase!.from('negocios').select('id,nombre,municipio,tipo,lugar_id,verificado,activo').order('nombre')
    if (err) setError('No pudimos cargar los negocios. Revisa tu conexión.'); else { setLista(data); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const ejecutar = async (f: 'verificar_negocio' | 'liberar_lugar_negocio', args: Database['public']['Functions'][typeof f]['Args'], defecto: string) => {
    const { error: err } = await supabase!.rpc(f, args as never)
    setError(mensajeDe(err, defecto)); setLiberando(null)
    await cargar()
  }
  return (
    <section className="pr-seccion" aria-labelledby="h-neg">
      <h2 id="h-neg" className="t-h2">Negocios</h2>
      <p className="sub">Verifica que el negocio sea de quien lo registró. Si reclamó un lugar del mapa que no es suyo, libéralo.</p>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando negocios…</p>}
        {error && <p className="pr-error">{error}</p>}
      </div>
      {!cargando && !lista.length && <div className="pr-vacio"><p>Aún no hay negocios registrados.</p></div>}
      <ul className="pr-lista">
        {lista.map((n) => {
          const lugar = n.lugar_id ? lugares.find((l) => l.id === n.lugar_id) : undefined
          return (
            <li key={n.id} className="pr-item">
              <h3 className="t-h3">{n.nombre}</h3>
              <div className="pr-meta">
                <Chip tone="strong">{ETIQUETA_TIPO[n.tipo]}</Chip>
                <span>{municipios.find((m) => m.slug === n.municipio)?.nombre ?? n.municipio}</span>
                <Chip tone={n.verificado ? 'success' : 'soft'}>{n.verificado ? 'Verificado' : 'Sin verificar'}</Chip>
                {!n.activo && <Chip tone="danger">Inactivo</Chip>}
              </div>
              <p className="pr-nota">{n.lugar_id ? `Lugar del mapa: ${lugar?.nombre ?? n.lugar_id}` : 'No reclama ningún lugar del mapa.'}</p>
              {liberando === n.id ? (
                <div className="pr-confirma" role="group" aria-label={`Confirmar liberar el lugar de ${n.nombre}`}>
                  <p>¿Liberar «{lugar?.nombre ?? n.lugar_id}» del negocio «{n.nombre}»? El negocio queda sin lugar en el mapa y sin verificar.</p>
                  <Button variant="cta" onClick={() => ejecutar('liberar_lugar_negocio', { p_negocio: n.id }, 'No se pudo liberar el lugar.')}>Sí, liberar</Button>
                  <Button variant="ghost" onClick={() => setLiberando(null)}>Cancelar</Button>
                </div>
              ) : (
                <div className="pr-acciones">
                  <Button variant="secondary" onClick={() => ejecutar('verificar_negocio', { p_negocio: n.id, p_verificado: !n.verificado }, 'No se pudo cambiar la verificación.')}
                    aria-label={`${n.verificado ? 'Quitar verificación de' : 'Verificar'} ${n.nombre}`}>{n.verificado ? 'Quitar verificación' : 'Verificar'}</Button>
                  {n.lugar_id && <Button variant="ghost" onClick={() => setLiberando(n.id)} aria-label={`Liberar el lugar del mapa de ${n.nombre}`}>Liberar lugar del mapa</Button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
