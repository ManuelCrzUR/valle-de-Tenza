/** Interpreta el hash que Supabase deja tras un enlace de correo del flujo heredado (plantillas por defecto). */

export interface EnlaceHeredado {
  /** `ok` si trae sesión (`access_token`), `error` si trae `error`/`error_description`. */
  estado: 'ok' | 'error'
  /** Valor de `type` del hash (`signup`, `recovery`, `email_change`…), si venía. */
  tipo: string | null
  /** Hash (con `#`) que debe leer supabase-js: solo los parámetros, sin la ruta del HashRouter. */
  hashSupabase: string
  /** Hash (con `#`) al que hay que llevar a la persona cuando supabase-js termine. */
  destino: string
  /** `true` si el hash traía una ruta delante y hay que reescribirlo para que supabase-js lo detecte. */
  requiereReescribir: boolean
}

/**
 * Devuelve null si el hash es una ruta normal del HashRouter (incluido el enlace nuevo con `?token_hash=`).
 * Casos que reconoce: `#access_token=…&type=…`, `#error=…&error_description=…` y esos mismos
 * parámetros pegados tras una ruta (`#/prestadores/confirmar#access_token=…`).
 */
export function interpretarHashHeredado(hash: string): EnlaceHeredado | null {
  let crudo = hash.startsWith('#') ? hash.slice(1) : hash
  let requiereReescribir = false
  if (crudo.startsWith('/')) {
    const corte = crudo.indexOf('#')
    if (corte === -1) return null
    crudo = crudo.slice(corte + 1)
    requiereReescribir = true
  }
  const params = new URLSearchParams(crudo)
  const tipo = params.get('type')
  let estado: 'ok' | 'error'
  if (params.has('error') || params.has('error_description') || params.has('error_code')) estado = 'error'
  else if (params.has('access_token')) estado = 'ok'
  else return null
  const destino = estado === 'ok' && tipo === 'recovery'
    ? '#/prestadores/clave-nueva'
    : `#/prestadores/confirmar?estado=${estado}${tipo ? `&type=${encodeURIComponent(tipo)}` : ''}`
  return { estado, tipo, hashSupabase: `#${crudo}`, destino, requiereReescribir }
}

/** Traduce errores de Supabase Auth a mensajes en español, sin revelar si un correo tiene cuenta. */
export function traducirErrorAuth(mensaje: string, estado?: number): string {
  const m = mensaje.toLowerCase()
  if (estado === 429 || m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) {
    return 'Espera un momento antes de pedir otro correo.'
  }
  if (m.includes('email not confirmed')) return 'Aún no confirmas tu correo. Abre el enlace que te enviamos o pide otro.'
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Entra con la contraseña.'
  if (m.includes('same password') || m.includes('different from the old')) return 'La contraseña nueva debe ser distinta de la anterior.'
  if (m.includes('session') || m.includes('not authenticated') || m.includes('jwt')) return 'El enlace venció. Pide uno nuevo.'
  if (m.includes('password')) return 'La contraseña no cumple lo que pide el proyecto. Prueba una más larga.'
  if (m.includes('email')) return 'Revisa el correo. No pude completar la acción con ese dato.'
  return 'No pude completar la acción. Revisa los datos e inténtalo de nuevo.'
}

/** Segundos de enfriamiento entre reenvíos de correo, para no gastar el límite de envíos. */
export const ENFRIAMIENTO_CORREO_S = 60
