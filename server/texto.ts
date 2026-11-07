const CORREO = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const TELEFONO = /\+?\d[\d\s().-]{6,}\d/g

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Quita correos y teléfonos antes de armar un prompt. El modelo no los necesita. */
export function sinDatosPersonales(s: string, max = 500): string {
  return s.replace(CORREO, '[correo]').replace(TELEFONO, '[telefono]').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

export function hoyColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function correoValido(crudo: string, dominioPermitido = ''): { ok: true; correo: string } | { ok: false; error: string } {
  const correo = crudo.trim().toLowerCase()
  if (correo.length > 254 || correo.includes('\n') || correo.includes('\r') || !EMAIL.test(correo)) {
    return { ok: false, error: 'Escribe un correo válido.' }
  }
  if (dominioPermitido && correo.split('@')[1] !== dominioPermitido) {
    return { ok: false, error: `En esta demo solo se aceptan correos @${dominioPermitido}.` }
  }
  return { ok: true, correo }
}
