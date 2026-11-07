import { MODELO_ITINERARIO, MODELO_TRANSCRIPCION, MODELO_VOZ, VOCES_DOCUMENTADAS, VOZ_DEFECTO } from '../shared/constantes.js'

// Solo nombres de entorno de servidor. Nunca se leen variables VITE_.
function limpio(nombre: string): string {
  const v = process.env[nombre]
  return typeof v === 'string' ? v.trim() : ''
}

export function openaiConfig() {
  const clave = limpio('OPENAI_API_KEY')
  const vozPedida = limpio('OPENAI_TTS_VOICE')
  const voz = (VOCES_DOCUMENTADAS as readonly string[]).includes(vozPedida) ? vozPedida : VOZ_DEFECTO
  return {
    configurado: clave.length > 0,
    clave,
    modeloItinerario: limpio('OPENAI_ITINERARY_MODEL') || MODELO_ITINERARIO,
    modeloTranscripcion: limpio('OPENAI_TRANSCRIBE_MODEL') || MODELO_TRANSCRIPCION,
    modeloVoz: limpio('OPENAI_TTS_MODEL') || MODELO_VOZ,
    voz,
  }
}

export function supabaseConfig() {
  const url = limpio('SUPABASE_URL').replace(/\/$/, '')
  const clave = limpio('SUPABASE_SERVICE_ROLE_KEY')
  return { configurado: Boolean(url && clave), url, clave }
}

export function resendConfig() {
  const clave = limpio('RESEND_API_KEY')
  const desde = limpio('RESEND_FROM_EMAIL')
  const dominio = limpio('RESEND_ALLOWED_DOMAIN').replace(/^@/, '').toLowerCase()
  const destinatarioPrueba = limpio('RESEND_SANDBOX_RECIPIENT').toLowerCase()
  return { configurado: Boolean(clave && desde), clave, desde, dominio, destinatarioPrueba }
}
