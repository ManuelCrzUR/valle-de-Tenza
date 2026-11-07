import { AUDIO_MAX_BYTES } from '../shared/constantes.js'

const TIPOS = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'video/webm'])

export function tipoAudio(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function revisarAudio(tipo: string, bytes: number): { ok: true } | { ok: false; status: number; error: string } {
  if (!TIPOS.has(tipo)) return { ok: false, status: 415, error: 'formato_no_soportado' }
  if (bytes <= 0) return { ok: false, status: 400, error: 'audio_vacio' }
  if (bytes > AUDIO_MAX_BYTES) return { ok: false, status: 413, error: 'audio_grande' }
  return { ok: true }
}

export function extensionDe(tipo: string): string {
  if (tipo.includes('webm')) return 'webm'
  if (tipo.includes('ogg')) return 'ogg'
  if (tipo.includes('mp4')) return 'mp4'
  if (tipo.includes('mpeg')) return 'mp3'
  return 'wav'
}
