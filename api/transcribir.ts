import { extensionDe, revisarAudio, tipoAudio } from '../server/audio.js'
import { openaiConfig } from '../server/env.js'
import { crearLimite, ipCliente, json } from '../server/http.js'
import { AUDIO_MAX_BYTES, OPENAI_TIMEOUT_MS, TEXTO_MAX } from '../shared/constantes.js'

const limitado = crearLimite({ max: 8, ventanaMs: 10 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  if (!openaiConfig().configurado) {
    return json({ error: 'no_configurado', mensaje: 'Falta OPENAI_API_KEY en el servidor. Escribe el plan en el cuadro de texto.' }, 503)
  }
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiados audios seguidos. Escribe el plan o espera un poco.' }, 429)
  const tipo = tipoAudio(request.headers.get('content-type') || '')
  const anunciado = Number(request.headers.get('content-length') || 0)
  if (anunciado > AUDIO_MAX_BYTES) return json({ error: 'audio_grande', mensaje: 'El audio supera el límite de esta función (3,5 MB).' }, 413)
  const buf = new Uint8Array(await request.arrayBuffer())
  const rev = revisarAudio(tipo, buf.byteLength)
  if (!rev.ok) {
    const mensaje = rev.error === 'audio_grande' ? 'El audio supera 3,5 MB.' : rev.error === 'audio_vacio' ? 'No llegó audio.' : 'Usa un audio webm, ogg, mp4 o wav.'
    return json({ error: rev.error, mensaje }, rev.status)
  }
  const cfg = openaiConfig()
  const form = new FormData()
  form.append('file', new Blob([buf], { type: tipo }), `audio.${extensionDe(tipo)}`)
  form.append('model', cfg.modeloTranscripcion)
  form.append('language', 'es')
  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.clave}` },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(OPENAI_TIMEOUT_MS)]),
    })
    if (!r.ok) return json({ error: 'transcripcion_fallida', mensaje: 'OpenAI no transcribió el audio. Puedes escribir el plan.' }, 502)
    const data = (await r.json()) as { text?: string }
    const texto = (data.text ?? '').trim().slice(0, TEXTO_MAX)
    if (!texto) return json({ error: 'transcripcion_vacia', mensaje: 'No se entendió el audio. Escríbelo.' }, 422)
    return json({ texto })
  } catch (e) {
    const nombre = (e as Error).name
    if (nombre === 'TimeoutError' || nombre === 'AbortError') return json({ error: 'tiempo_agotado', mensaje: 'La transcripción tardó demasiado.' }, 504)
    return json({ error: 'transcripcion_fallida', mensaje: 'No se pudo transcribir. Escribe el plan.' }, 502)
  }
}
