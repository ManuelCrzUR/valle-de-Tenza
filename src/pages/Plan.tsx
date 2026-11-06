import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Chip, Option, TextField } from '../components/ui'
import { Cargando } from '../components/Cargando'
import { MUNICIPIOS, NOMBRE_MUNICIPIO, getLugar, tieneUbicacion } from '../data/lugares'
import { PLANES } from '../data/planes'
import type { Categoria } from '../data/planes'
import { distanciasRuta, km, ordenRuta } from '../data/generarPlan'
import { usePlan } from '../state/plan'
import type { PlanDto } from '../state/plan'
import { usePagina } from '../usePagina'
import { AUDIO_MAX_BYTES, AUDIO_MAX_MS, TEXTO_MAX } from '../../shared/constantes'
import '../styles/itinerario.css'
import '../styles/plan.css'

const MapaRuta = lazy(() => import('../components/mapa/MapaRuta'))

type Chips = { plan: Categoria; dias: number; municipio: string }
const VACIO: Chips = { plan: 'aventura', dias: 2, municipio: '' }

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; data: T | null }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const data = await r.json().catch(() => null) as T | null
  return { status: r.status, data }
}

export default function Plan() {
  usePagina('Armar mi plan')
  const { plan, guardar } = usePlan()
  const [params] = useSearchParams()
  const lugarInicial = getLugar(params.get('lugar') ?? undefined)
  const [texto, setTexto] = useState(lugarInicial ? `Quiero incluir ${lugarInicial.nombre} en el recorrido.` : '')
  const [chips, setChips] = useState<Chips>(VACIO)
  const [cargando, setCargando] = useState(false)
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [corrida, setCorrida] = useState(0)
  const [mic, setMic] = useState<'listo' | 'grabando' | 'enviando' | 'denegado' | 'sin_config' | 'error'>('listo')
  const [voz, setVoz] = useState<'idle' | 'cargando' | 'sonando' | 'sin_config' | 'error'>('idle')
  const rec = useRef<MediaRecorder | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const abortar = useRef<AbortController | null>(null)
  const [clave, setClave] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState({ nombre: '', correo: '', telefono: '', fecha: '', personas: '2', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [recibo, setRecibo] = useState<{ persistido: boolean; comprobante: string; mensaje: string } | null>(null)
  const [proveedores, setProveedores] = useState<{ openai: boolean; supabase: boolean; resend: boolean; modo: string } | null>(null)

  useEffect(() => () => { abortar.current?.abort(); rec.current?.stop(); audio.current?.pause() }, [])
  useEffect(() => {
    fetch('/api/estado').then((r) => r.json()).then(setProveedores).catch(() => setProveedores(null))
  }, [])
  useEffect(() => {
    if (!cargando) return
    setPaso(0)
    const id = window.setInterval(() => setPaso((p) => Math.min(2, p + 1)), 700)
    return () => window.clearInterval(id)
  }, [cargando])

  async function generar(mensaje: string, extra?: { quitar?: string }) {
    setError('')
    setRecibo(null)
    setCargando(true)
    abortar.current?.abort()
    const ctl = new AbortController()
    abortar.current = ctl
    try {
      const { status, data } = await postJson<{ itinerario?: PlanDto; mensaje?: string }>('/api/itinerario', {
        mensaje, anclar: extra?.quitar || plan ? undefined : lugarInicial?.id, chips: { ...chips, ...extra }, itinerario: plan?.dto,
      }, ctl.signal)
      if (!data?.itinerario) { setError(data?.mensaje || (status === 0 ? 'No hay conexión con el servidor.' : 'No pude armar el plan.')); return }
      guardar(data.itinerario)
      setCorrida((c) => c + 1)
      setSel(null)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('plan-resultado')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Se cortó la generación. Puedes intentar otra vez.')
    } finally { setCargando(false) }
  }

  async function alternarMic() {
    if (mic === 'grabando') { rec.current?.stop(); return }
    setMic('listo')
    if (!navigator.mediaDevices?.getUserMedia) { setMic('error'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
      if (!mime) { stream.getTracks().forEach((t) => t.stop()); setMic('error'); return }
      const mr = new MediaRecorder(stream, { mimeType: mime })
      const trozos: Blob[] = []
      mr.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(trozos, { type: mime })
        void subirAudio(blob, mime.split(';')[0])
      }
      rec.current = mr
      mr.start()
      setMic('grabando')
      window.setTimeout(() => { if (mr.state === 'recording') mr.stop() }, AUDIO_MAX_MS)
    } catch (e) {
      const nombre = (e as Error).name
      setMic(nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError' ? 'denegado' : 'error')
    }
  }

  async function subirAudio(blob: Blob, tipo: string) {
    if (blob.size > AUDIO_MAX_BYTES) { setMic('error'); setError('El audio supera 3,5 MB. Escríbelo o graba menos tiempo.'); return }
    if (!blob.size) { setMic('error'); return }
    setMic('enviando')
    try {
      const r = await fetch('/api/transcribir', { method: 'POST', headers: { 'content-type': tipo }, body: blob })
      const data = await r.json().catch(() => null) as { texto?: string; error?: string; mensaje?: string } | null
      if (r.status === 503 || data?.error === 'no_configurado') { setMic('sin_config'); return }
      if (!r.ok || !data?.texto) { setMic('error'); setError(data?.mensaje || 'No se transcribió. Escribe el plan.'); return }
      setTexto(data.texto.slice(0, TEXTO_MAX))
      setMic('listo')
    } catch { setMic('error') }
  }

  async function escuchar() {
    if (voz === 'sonando') { audio.current?.pause(); setVoz('idle'); return }
    if (!plan) return
    setVoz('cargando')
    try {
      const r = await fetch('/api/voz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: plan.dto.resumen }) })
      if (r.status === 503) { setVoz('sin_config'); return }
      if (!r.ok) { setVoz('error'); return }
      const url = URL.createObjectURL(await r.blob())
      const a = new Audio(url)
      audio.current = a
      a.onended = () => { setVoz('idle'); URL.revokeObjectURL(url) }
      await a.play()
      setVoz('sonando')
    } catch { setVoz('error') }
  }

  async function enviarSolicitud(e: FormEvent) {
    e.preventDefault()
    if (!plan) return
    setEnviando(true)
    setError('')
    try {
      const { data, status } = await postJson<{ persistido?: boolean; comprobante?: string; mensaje?: string }>('/api/solicitudes', {
        idempotencyKey: clave,
        ...form,
        personas: Number(form.personas),
        itinerario: plan.dto,
      })
      if (!data?.mensaje || status >= 400) { setError(data?.mensaje || 'No se pudo enviar la solicitud.'); return }
      setRecibo({ persistido: !!data.persistido, comprobante: data.comprobante || 'no_enviado', mensaje: data.mensaje })
      setClave(crypto.randomUUID())
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('plan-recibo')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }))
    } catch { setError('No hay conexión con el servidor.') }
    finally { setEnviando(false) }
  }

  const dto = plan?.dto
  const it = plan?.itinerario
  const pasos = it ? ordenRuta(it) : []
  const dist = distanciasRuta(pasos)
  const puntos = pasos.flatMap((p, i) => (tieneUbicacion(p.lugar) ? [{ n: i + 1, lugar: p.lugar }] : []))
  const carga = ['Revisando el catálogo', 'Ordenando las paradas', 'Trazando el esquema del mapa']

  return (
    <div className="wrap pagina">
      <p className="overline">Valle de Tenza</p>
      <h1 id="titulo" tabIndex={-1} className="t-h1">Arma el plan con lugares que sí están en el mapa</h1>
      <p className="sub">Cuéntame el municipio, los días y si quieres naturaleza, comida o cultura. Cubro Guayatá, Somondoco, Tenza, Sutatenza, Almeida, Chivor y La Capilla.</p>
      {proveedores?.modo === 'demostracion' && (
        <p className="plan-aviso" role="note"><strong>Modo demostración sin claves.</strong> No hay OpenAI, la solicitud no se guarda en Supabase y no se envía correo.</p>
      )}

      <form className="plan-form" onSubmit={(e) => { e.preventDefault(); void generar(texto.trim()) }}>
        <label className="vd-field" htmlFor="plan-texto">
          <span className="vd-field-label">Cómo quieres el recorrido</span>
          <textarea id="plan-texto" className="vd-input plan-texto" maxLength={TEXTO_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: dos días de naturaleza en Chivor" />
        </label>
        <div className="voz-fila">
          <Button type="button" className="plan-mic" variant="secondary" aria-pressed={mic === 'grabando'} onClick={() => void alternarMic()}>
            {mic === 'grabando' ? 'Detener' : mic === 'enviando' ? 'Transcribiendo…' : 'Hablar'}
          </Button>
          <Button type="submit" variant="cta" disabled={cargando}>{cargando ? 'Armando…' : 'Armar el plan'}</Button>
        </div>
        {mic === 'denegado' && <p className="plan-aviso" role="status">El navegador no dio permiso al micrófono. Escribe el plan en el cuadro.</p>}
        {mic === 'sin_config' && <p className="plan-aviso" role="status">Modo demostración: la transcripción no está configurada (falta la clave de OpenAI). El texto sigue disponible.</p>}
        {mic === 'error' && <p className="plan-aviso" role="status">No pude usar el micrófono. Escribe lo que quieres hacer.</p>}
        <div className="opts" role="group" aria-label="Tipo de plan">
          {PLANES.map((p) => <Option key={p.id} icon={p.icono} selected={chips.plan === p.id} onClick={() => setChips({ ...chips, plan: p.id })}>{p.opcion}</Option>)}
        </div>
        <div className="opts" role="group" aria-label="Días">
          {[1, 2, 3].map((n) => <Option key={n} selected={chips.dias === n} onClick={() => setChips({ ...chips, dias: n })}>{n} {n === 1 ? 'día' : 'días'}</Option>)}
        </div>
        <label className="vd-field">
          <span className="vd-field-label">Municipio base</span>
          <select className="vd-input" value={chips.municipio} onChange={(e) => setChips({ ...chips, municipio: e.target.value })}>
            <option value="">El que mejor encaje</option>
            {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
          </select>
        </label>
      </form>

      {cargando && (
        <ol className="plan-carga" aria-live="polite">
          {carga.map((t, i) => <li key={t} data-activo={i <= paso}>{t}</li>)}
        </ol>
      )}
      {error && <p className="plan-aviso" role="alert">{error}</p>}

      {dto && it && (
        <section id="plan-resultado" className="plan-grid" aria-live="polite">
          <div className="plan-cards">
            <Chip tone={dto.modo === 'openai' ? 'success' : 'soft'}>{dto.modo === 'openai' ? `OpenAI · ${dto.modelo}` : 'Modo demostración · sin llamada a OpenAI'}</Chip>
            <p>{dto.resumen}</p>
            {dto.avisos.length > 0 && <ul className="plan-aviso">{dto.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
            {it.dias.map((d) => (
              <div key={d.n} className="plan-dia">
                <h2 className="t-h2">Día {d.n}</h2>
                {pasos.filter((p) => p.dia === d.n).map((p) => (
                  <article key={`${p.rol}-${p.lugar.id}`} className="plan-card">
                    <span className="plan-rol">{p.rol === 'parada' ? 'Parada' : p.rol === 'comida' ? 'Dónde comer' : 'Dónde dormir'}</span>
                    <h3 className="t-h3">{p.lugar.nombre}</h3>
                    <p>{NOMBRE_MUNICIPIO[p.lugar.municipio] ?? p.lugar.municipio}</p>
                    <Button variant="ghost" onClick={() => void generar(edit, { quitar: p.lugar.id })}>Quitar del plan</Button>
                  </article>
                ))}
              </div>
            ))}
            <form className="plan-chat" onSubmit={(e) => { e.preventDefault(); void generar(edit.trim()); setEdit('') }}>
              <TextField label="Ajustar con una frase" value={edit} onChange={(e) => setEdit(e.target.value)} maxLength={TEXTO_MAX} placeholder="Más corto, o céntralo en Tenza" />
              <Button type="submit" variant="secondary" disabled={cargando || !edit.trim()}>Aplicar el cambio</Button>
            </form>
            <div className="voz-fila">
              <Button type="button" variant="secondary" onClick={() => void escuchar()}>{voz === 'sonando' ? 'Detener voz' : voz === 'cargando' ? 'Preparando voz…' : 'Escuchar el resumen'}</Button>
              <p className="voz-nota">Voz sintética, no es una persona del Valle. Solo suena si tú la pides.</p>
            </div>
            {voz === 'sin_config' && <p className="plan-aviso">Modo demostración: la voz no está configurada. El resumen queda escrito.</p>}
            {voz === 'error' && <p className="plan-aviso">No se pudo generar la voz. El texto no cambió.</p>}
          </div>
          <div>
            <div className="mapa-ruta plan-mapa">
              <Suspense fallback={<Cargando />}>
                <MapaRuta paradas={puntos} seleccionadoId={sel} onElegir={setSel} corrida={corrida} />
              </Suspense>
            </div>
            <p className="plan-esquema">Esquema en línea recta entre paradas. No promete carretera, tráfico ni tiempo de viaje.</p>
            {puntos.length > 1 && <Button variant="ghost" onClick={() => setCorrida((c) => c + 1)}>Ver el recorrido otra vez</Button>}
            <ol className="ruta">
              {pasos.map((p, i) => (
                <li key={`${p.rol}-${p.lugar.id}`}>
                  <button type="button" className="enlace" onClick={() => setSel(p.lugar.id)}>{p.lugar.nombre}</button>
                  {dist[i] !== undefined && <small>{km(dist[i]!)} en línea recta</small>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {dto && (
        <form className="plan-form" onSubmit={(e) => void enviarSolicitud(e)}>
          <h2 className="t-h2">Enviar solicitud</h2>
          <p className="sub">Esto pide el plan. No confirma cupo, no cobra y no reserva.</p>
          <TextField label="Tu nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoComplete="name" required />
          <TextField label="Correo para el comprobante" type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} autoComplete="email" required />
          <TextField label="Teléfono (opcional)" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} autoComplete="tel" />
          <TextField label="Fecha" type="date" min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          <TextField label="Personas" type="number" min={1} max={20} value={form.personas} onChange={(e) => setForm({ ...form, personas: e.target.value })} required />
          <label className="vd-field">
            <span className="vd-field-label">Nota (opcional)</span>
            <textarea className="vd-input plan-texto" maxLength={500} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          </label>
          <Button type="submit" variant="cta" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </form>
      )}
      {recibo && (
        <div id="plan-recibo" className="plan-aviso" role="status">
          <p><strong>{recibo.persistido ? 'Solicitud guardada' : 'Vista previa, no guardada'}</strong></p>
          <p>{recibo.mensaje}</p>
          <p>Estado del comprobante: {etiquetaComprobante(recibo.comprobante)}.</p>
        </div>
      )}
    </div>
  )
}

function etiquetaComprobante(estado: string): string {
  if (estado === 'enviado') return 'correo enviado'
  if (estado === 'omitido_sin_configuracion') return 'correo no configurado'
  if (estado === 'fallido') return 'correo fallido, solicitud guardada'
  if (estado === 'pendiente') return 'correo pendiente'
  return 'correo no enviado'
}
