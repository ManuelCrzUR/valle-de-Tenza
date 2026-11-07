import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, ChatBubble, Chip, Option, TextField } from '../ui'
import { Orbe } from './Orbe'
import type { EstadoOrbe } from './Orbe'
import { responderLocal, SUGERENCIAS, validarLink } from '../../data/agente'
import type { LinkAgente, RespuestaAgente } from '../../data/agente'

interface Mensaje {
  id: number
  de: 'bot' | 'me'
  texto: string
  links: LinkAgente[]
  modo?: RespuestaAgente['modo']
}

const CLAVE_MENSAJES = 'vd-agente-mensajes'
const CLAVE_SALUDO = 'vd-agente-saludo'
const MAX_MENSAJES = 20
const TIMEOUT_MS = 15000
const BIENVENIDA = 'Hola, soy el asistente de Valle Directo. Pregúntame por lugares, dónde dormir o cómo armar tu plan.'

function leerMensajes(): Mensaje[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE_MENSAJES)
    if (!crudo) return []
    const datos: unknown = JSON.parse(crudo)
    if (!Array.isArray(datos)) return []
    const out: Mensaje[] = []
    for (const d of datos) {
      if (!d || typeof d !== 'object') continue
      const m = d as Record<string, unknown>
      if ((m.de !== 'bot' && m.de !== 'me') || typeof m.texto !== 'string' || typeof m.id !== 'number') continue
      const links = Array.isArray(m.links) ? m.links.map(validarLink).filter((l): l is LinkAgente => !!l) : []
      const modo = m.modo === 'openai' || m.modo === 'catalogo' ? m.modo : undefined
      out.push({ id: m.id, de: m.de, texto: m.texto, links, modo })
    }
    return out.slice(-MAX_MENSAJES)
  } catch { return [] }
}

function guardarMensajes(ms: Mensaje[]): void {
  try { sessionStorage.setItem(CLAVE_MENSAJES, JSON.stringify(ms.slice(-MAX_MENSAJES))) } catch { /* sin almacenamiento */ }
}

const reduceMovimiento = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const esMovil = () => window.matchMedia('(max-width: 1023px)').matches

/** Espera (máx. 2 s) a que exista el elemento ancla y lo muestra con foco. */
function irAAncla(ancla: string): void {
  const limite = performance.now() + 2000
  const buscar = () => {
    const el = document.getElementById(ancla)
    if (!el) {
      if (performance.now() < limite) requestAnimationFrame(buscar)
      return
    }
    // La página hace scrollTo(0,0) al montar: espera dos frames más.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: reduceMovimiento() ? 'auto' : 'smooth', block: 'start' })
      if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) {
        el.setAttribute('tabindex', '-1')
        el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
      }
      el.focus({ preventScroll: true })
    }))
  }
  requestAnimationFrame(buscar)
}

async function consultar(pregunta: string, pagina: string, senal: AbortSignal): Promise<RespuestaAgente & { aviso?: true }> {
  const control = new AbortController()
  const cortar = () => control.abort()
  senal.addEventListener('abort', cortar)
  const temporizador = window.setTimeout(cortar, TIMEOUT_MS)
  try {
    const r = await fetch('/api/agente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta, pagina }),
      signal: control.signal,
    })
    if (r.status === 429 || r.status === 400) {
      const e = (await r.json()) as { mensaje?: unknown }
      // Aviso del servidor (límite o petición inválida): no es respuesta del catálogo ni de la IA.
      if (typeof e.mensaje === 'string' && e.mensaje) return { modo: 'catalogo', texto: e.mensaje, links: [], aviso: true }
      throw new Error('sin mensaje')
    }
    if (!r.ok) throw new Error(`estado ${r.status}`)
    const d = (await r.json()) as Partial<RespuestaAgente>
    if (d.modo !== 'openai' || typeof d.texto !== 'string' || !d.texto.trim() || !Array.isArray(d.links)) throw new Error('JSON inválido')
    return { modo: 'openai', texto: d.texto, links: d.links.map(validarLink).filter((l): l is LinkAgente => !!l).slice(0, 3) }
  } finally {
    window.clearTimeout(temporizador)
    senal.removeEventListener('abort', cortar)
  }
}

