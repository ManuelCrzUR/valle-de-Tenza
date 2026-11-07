import { supabaseConfig } from './env'

export interface TokenGuardado { requestId: string; expira: string }

export async function nuevoToken(ahora = Date.now()): Promise<{ token: string; hash: string; expira: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Buffer.from(bytes).toString('base64url')
  const hash = await huella(token)
  return { token, hash, expira: new Date(ahora + 2 * 60 * 60 * 1000).toISOString() }
}

export async function huella(token: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function vigente(expira: string, ahora = Date.now()): boolean {
  const t = Date.parse(expira)
  return Number.isFinite(t) && t > ahora
}

export function memoriaTokens() {
  const mapa = new Map<string, TokenGuardado>()
  return {
    async guardar(hash: string, requestId: string, expira: string) { mapa.set(hash, { requestId, expira }) },
    async buscar(hash: string) { return mapa.get(hash) ?? null },
  }
}

export function tokensSupabase(fetchImpl: typeof fetch = fetch) {
  const cfg = supabaseConfig()
  if (!cfg.configurado) throw new Error('supabase_no_configurado')
  const headers = { apikey: cfg.clave, authorization: `Bearer ${cfg.clave}`, 'content-type': 'application/json' }
  return {
    async guardar(hash: string, requestId: string, expira: string) {
      const r = await fetchImpl(`${cfg.url}/rest/v1/dossier_tokens`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=minimal' },
        body: JSON.stringify({ token_hash: hash, reservation_request_id: requestId, expira }),
      })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
    },
    async buscar(hash: string): Promise<TokenGuardado | null> {
      const r = await fetchImpl(`${cfg.url}/rest/v1/dossier_tokens?token_hash=eq.${encodeURIComponent(hash)}&select=reservation_request_id,expira`, { headers })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
      const data = (await r.json()) as { reservation_request_id?: string; expira?: string }[]
      const row = data[0]
      if (!row?.reservation_request_id || !row.expira) return null
      return { requestId: row.reservation_request_id, expira: row.expira }
    },
  }
}
