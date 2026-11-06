import { escapeHtml } from './texto'
import type { ItinerarioDto } from './itinerario'

export interface DatosRecibo {
  nombre: string
  fecha: string
  personas: number
  nota: string
  lugares: string[]
  municipio: string
}

export function htmlRecibo(d: DatosRecibo): string {
  const lugares = d.lugares.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
  const nota = d.nota ? `<p>Nota: ${escapeHtml(d.nota)}</p>` : ''
  return `<!doctype html><html lang="es"><body style="font-family:Georgia,serif;color:#14302b">
<p>Hola ${escapeHtml(d.nombre)},</p>
<p>Recibimos tu <strong>solicitud</strong> de plan para el Valle de Tenza (${escapeHtml(d.municipio)}), para el ${escapeHtml(d.fecha)}, ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}.</p>
<p><strong>No es una reserva confirmada.</strong> No verifica cupo, no cobra y no aparta habitación ni mesa.</p>
<ul>${lugares}</ul>
${nota}
<p>La línea del mapa en la página es un esquema, no una ruta por carretera.</p>
<p>Valle Directo · prototipo de clase</p>
</body></html>`
}

export function textoRecibo(d: DatosRecibo): string {
  return [
    `Hola ${d.nombre},`,
    '',
    `Recibimos tu solicitud de plan para el Valle de Tenza (${d.municipio}), para el ${d.fecha}, ${d.personas} personas.`,
    'No es una reserva confirmada. No verifica cupo ni cobra.',
    '',
    ...d.lugares.map((n) => `- ${n}`),
    d.nota ? `Nota: ${d.nota}` : '',
    '',
    'Valle Directo · prototipo de clase',
  ].filter(Boolean).join('\n')
}

export function lugaresDelPlan(it: ItinerarioDto): string[] {
  return it.lugares.map((l) => `${l.nombre} (${l.municipio})`)
}

export type Envio = { ok: true; id: string } | { ok: false; error: string }

export async function enviarRecibo(opts: {
  fetchImpl: typeof fetch
  clave: string
  desde: string
  para: string
  idempotencyKey: string
  datos: DatosRecibo
}): Promise<Envio> {
  const r = await opts.fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.clave}`,
      'content-type': 'application/json',
      'idempotency-key': opts.idempotencyKey,
    },
    body: JSON.stringify({
      from: opts.desde,
      to: [opts.para],
      subject: 'Recibimos tu solicitud de plan — Valle Directo',
      html: htmlRecibo(opts.datos),
      text: textoRecibo(opts.datos),
    }),
  })
  if (!r.ok) return { ok: false, error: `resend_${r.status}` }
  const data = (await r.json().catch(() => null)) as { id?: string } | null
  if (!data?.id) return { ok: false, error: 'resend_sin_id' }
  return { ok: true, id: data.id }
}
