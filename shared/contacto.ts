// Utilidades de contacto y horario compartidas entre el navegador y el servidor.
// TypeScript puro: sin dependencias y sin React.

export type DiaSemana = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'

export type DiaHorario = { abre?: string; cierra?: string; cerrado?: boolean }

export type Horario = Partial<Record<DiaSemana, DiaHorario>>

export const DIAS_SEMANA: { id: DiaSemana; nombre: string }[] = [
  { id: 'lun', nombre: 'Lunes' },
  { id: 'mar', nombre: 'Martes' },
  { id: 'mie', nombre: 'Miércoles' },
  { id: 'jue', nombre: 'Jueves' },
  { id: 'vie', nombre: 'Viernes' },
  { id: 'sab', nombre: 'Sábado' },
  { id: 'dom', nombre: 'Domingo' },
]

const DIA_POR_INGLES: Record<string, DiaSemana> = {
  Mon: 'lun',
  Tue: 'mar',
  Wed: 'mie',
  Thu: 'jue',
  Fri: 'vie',
  Sat: 'sab',
  Sun: 'dom',
}

const SOLO_DIGITOS = /\D/g
const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Convierte un número colombiano o internacional a formato WhatsApp (solo dígitos, con código de país).
 * Devuelve null si no se puede deducir un número de celular válido.
 */
export function numeroWhatsapp(texto: string | null | undefined): string | null {
  if (!texto) return null
  const conMas = texto.trim().startsWith('+')
  const digitos = texto.replace(SOLO_DIGITOS, '')
  if (!digitos) return null

  if (conMas && digitos.length >= 8 && digitos.length <= 15) return digitos
  if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`
  if (digitos.length === 12 && digitos.startsWith('573')) return digitos
  return null
}

/** Enlace wa.me con mensaje opcional, codificado para URL. */
export function enlaceWhatsapp(numero: string, texto?: string): string {
  const base = `https://wa.me/${numero}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}

/**
 * Enlace tel: para llamar. Conserva el + inicial si el texto original lo tenía.
 * Acepta entre 7 y 15 dígitos (incluye fijos sin código de país).
 */
export function enlaceTel(texto: string | null | undefined): string | null {
  if (!texto) return null
  const conMas = texto.trim().startsWith('+')
  const digitos = texto.replace(SOLO_DIGITOS, '')
  if (digitos.length < 7 || digitos.length > 15) return null
  return `tel:${conMas ? '+' : ''}${digitos}`
}

/** Día de la semana y minutos desde medianoche en la zona horaria de Bogotá. */
export function horaBogota(ahora: Date): { dia: DiaSemana; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora)

  let dia: DiaSemana = 'lun'
  let horas = 0
  let minutos = 0
  for (const p of partes) {
    if (p.type === 'weekday') dia = DIA_POR_INGLES[p.value] ?? dia
    if (p.type === 'hour') horas = Number(p.value)
    if (p.type === 'minute') minutos = Number(p.value)
  }
  return { dia, minutos: horas * 60 + minutos }
}

function aMinutos(hora: string): number | null {
  const m = FORMATO_HORA.exec(hora)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Indica si un lugar está abierto en el momento dado (hora de Bogotá).
 * Si cierra es anterior a abre, el horario cruza la medianoche.
 */
export function abiertoAhora(
  horario: Horario | null | undefined,
  ahora: Date,
): 'abierto' | 'cerrado' | 'sin_dato' {
  if (!horario) return 'sin_dato'
  const { dia, minutos } = horaBogota(ahora)
  const entrada = horario[dia]
  if (!entrada) return 'sin_dato'
  if (entrada.cerrado) return 'cerrado'

  const abre = entrada.abre === undefined ? null : aMinutos(entrada.abre)
  const cierra = entrada.cierra === undefined ? null : aMinutos(entrada.cierra)
  if (abre === null || cierra === null) return 'sin_dato'

  const abierto = cierra < abre
    ? minutos >= abre || minutos < cierra
    : minutos >= abre && minutos < cierra
  return abierto ? 'abierto' : 'cerrado'
}

/** Mensaje inicial que se envía al prestador desde la ficha de un lugar. */
export function mensajeWhatsappLugar(nombreLugar: string): string {
  return `Hola, vi ${nombreLugar} en Valle Directo y quiero más información.`
}
