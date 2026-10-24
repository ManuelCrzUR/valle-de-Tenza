import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Sin variables de entorno la app funciona sin backend, con el JSON local.
// Enlace mágico con PKCE: el retorno llega como `?code=` en la URL de la ruta; el cliente lo canjea solo.
export const supabase = url && llave
  ? createClient(url, llave, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } })
  : null

// Quita `?code=` (y restos de error) de la URL sin tocar la ruta.
export function limpiarCodigoDeUrl() {
  const u = new URL(location.href)
  if (!u.searchParams.has('code') && !u.searchParams.has('error_description')) return
  ;['code', 'error', 'error_code', 'error_description'].forEach((k) => u.searchParams.delete(k))
  history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`)
}
