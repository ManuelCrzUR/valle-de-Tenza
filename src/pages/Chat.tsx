import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, ChatBubble, TextField } from '../components/ui'
import { Icon } from '../components/Icon'
import { responder } from '../data/respuestas'
import { preguntar, ChatError } from '../chatApi'
import { config } from '../config'
import { usePagina } from '../usePagina'

type Msg = { from: 'bot' | 'me' | 'ambassador'; text: string }

const MAX = 500
const MSG_LIMITE = 'Has enviado muchos mensajes seguidos. Espera unos minutos o habla con un embajador.'

export default function Chat() {
  usePagina('Chatbot y embajador')
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'bot', text: 'Hola, soy el asistente de Valle Directo. Pregúntame por qué hacer en el Valle de Tenza, dónde comer, cultura y artesanías, o cómo armar tu viaje.' },
  ])
  const [q, setQ] = useState('')
  const [pensando, setPensando] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const abortar = useRef<AbortController | null>(null)
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [msgs, pensando])
  useEffect(() => () => abortar.current?.abort(), [])

  const add = (m: Msg) => setMsgs((x) => [...x, m])
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const t = q.trim()
    if (!t || pensando) return
    add({ from: 'me', text: t }); setQ(''); setPensando(true)
    const ctl = new AbortController(); abortar.current = ctl
    try {
      add({ from: 'bot', text: await preguntar(t, ctl.signal) })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      // Si la IA no responde, caemos a las reglas locales para no dejar al viajero sin respuesta.
      add({ from: 'bot', text: err instanceof ChatError && err.tipo === 'limite' ? MSG_LIMITE : responder(t) })
    } finally {
      setPensando(false)
    }
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Chatbot y embajador</h1>
      <p className="sub">Dudas rápidas con el chatbot a cualquier hora, o habla con una persona del Valle en horario de oficina: {config.horario}.</p>
      <div className="chat-layout">
        <div className="chat">
          <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Conversación" aria-busy={pensando}>
            {msgs.map((m, i) => <ChatBubble key={i} from={m.from} author={m.from === 'ambassador' ? 'Embajador del Valle' : undefined}>{m.text}</ChatBubble>)}
            {pensando && (
              <ChatBubble from="bot" className="vd-msg-pensando">
                <span className="sr-only">Escribiendo…</span>
                <span className="puntos" aria-hidden><i /><i /><i /></span>
              </ChatBubble>
            )}
          </div>
          <form className="chat-form" onSubmit={enviar}>
            <TextField label="Tu pregunta" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" maxLength={MAX} placeholder="Escribe tu pregunta" />
            <Button type="submit" variant="primary" disabled={pensando}>Enviar</Button>
          </form>
        </div>
        <aside className="panel chat-aside">
          <Icon name="embajador" size={32} />
          <h2 className="t-h3">Habla con una persona</h2>
          <p>Un embajador del Valle te atiende en horario de oficina: {config.horario}.</p>
          <p>Contacto: {config.contacto}</p>
          <Button variant="secondary" icon="embajador" onClick={() => add({ from: 'ambassador', text: `Un embajador del Valle te atiende en horario de oficina: ${config.horario}. Contacto: ${config.contacto}.` })}>
            Hablar con un embajador
          </Button>
        </aside>
      </div>
    </div>
  )
}
