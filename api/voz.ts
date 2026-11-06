import { openaiConfig } from '../server/env'
import { crearLimite, ipCliente, json } from '../server/http'
import { OPENAI_TIMEOUT_MS } from '../shared/constantes'
import { sinDatosPersonales } from '../server/texto'

const limitado = crearLimite({ max: 10, ventanaMs: 10 * 60 * 1000 })

export async function POST(request: Request): Promise<Response> {
  const cfg = openaiConfig()
  if (!cfg.configurado) return json({ error: 'no_configurado', mensaje: 'La voz sintética no está configurada (falta OPENAI_API_KEY).' }, 503)
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiadas reproducciones seguidas.' }, 429)
  let cuerpo: { texto?: unknown }
  try { cuerpo = await request.json() } catch { return json({ error: 'solicitud_invalida', mensaje: 'No pude leer el texto.' }, 400) }
  const texto = sinDatosPersonales(typeof cuerpo.texto === 'string' ? cuerpo.texto : '', 400)
  if (texto.length < 2) return json({ error: 'texto_corto', mensaje: 'No hay un resumen para leer.' }, 400)
  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.clave}`, 'content-type': 'application/json' },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(OPENAI_TIMEOUT_MS)]),
      body: JSON.stringify({
        model: cfg.modeloVoz,
        voice: cfg.voz,
        input: texto,
        response_format: 'mp3',
        instructions: 'Habla en español, cercano y calmado, como alguien del Valle. No agregues datos que no estén en el texto.',
      }),
    })
    if (!r.ok || !r.body) return json({ error: 'voz_no_disponible', mensaje: 'No se pudo generar la voz. El texto sigue en pantalla.' }, 502)
    return new Response(r.body, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } })
  } catch (e) {
    const nombre = (e as Error).name
    if (nombre === 'TimeoutError' || nombre === 'AbortError') return json({ error: 'tiempo_agotado', mensaje: 'La voz tardó demasiado.' }, 504)
    return json({ error: 'voz_no_disponible', mensaje: 'No se pudo generar la voz.' }, 502)
  }
}
