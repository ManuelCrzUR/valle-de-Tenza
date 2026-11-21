import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { interpretarHashHeredado } from './enlaceAuth'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

/*
 * Respaldo del flujo heredado: con las plantillas por defecto Supabase vuelve con `#access_token=…`
 * o `#error=…` en el hash, que el HashRouter tomaría por una ruta. Se deja el hash en el formato que
 * supabase-js detecta (flujo implícito, sin PKCE) y, cuando termina de leer la sesión, se lleva a la persona
 * a la pantalla correcta. Debe ejecutarse antes de crear el cliente.
 */
const heredado = typeof window !== 'undefined' ? interpretarHashHeredado(window.location.hash) : null
if (heredado?.requiereReescribir) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${heredado.hashSupabase}`)
}

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null
export const authConfigurado = supabase !== null

if (heredado) {
  const ir = () => window.location.replace(`${window.location.pathname}${window.location.search}${heredado.destino}`)
  if (supabase) void supabase.auth.initialize().then(ir, ir)
  else ir()
}
