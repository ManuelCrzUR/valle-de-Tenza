import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Chip, Option, TextField } from '../components/ui'
import { Cargando } from '../components/Cargando'
import { MUNICIPIOS, NOMBRE_MUNICIPIO, getLugar, tieneUbicacion } from '../data/lugares'
import { PLANES } from '../data/planes'
import type { Categoria } from '../data/planes'
import { ordenRuta } from '../data/generarPlan'
import { usePlan } from '../state/plan'
import type { PlanDto } from '../state/plan'
import { usePagina } from '../usePagina'
import { AUDIO_MAX_BYTES, AUDIO_MAX_MS, TEXTO_MAX } from '../../shared/constantes'
import '../styles/itinerario.css'
import '../styles/plan.css'

const MapaRuta = lazy(() => import('../components/mapa/MapaRuta'))

type Chips = { plan: Categoria; dias: number; municipio: string }
type Fase = 'listo' | 'escuchando' | 'transcribiendo' | 'armando' | 'hablando' | 'error'
const VACIO: Chips = { plan: 'aventura', dias: 2, municipio: '' }
const RECIBO_KEY = 'valle-directo:recibo'
const REINTENTABLES = new Set(['bloqueado_dominio', 'fallido', 'omitido_sin_configuracion'])
type Recibo = { persistido: boolean; comprobante: string; mensaje: string; token: string | null; expira: string | null }

