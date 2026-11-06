import { openaiConfig, resendConfig, supabaseConfig } from '../server/env'
import { json } from '../server/http'

// Solo booleanos. No devuelve claves, modelos ni correos.
export function GET(): Response {
  const openai = openaiConfig().configurado
  const supabase = supabaseConfig().configurado
  const resend = resendConfig().configurado
  return json({
    openai,
    supabase,
    resend,
    modo: !openai && !supabase && !resend ? 'demostracion' : 'configurado',
  })
}
