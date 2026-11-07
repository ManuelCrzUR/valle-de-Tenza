export type Puerta =
  | { ok: true }
  | { ok: false; error: 'dominio_no_verificado'; mensaje: string }

/**
 * onboarding@resend.dev (y cualquier remitente @resend.dev) solo entrega al correo de esa cuenta.
 * Si el formulario pide otro destinatario, no se envía y no se sustituye el correo.
 * Un dominio propio en RESEND_FROM_EMAIL no entra por esta puerta.
 */
function correoRemitente(desde: string): string {
  const entre = desde.match(/<([^>]+)>/)
  return (entre?.[1] ?? desde).trim().toLowerCase()
}

export function puertaEnvio(desde: string, para: string, destinatarioPrueba: string): Puerta {
  const remitente = correoRemitente(desde)
  const esPrueba = remitente === 'onboarding@resend.dev' || remitente.endsWith('@resend.dev')
  if (!esPrueba) return { ok: true }
  const permitido = destinatarioPrueba.trim().toLowerCase()
  const destino = para.trim().toLowerCase()
  if (permitido && destino === permitido) return { ok: true }
  return {
    ok: false,
    error: 'dominio_no_verificado',
    mensaje: 'La solicitud quedó guardada con el correo del formulario. El comprobante no se envió: el remitente de prueba de Resend solo puede escribir a la cuenta de Resend, y no sustituí el destinatario. Para escribir a cualquier correo hace falta un dominio verificado en RESEND_FROM_EMAIL.',
  }
}
