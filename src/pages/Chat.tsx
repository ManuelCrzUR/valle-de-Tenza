import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ChatBubble, TextField } from '../components/ui'
import { Icon } from '../components/Icon'
import { responder as respaldo } from '../data/respuestas'
import { responder, EJEMPLOS } from '../data/asistente'
import type { Accion, Contexto, Respuesta } from '../data/asistente'
import { getLugar, tieneUbicacion } from '../data/lugares'
import { useItinerario } from '../state/itinerario'
import { useDemo } from '../state/demo'
import { preguntar, ChatError } from '../chatApi'
import { config } from '../config'
import { usePagina } from '../usePagina'
import '../styles/chat-asistente.css'

type Msg = { from: 'bot' | 'me' | 'ambassador'; text: string; resp?: Respuesta }

const MAX = 500
const MSG_LIMITE = 'Has enviado muchos mensajes seguidos. Espera unos minutos o habla con un embajador.'

export default function Chat() {
  usePagina('Chatbot y embajador')
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'bot', text: 'Hola, soy el asistente de Valle Directo. Conozco los lugares reales del Valle de Tenza: puedo armarte una ruta por días, sugerirte qué hay cerca de un municipio o de un sitio, y llevarte a reservar. Escribe lo que necesitas o toca una sugerencia.' },
  ])
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const { usarRuta } = useItinerario()
  const demo = useDemo()
  const ctx = useRef<Partial<Contexto>>({})
  const [pensando, setPensando] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const abortar = useRef<AbortController | null>(null)
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [msgs, pensando])
  useEffect(() => () => abortar.current?.abort(), [])

  const add = (m: Msg) => setMsgs((x) => [...x, m])
  const enviarTexto = async (t: string) => {
    if (!t || pensando) return
    add({ from: 'me', text: t }); setQ('')
    if (!config.usarAuren) {
      const r = responder(t, { negocios: demo.negocios, reservas: demo.reservas, ...ctx.current })
      ctx.current = { ...ctx.current, ...r.contexto }
      add({ from: 'bot', text: r.texto, resp: r })
      return
    }
    setPensando(true)
    const ctl = new AbortController(); abortar.current = ctl
    try {
      add({ from: 'bot', text: await preguntar(t, ctl.signal) })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      // Si la IA no responde, caemos a las reglas locales para no dejar al viajero sin respuesta.
      add({ from: 'bot', text: err instanceof ChatError && err.tipo === 'limite' ? MSG_LIMITE : respaldo(t) })
    } finally {
      setPensando(false)
    }
  }
  const enviar = (e: FormEvent) => { e.preventDefault(); void enviarTexto(q.trim()) }
  const hacer = (a: Accion, r: Respuesta) => {
    if ((a.tipo === 'usar-ruta' || a.tipo === 'ver-ruta-itinerario') && r.ruta) usarRuta(r.ruta)
    if (a.to) nav(a.to)
  }
  const sinMensajes = !msgs.some((m) => m.from === 'me')

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Chatbot y embajador</h1>
      <p className="sub">Dudas rápidas con el chatbot a cualquier hora, o habla con una persona del Valle en horario de oficina: {config.horario}.</p>
      <div className="chat-layout">
        <div className="chat">
          <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Conversación" aria-busy={pensando}>
            {msgs.map((m, i) => (
              <ChatBubble key={i} from={m.from} author={m.from === 'ambassador' ? 'Embajador del Valle' : undefined}>
                <span className="chat-texto">{m.text}</span>
                {m.resp?.tarjetas && (
                  <ul className="chat-tarjetas">
                    {m.resp.tarjetas.map((t) => {
                      const l = getLugar(t.lugarId)
                      return (
                        <li key={t.lugarId} className="chat-tarjeta">
                          <span className="chat-tarjeta-titulo">{t.titulo}</span>
                          <span className="chat-tarjeta-detalle">{t.detalle}</span>
                          <div className="chat-botones">
                            {t.reservable && <Button variant="primary" onClick={() => nav(`/reservar/${t.lugarId}`)}>Reservar</Button>}
                            {l && tieneUbicacion(l) && <Button variant="secondary" onClick={() => nav(`/mapa?lugar=${t.lugarId}`)}>Ver en el mapa</Button>}
                            <Button variant="ghost" onClick={() => nav(`/lugares/${t.lugarId}`)}>Ver detalle</Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {m.resp?.acciones && m.resp.ruta && (
                  <div className="chat-botones">
                    {m.resp.acciones.map((a, j) => <Button key={a.tipo} variant={j === 0 ? 'primary' : 'secondary'} onClick={() => hacer(a, m.resp!)}>{a.etiqueta}</Button>)}
                  </div>
                )}
              </ChatBubble>
            ))}
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
          {sinMensajes && (
            <div className="chat-sugerencias" role="group" aria-label="Sugerencias">
              {EJEMPLOS.map((e) => <button key={e} type="button" className="chat-chip" onClick={() => void enviarTexto(e)}>{e}</button>)}
            </div>
          )}
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