function leerRecibo(): Recibo | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RECIBO_KEY) ?? 'null') as Recibo | null
    if (!raw || typeof raw.mensaje !== 'string' || typeof raw.comprobante !== 'string') return null
    return { persistido: !!raw.persistido, comprobante: raw.comprobante, mensaje: raw.mensaje, token: typeof raw.token === 'string' ? raw.token : null, expira: typeof raw.expira === 'string' ? raw.expira : null }
  } catch { return null }
}
const ETIQUETA: Record<Fase, string> = {
  listo: 'Listo',
  escuchando: 'Escuchando',
  transcribiendo: 'Transcribiendo',
  armando: 'Armando el plan',
  hablando: 'Hablando',
  error: 'Error',
}

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
  const [fase, setFase] = useState<Fase>('listo')
  const [notaVoz, setNotaVoz] = useState('')
  const [edit, setEdit] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [corrida, setCorrida] = useState(0)
  const [tour, setTour] = useState({ i: 0, modo: 'quieto' as 'quieto' | 'sigue' | 'pausa', seq: 0 })
  const rec = useRef<MediaRecorder | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const abortar = useRef<AbortController | null>(null)
  const descartar = useRef(false)
  const [clave, setClave] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState({ nombre: '', correo: '', telefono: '', fecha: '', personas: '2', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [recibo, setRecibo] = useState<Recibo | null>(leerRecibo)
  const [reintentando, setReintentando] = useState(false)
  useEffect(() => {
    try {
      if (recibo) sessionStorage.setItem(RECIBO_KEY, JSON.stringify(recibo))
      else sessionStorage.removeItem(RECIBO_KEY)
    } catch { /* sin almacenamiento */ }
  }, [recibo])
  const [proveedores, setProveedores] = useState<{ openai: boolean; supabase: boolean; resend: boolean; modo: string } | null>(null)
  const [previa, setPrevia] = useState<{ html: string; pdf: string | null; mensaje: string } | null>(null)
  const [narracion, setNarracion] = useState('')

  useEffect(() => () => { abortar.current?.abort(); rec.current?.stop(); audio.current?.pause() }, [])
  useEffect(() => {
    fetch('/api/estado').then((r) => r.json()).then(setProveedores).catch(() => setProveedores(null))
  }, [])

  const dto = plan?.dto
  const it = plan?.itinerario
  const pasos = it ? ordenRuta(it) : []
  const puntos = pasos.flatMap((p, i) => (tieneUbicacion(p.lugar) ? [{ n: i + 1, lugar: p.lugar }] : []))
  const tourParadas = puntos.slice(0, 5)
  const actual = tour.modo === 'quieto' ? null : tourParadas[tour.i]

  useEffect(() => {
    if (tour.modo !== 'sigue') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setTimeout(() => {
      setTour((t) => (t.i >= tourParadas.length - 1 ? { ...t, modo: 'pausa' } : { ...t, i: t.i + 1, seq: t.seq + 1 }))
    }, 3400)
    return () => window.clearTimeout(id)
  }, [tour, tourParadas.length])
  useEffect(() => {
    if (actual) setSel(actual.lugar.id)
  }, [actual])

  function saltar(i: number) {
    setTour((t) => ({ ...t, i: Math.max(0, Math.min(tourParadas.length - 1, i)), seq: t.seq + 1, modo: t.modo === 'quieto' ? 'pausa' : t.modo }))
  }

  async function generar(mensaje: string, extra?: { quitar?: string }) {
    setNotaVoz('')
    setRecibo(null)
    setFase('armando')
    abortar.current?.abort()
    const ctl = new AbortController()
    abortar.current = ctl
    try {
      const { status, data } = await postJson<{ itinerario?: PlanDto; mensaje?: string }>('/api/itinerario', {
        mensaje, anclar: extra?.quitar || plan ? undefined : lugarInicial?.id, chips: { ...chips, ...extra }, itinerario: plan?.dto,
      }, ctl.signal)
      if (!data?.itinerario) { setFase('error'); setNotaVoz(data?.mensaje || (status === 0 ? 'No hay conexión con el servidor.' : 'No pude armar el plan.')); return }
      guardar(data.itinerario)
      setCorrida((c) => c + 1)
      setSel(null)
      setTour({ i: 0, modo: 'quieto', seq: 0 })
      setFase('listo')
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('plan-resultado')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setFase('listo'); return }
      setFase('error')
      setNotaVoz('Se cortó la generación. Puedes intentar otra vez.')
    }
  }

  function pararAudio() {
    audio.current?.pause()
    abortar.current?.abort()
    setFase('listo')
  }

  function cancelar() {
    descartar.current = true
    abortar.current?.abort()
    rec.current?.stop()
    pararAudio()
    setFase('listo')
    setNotaVoz('Cancelado. Nada se envió solo.')
  }

  async function alternarMic() {
    if (fase === 'escuchando') { descartar.current = false; rec.current?.stop(); return }
    setNotaVoz('')
    setFase('listo')
    if (!navigator.mediaDevices?.getUserMedia) { setFase('error'); setNotaVoz('Este navegador no abre el micrófono. Escribe el plan.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
      if (!mime) { stream.getTracks().forEach((t) => t.stop()); setFase('error'); setNotaVoz('No pude grabar en este navegador. Escribe el plan.'); return }
      const mr = new MediaRecorder(stream, { mimeType: mime })
      const trozos: Blob[] = []
      mr.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (descartar.current) { descartar.current = false; setFase('listo'); return }
        void subirAudio(new Blob(trozos, { type: mime }), mime.split(';')[0])
      }
      rec.current = mr
      descartar.current = false
      mr.start()
      setFase('escuchando')
      window.setTimeout(() => { if (mr.state === 'recording') mr.stop() }, AUDIO_MAX_MS)
    } catch (e) {
      const nombre = (e as Error).name
      setFase('error')
      setNotaVoz(nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError'
        ? 'El navegador no dio permiso al micrófono. Escribe el plan en el cuadro.'
        : 'No pude usar el micrófono. Escribe lo que quieres hacer.')
    }
  }

  async function subirAudio(blob: Blob, tipo: string) {
    if (blob.size > AUDIO_MAX_BYTES || !blob.size) { setFase('error'); setNotaVoz('El audio no sirve. Escríbelo o graba menos tiempo.'); return }
    setFase('transcribiendo')
    abortar.current?.abort()
    const ctl = new AbortController()
    abortar.current = ctl
    try {
      const r = await fetch('/api/transcribir', { method: 'POST', headers: { 'content-type': tipo }, body: blob, signal: ctl.signal })
      const data = await r.json().catch(() => null) as { texto?: string; error?: string; mensaje?: string } | null
      if (r.status === 503 || data?.error === 'no_configurado') {
        setFase('listo')
        setNotaVoz('Modo demostración: la transcripción no está configurada. Revisa o escribe el texto y luego arma el plan.')
        return
      }
      if (!r.ok || !data?.texto) { setFase('error'); setNotaVoz(data?.mensaje || 'No se transcribió. Escribe el plan.'); return }
      setTexto(data.texto.slice(0, TEXTO_MAX))
      setFase('listo')
      setNotaVoz('Revisa el texto. No armo el plan hasta que pulses «Armar el plan».')
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setFase('listo'); return }
      setFase('error')
      setNotaVoz('No se transcribió. Escribe el plan.')
    }
  }

  async function hablar(textoVoz: string) {
    if (fase === 'hablando') { pararAudio(); return }
    setFase('hablando')
    abortar.current?.abort()
    const ctl = new AbortController()
    abortar.current = ctl
    try {
      const r = await fetch('/api/voz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: textoVoz }), signal: ctl.signal })
      if (r.status === 503) { setFase('listo'); setNarracion(textoVoz); setNotaVoz('Modo demostración: la voz sintética no está configurada. El texto queda escrito.'); return }
      if (!r.ok) { setFase('error'); setNotaVoz('No se pudo generar la voz. El texto no cambió.'); return }
      const url = URL.createObjectURL(await r.blob())
      const a = new Audio(url)
      audio.current = a
      a.onended = () => { setFase('listo'); URL.revokeObjectURL(url) }
      await a.play()
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setFase('listo'); return }
      setFase('error')
      setNotaVoz('No se pudo generar la voz.')
    }
  }

  async function ejemplo() {
    if (!plan) return
    const { data } = await postJson<{ html?: string; pdf?: string | null; mensaje?: string }>('/api/dossier', { ejemplo: true, itinerario: plan.dto })
    if (!data?.html) { setNotaVoz(data?.mensaje || 'No pude preparar el ejemplo.'); return }
    setPrevia({ html: data.html, pdf: data.pdf ?? null, mensaje: data.mensaje || 'Ejemplo. No está guardado ni enviado.' })
  }

  function descargarEjemplo() {
    if (!previa?.pdf) {
      if (!previa?.html) return
      const blob = new Blob([previa.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      return
    }
    const bin = Uint8Array.from(atob(previa.pdf), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bin], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'valle-directo-ejemplo.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function enviarSolicitud(e: FormEvent) {
    e.preventDefault()
    if (!plan) return
    setEnviando(true)
    setNotaVoz('')
    try {
      const { data, status } = await postJson<{ persistido?: boolean; comprobante?: string; mensaje?: string; descarga?: { token?: string; expira?: string } | null }>('/api/solicitudes', {
        idempotencyKey: clave, ...form, personas: Number(form.personas), itinerario: plan.dto,
      })
      if (!data?.mensaje || status >= 400) { setNotaVoz(data?.mensaje || 'No se pudo enviar la solicitud.'); return }
      setRecibo({
        persistido: !!data.persistido,
        comprobante: data.comprobante || 'no_enviado',
        mensaje: data.mensaje,
        token: data.descarga?.token ?? null,
        expira: data.descarga?.expira ?? null,
      })
      setClave(crypto.randomUUID())
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('plan-recibo')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }))
    } catch { setNotaVoz('No hay conexión con el servidor.') }
    finally { setEnviando(false) }
  }

  async function reintentarEnvio() {
    if (!recibo?.token) return
    setReintentando(true)
    try {
      const { data, status } = await postJson<{ comprobante?: string | null; mensaje?: string; reenviado?: boolean }>('/api/reintento', { token: recibo.token })
      if (!data?.mensaje) { setNotaVoz('No pude reintentar el envío.'); return }
      setRecibo({
        ...recibo,
        comprobante: data.comprobante || recibo.comprobante,
        mensaje: data.mensaje,
        token: status === 403 ? null : recibo.token,
      })
    } catch { setNotaVoz('No hay conexión con el servidor.') }
    finally { setReintentando(false) }
  }

  const ocupado = fase === 'escuchando' || fase === 'transcribiendo' || fase === 'armando' || fase === 'hablando'
  const textoParada = actual
    ? `${actual.lugar.nombre}, en ${NOMBRE_MUNICIPIO[actual.lugar.municipio] ?? actual.lugar.municipio}. Parada ${actual.n} de un esquema, no de una carretera.`
    : ''

  return (
    <div className="wrap pagina plan-escenario">
      <div className="plan-principal">
        <p className="overline">Valle de Tenza</p>
        <h1 id="titulo" tabIndex={-1} className="t-h1">Arma el plan con lugares que sí están en el mapa</h1>
        {proveedores?.modo === 'demostracion' && (
          <p className="plan-aviso" role="note"><strong>Modo demostración sin claves.</strong> No hay OpenAI, la solicitud no se guarda en Supabase y no se envía correo.</p>
        )}
        {dto && it && (
          <section id="plan-resultado" className="plan-grid" aria-live="polite">
            <div>
              <p className="plan-esquema">Mapa 2D. La línea es un esquema en línea recta, no una carretera ni un tiempo de viaje.</p>
              <div className="mapa-ruta plan-mapa">
                <Suspense fallback={<Cargando />}>
                  <MapaRuta paradas={puntos} seleccionadoId={sel} onElegir={setSel} corrida={corrida} foco={actual ? { id: actual.lugar.id, seq: tour.seq } : null} />
                </Suspense>
              </div>
              {tourParadas.length >= 3 && (
                <div className="tour" role="group" aria-label="Recorrido guiado">
                  <Button type="button" variant="secondary" onClick={() => setTour({ i: 0, modo: 'sigue', seq: tour.seq + 1 })}>Iniciar recorrido</Button>
                  <Button type="button" variant="ghost" onClick={() => setTour((t) => ({ ...t, modo: t.modo === 'sigue' ? 'pausa' : 'sigue' }))}>{tour.modo === 'sigue' ? 'Pausar' : 'Seguir'}</Button>
                  <Button type="button" variant="ghost" onClick={() => saltar(tour.i - 1)}>Anterior</Button>
                  <Button type="button" variant="ghost" onClick={() => saltar(tour.i + 1)}>Siguiente</Button>
                  <Button type="button" variant="ghost" onClick={() => setTour({ i: 0, modo: 'pausa', seq: tour.seq + 1 })}>Reiniciar</Button>
                  <Button type="button" variant="secondary" onClick={() => void hablar(textoParada)}>{fase === 'hablando' ? 'Detener voz' : 'Escuchar esta parada'}</Button>
                </div>
              )}
              {narracion && <p className="plan-aviso">{narracion}</p>}
            </div>
            <div className="plan-cards">
              <Chip tone={dto.modo === 'openai' ? 'success' : 'soft'}>{dto.modo === 'openai' ? `OpenAI · ${dto.modelo}` : 'Modo demostración · sin llamada a OpenAI'}</Chip>
              <p>{dto.resumen}</p>
              {dto.avisos.length > 0 && <ul className="plan-aviso">{dto.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
              {it.dias.map((d) => (
                <div key={d.n} className="plan-dia">
                  <h2 className="t-h2">Día {d.n}</h2>
                  {pasos.filter((p) => p.dia === d.n).map((p) => (
                    <article key={`${p.rol}-${p.lugar.id}`} className={`plan-card${sel === p.lugar.id ? ' plan-card-activa' : ''}`}>
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
                <Button type="submit" variant="secondary" disabled={fase === 'armando' || !edit.trim()}>Aplicar el cambio</Button>
              </form>
            </div>
          </section>
        )}

        {dto && (
          <form id="plan-solicitud" className="plan-form" onSubmit={(e) => void enviarSolicitud(e)}>
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
            <Button type="button" variant="secondary" onClick={() => void ejemplo()}>Ver ejemplo de correo y dossier</Button>
          </form>
        )}
        {recibo && (
          <div id="plan-recibo" className="plan-aviso" role="status">
            <p><strong>{recibo.persistido ? 'Solicitud guardada' : 'Vista previa, no guardada'}</strong></p>
            <p>{recibo.mensaje}</p>
            <p>Estado del comprobante: {etiquetaComprobante(recibo.comprobante)}.</p>
            {recibo.persistido && recibo.token && REINTENTABLES.has(recibo.comprobante) && (
              <Button type="button" variant="secondary" disabled={reintentando} onClick={() => void reintentarEnvio()}>
                {reintentando ? 'Reintentando…' : 'Reintentar envío'}
              </Button>
            )}
            {recibo.persistido && !recibo.token && REINTENTABLES.has(recibo.comprobante) && (
              <p>Esta pantalla no tiene el enlace de descarga de esa solicitud. Sin ese enlace no reenvío el comprobante ni creo otra solicitud.</p>
            )}
          </div>
        )}
        {previa && (
          <section className="plan-aviso" aria-label="Ejemplo de correo y dossier">
            <p><strong>EJEMPLO / no guardada / no enviada.</strong> {previa.mensaje}</p>
            <Button type="button" variant="secondary" onClick={descargarEjemplo}>{previa.pdf ? 'Descargar PDF de ejemplo' : 'Abrir versión para imprimir'}</Button>
            <iframe className="correo-previa" title="Ejemplo del correo" sandbox="" srcDoc={previa.html} />
          </section>
        )}
      </div>

      <aside id="plan-asistente" className="asistente" aria-label="Hablar para planear">
        <div className={`orbe orbe-${fase}`} aria-hidden="true" />
        <h2 className="t-h3">Hablar para planear</h2>
        <p className="asistente-fase" role="status">{ETIQUETA[fase]}</p>
        <p className="voz-nota">La voz, si suena, es sintética. No empieza sola y puedes detenerla.</p>
        <form onSubmit={(e) => { e.preventDefault(); void generar(texto.trim()) }}>
          <label className="vd-field" htmlFor="plan-texto">
            <span className="vd-field-label">Texto para revisar</span>
            <textarea id="plan-texto" className="vd-input plan-texto" maxLength={TEXTO_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: dos días de naturaleza en Chivor" />
          </label>
          <div className="voz-fila">
            <Button type="button" className="plan-mic" variant="secondary" aria-pressed={fase === 'escuchando'} onClick={() => void alternarMic()}>
              {fase === 'escuchando' ? 'Detener' : fase === 'transcribiendo' ? 'Transcribiendo…' : 'Hablar'}
            </Button>
            <Button type="submit" variant="cta" disabled={fase === 'armando'}>{fase === 'armando' ? 'Armando…' : 'Armar el plan'}</Button>
            {ocupado && <Button type="button" variant="ghost" onClick={cancelar}>Cancelar</Button>}
          </div>
        </form>
        {notaVoz && <p className="plan-aviso" role="status">{notaVoz}</p>}
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
        {dto && <Button type="button" variant="ghost" onClick={() => void hablar(dto.resumen)}>{fase === 'hablando' ? 'Detener voz' : 'Escuchar el resumen'}</Button>}
      </aside>
    </div>
  )
}

function etiquetaComprobante(estado: string): string {
  if (estado === 'enviado') return 'correo enviado'
  if (estado === 'omitido_sin_configuracion') return 'correo no configurado'
  if (estado === 'fallido') return 'correo fallido, solicitud guardada'
  if (estado === 'bloqueado_dominio') return 'correo no enviado: el remitente no podía escribir a ese destinatario'
  if (estado === 'pendiente') return 'correo pendiente'
  return 'correo no enviado'
}
