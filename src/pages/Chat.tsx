import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, ChatBubble, TextField } from '../components/ui'
import { responder } from '../data/respuestas'
import { config } from '../config'
import { usePagina } from '../usePagina'

type Msg = { from: 'bot' | 'me' | 'ambassador'; text: string }

export default function Chat() {
  usePagina('Chatbot y embajador')
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'bot', text: 'Hola, soy el asistente de Valle Directo. Pregúntame por hospedaje, rutas o cómo armar tu viaje.' },
  ])
  const [q, setQ] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [msgs])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const add = (m: Msg) => setMsgs((x) => [...x, m])
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const t = q.trim()
    if (!t) return
    add({ from: 'me', text: t }); setQ('')
    timers.current.push(window.setTimeout(() => add({ from: 'bot', text: responder(t) }), 400))
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Chatbot y embajador</h1>
      <p className="sub">Dudas rápidas con el chatbot a cualquier hora, o habla con una persona del Valle en horario de oficina: {config.horario}.</p>
      <div className="chat">
        <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Conversación">
          {msgs.map((m, i) => <ChatBubble key={i} from={m.from} author={m.from === 'ambassador' ? 'Embajador del Valle' : undefined}>{m.text}</ChatBubble>)}
        </div>
        <form className="chat-form" onSubmit={enviar}>
          <TextField label="Tu pregunta" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder="Escribe tu pregunta" />
          <Button type="submit" variant="primary">Enviar</Button>
        </form>
        <Button variant="secondary" icon="embajador" onClick={() => add({ from: 'ambassador', text: `Un embajador del Valle te atiende en horario de oficina: ${config.horario}. Contacto: ${config.contacto}.` })}>
          Hablar con un embajador
        </Button>
      </div>
    </div>
  )
}
