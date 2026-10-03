export type ErrorChat = 'limite' | 'no_disponible'

export class ChatError extends Error {
  constructor(public tipo: ErrorChat) { super(tipo) }
}

// Llama a /api/chat (función de Vercel). Sin ese backend, por ejemplo en GitHub Pages, lanza 'no_disponible'.
export async function preguntar(mensaje: string, signal?: AbortSignal): Promise<string> {
  let r: Response
  try {
    r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mensaje }), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ChatError('no_disponible')
  }
  if (r.status === 429) throw new ChatError('limite')
  if (!r.ok) throw new ChatError('no_disponible')
  const data = (await r.json().catch(() => null)) as { respuesta?: string } | null
  if (!data?.respuesta) throw new ChatError('no_disponible')
  return data.respuesta
}