export function Agente(): ReactElement {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const idTitulo = useId()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>(leerMensajes)
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [saludo, setSaludo] = useState(false)
  const lanzador = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const pendiente = useRef<AbortController | null>(null)
  const siguienteId = useRef(Math.max(0, ...mensajes.map((m) => m.id)) + 1)

  useEffect(() => () => pendiente.current?.abort(), [])
  useEffect(() => { guardarMensajes(mensajes) }, [mensajes])

  // Saludo: una vez por sesión, a 1.5 s; se oculta a los 6 s.
  useEffect(() => {
    let visto = false
    try { visto = sessionStorage.getItem(CLAVE_SALUDO) === '1' } catch { /* ignorar */ }
    if (visto) return
    let ocultar = 0
    const mostrar = window.setTimeout(() => {
      try { sessionStorage.setItem(CLAVE_SALUDO, '1') } catch { /* ignorar */ }
      setSaludo(true)
      ocultar = window.setTimeout(() => setSaludo(false), 4500)
    }, 1500)
    return () => { window.clearTimeout(mostrar); window.clearTimeout(ocultar) }
  }, [])

  const cerrar = useCallback(() => {
    setAbierto(false)
    lanzador.current?.focus()
  }, [])

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto, cerrar])

  useEffect(() => {
    if (abierto) panel.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [abierto])

  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes, esperando, abierto])

  const agregar = (m: Omit<Mensaje, 'id'>) =>
    setMensajes((prev) => [...prev, { ...m, id: siguienteId.current++ }].slice(-MAX_MENSAJES))

  const enviar = async (cruda: string) => {
    const pregunta = cruda.trim().slice(0, 500)
    if (!pregunta || esperando) return
    agregar({ de: 'me', texto: pregunta, links: [] })
    setTexto('')
    setEsperando(true)
    setFallo(false)
    const control = new AbortController()
    pendiente.current = control
    const pagina = `/${pathname.split('/')[1] ?? ''}`
    try {
      const r = await consultar(pregunta, pagina, control.signal)
      if (control.signal.aborted) return
      agregar({ de: 'bot', texto: r.texto, links: r.links, modo: r.aviso ? undefined : r.modo })
    } catch {
      if (control.signal.aborted) return
      try {
        const r = responderLocal(pregunta)
        agregar({ de: 'bot', texto: r.texto, links: r.links.map(validarLink).filter((l): l is LinkAgente => !!l), modo: 'catalogo' })
      } catch {
        setFallo(true)
        agregar({ de: 'bot', texto: 'No pude responder ahora. Intenta de nuevo en un momento.', links: [] })
      }
    } finally {
      if (pendiente.current === control) { pendiente.current = null; setEsperando(false) }
    }
  }

  const alEnviar = (e: FormEvent) => { e.preventDefault(); void enviar(texto) }

  const abrirLink = (l: LinkAgente) => {
    navigate(l.ruta)
    if (l.ancla) irAAncla(l.ancla)
    if (esMovil()) cerrar()
  }

  const estado: EstadoOrbe = esperando ? 'pensando' : fallo ? 'error' : 'listo'

  return (
    <>
      {saludo && !abierto && <p className="agente-saludo">¿Te ayudo a encontrar algo?</p>}
      <button
        ref={lanzador}
        type="button"
        className="agente-lanzador"
        aria-expanded={abierto}
        aria-controls="agente-panel"
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => { setSaludo(false); if (abierto) cerrar(); else setAbierto(true) }}
      >
        <Orbe tamano="lg" estado={estado} />
      </button>

      {abierto && (
        <div ref={panel} id="agente-panel" className="agente-panel" role="dialog" aria-modal="false" aria-labelledby={idTitulo}>
          <header className="agente-cab">
            <Orbe tamano="sm" estado={estado} />
            <h2 id={idTitulo} className="agente-titulo">Asistente del Valle</h2>
            <button type="button" className="agente-cerrar" aria-label="Cerrar" onClick={cerrar}>×</button>
          </header>

          <div ref={lista} className="agente-mensajes" aria-live="polite">
            <ChatBubble from="bot">{BIENVENIDA}</ChatBubble>
            {mensajes.length === 0 && (
              <div className="agente-sugerencias">
                {SUGERENCIAS.map((s) => <Option key={s} onClick={() => void enviar(s)}>{s}</Option>)}
              </div>
            )}
            {mensajes.map((m) => (
              <div key={m.id} className={`agente-item agente-item-${m.de}`}>
                <ChatBubble from={m.de}>{m.texto}</ChatBubble>
                {m.de === 'bot' && m.links.length > 0 && (
                  <div className="agente-links">
                    {m.links.map((l) => <Button key={`${l.ruta}#${l.ancla}`} variant="secondary" onClick={() => abrirLink(l)}>{l.etiqueta}</Button>)}
                  </div>
                )}
                {m.de === 'bot' && m.modo && <Chip className="agente-modo">{m.modo === 'openai' ? 'IA · OpenAI' : 'Respuesta del catálogo'}</Chip>}
              </div>
            ))}
            {esperando && <p className="agente-pensando">Pensando…</p>}
          </div>

          <form className="agente-form" onSubmit={alEnviar}>
            <div className="agente-campo">
              <TextField label="Tu pregunta" value={texto} maxLength={500} autoComplete="off" onChange={(e) => setTexto(e.target.value)} />
              <Button type="submit" variant="primary" disabled={!texto.trim() || esperando}>Enviar</Button>
            </div>
            <p className="agente-aviso">No escribas datos personales. Revisa la información antes de viajar.</p>
          </form>
        </div>
      )}
    </>
  )
}
