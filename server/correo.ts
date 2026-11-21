import type { Dossier } from './dossier.js'
import { asuntoDossier, htmlCorreo, textoDossier } from './dossier.js'

export type DatosRecibo = Dossier

export function htmlRecibo(d: Dossier): string {
  return htmlCorreo(d)
}

export function textoRecibo(d: Dossier): string {
  return textoDossier(d)
}

export type Envio = { ok: true; id: string } | { ok: false; error: string }

export async function enviarRecibo(opts: {
  fetchImpl: typeof fetch
  clave: string
  desde: string
  para: string
  idempotencyKey: string
  datos: DatosRecibo
  pdf?: Uint8Array | null
}): Promise<Envio> {
  const cuerpo: Record<string, unknown> = {
    from: opts.desde,
    to: [opts.para],
    subject: asuntoDossier(opts.datos.codigo),
    html: htmlRecibo(opts.datos),
    text: textoRecibo(opts.datos),
  }
  if (opts.pdf && opts.pdf.byteLength > 0) {
    cuerpo.attachments = [{ filename: 'valle-directo-solicitud.pdf', content: Buffer.from(opts.pdf).toString('base64') }]
  }
  const r = await opts.fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.clave}`,
      'content-type': 'application/json',
      'idempotency-key': opts.idempotencyKey,
    },
    body: JSON.stringify(cuerpo),
  })
  if (!r.ok) return { ok: false, error: `resend_${r.status}` }
  const data = (await r.json().catch(() => null)) as { id?: string } | null
  if (!data?.id) return { ok: false, error: 'resend_sin_id' }
  return { ok: true, id: data.id }
}

export interface CorreoSimple {
  fetchImpl: typeof fetch
  clave: string
  desde: string
  para: string
  asunto: string
  html: string
  texto: string
  idempotencyKey: string
}

/** Envío genérico por Resend (avisos al negocio). No incluye adjuntos. */
export async function enviarCorreoSimple(o: CorreoSimple): Promise<Envio> {
  const r = await o.fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${o.clave}`,
      'content-type': 'application/json',
      'idempotency-key': o.idempotencyKey,
    },
    body: JSON.stringify({ from: o.desde, to: [o.para], subject: o.asunto, html: o.html, text: o.texto }),
  })
  if (!r.ok) return { ok: false, error: `resend_${r.status}` }
  const data = (await r.json().catch(() => null)) as { id?: string } | null
  if (!data?.id) return { ok: false, error: 'resend_sin_id' }
  return { ok: true, id: data.id }
}
