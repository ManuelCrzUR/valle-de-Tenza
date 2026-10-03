// Proxy hacia el chat de Auren AI. Corre en Vercel (Node) y en `npm run dev` (ver vite.config.ts).
// El token de la demo vive solo en variables de entorno: nunca llega al navegador.
//
//   AUREN_DEMO_TOKEN  token de la demo de Auren con la base de conocimiento del Valle (obligatorio)
//   AUREN_BASE_URL    por defecto https://app.getaurenai.com

const MAX_CARACTERES = 500
const LIMITE = { peticiones: 20, ventanaMs: 10 * 60 * 1000 }
const TIMEOUT_MS = 20_000

// Límite por IP en memoria: es de mejor esfuerzo (cada instancia serverless tiene el suyo),
// pero frena el abuso casual. Para un límite estricto hace falta un almacén compartido.
const visitas = new Map<string, number[]>()

function excedeLimite(ip: string, ahora = Date.now()): boolean {
  const recientes = (visitas.get(ip) ?? []).filter((t) => ahora - t < LIMITE.ventanaMs)
  recientes.push(ahora)
  visitas.set(ip, recientes)
  if (visitas.size > 5000) for (const [k, v] of visitas) if (!v.some((t) => ahora - t < LIMITE.ventanaMs)) visitas.delete(k)
  return recientes.length > LIMITE.peticiones
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const token = process.env.AUREN_DEMO_TOKEN
  if (!token) return json({ error: 'no_configurado' }, 503)

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (excedeLimite(ip)) return json({ error: 'demasiados_mensajes' }, 429)

  let mensaje: unknown
  try { mensaje = ((await request.json()) as { mensaje?: unknown }).mensaje } catch { return json({ error: 'solicitud_invalida' }, 400) }
  if (typeof mensaje !== 'string' || !mensaje.trim()) return json({ error: 'solicitud_invalida' }, 400)
  if (mensaje.length > MAX_CARACTERES) return json({ error: 'mensaje_largo' }, 400)

  const base = (process.env.AUREN_BASE_URL || 'https://app.getaurenai.com').replace(/\/$/, '')
  try {
    const r = await fetch(`${base}/api/demo/chat/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensaje: mensaje.trim() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = (await r.json()) as { success?: boolean; respuesta?: string }
    // Auren responde 200 aun con error ({success:false,error}); no reenviamos su texto de error.
    if (!r.ok || !data.success || !data.respuesta) return json({ error: 'no_disponible' }, 502)
    return json({ respuesta: data.respuesta })
  } catch {
    return json({ error: 'no_disponible' }, 502)
  }
}
