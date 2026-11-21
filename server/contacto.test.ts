import { describe, expect, it } from 'vitest'
import {
  DIAS_SEMANA,
  abiertoAhora,
  enlaceTel,
  enlaceWhatsapp,
  horaBogota,
  mensajeWhatsappLugar,
  numeroWhatsapp,
} from '../shared/contacto.js'

// Bogotá es UTC-5 sin horario de verano. 2026-11-09 es lunes.
const LUNES_10_BOGOTA = new Date('2026-11-09T15:00:00Z')

describe('numeroWhatsapp', () => {
  it('antepone 57 a un celular colombiano de 10 dígitos', () => {
    expect(numeroWhatsapp('300 123 4567')).toBe('573001234567')
  })

  it('quita el + y los separadores de un número internacional con código 57', () => {
    expect(numeroWhatsapp('+57 300-123-4567')).toBe('573001234567')
  })

  it('deja tal cual 12 dígitos que empiezan por 573', () => {
    expect(numeroWhatsapp('573001234567')).toBe('573001234567')
  })

  it('devuelve null para un fijo de 10 dígitos que no empieza por 3', () => {
    expect(numeroWhatsapp('6087501234')).toBeNull()
  })

  it('acepta un número extranjero con + si tiene entre 8 y 15 dígitos', () => {
    expect(numeroWhatsapp('+1 (415) 555-0100')).toBe('14155550100')
  })

  it('devuelve null para vacío, null o undefined', () => {
    expect(numeroWhatsapp('')).toBeNull()
    expect(numeroWhatsapp(null)).toBeNull()
    expect(numeroWhatsapp(undefined)).toBeNull()
  })

  it('devuelve null si no hay dígitos o el número con + es demasiado corto o largo', () => {
    expect(numeroWhatsapp('sin números')).toBeNull()
    expect(numeroWhatsapp('+12')).toBeNull()
    expect(numeroWhatsapp('+1234567890123456')).toBeNull()
  })
})

describe('enlaceTel', () => {
  it('conserva el + de un número internacional', () => {
    expect(enlaceTel('+57 300 123 4567')).toBe('tel:+573001234567')
  })

  it('acepta un fijo sin código de país', () => {
    expect(enlaceTel('608 750 1234')).toBe('tel:6087501234')
  })

  it('devuelve null con menos de 7 dígitos, más de 15, vacío o null', () => {
    expect(enlaceTel('12345')).toBeNull()
    expect(enlaceTel('1234567890123456')).toBeNull()
    expect(enlaceTel('')).toBeNull()
    expect(enlaceTel(null)).toBeNull()
  })
})

describe('enlaceWhatsapp', () => {
  it('construye el enlace sin texto cuando no se pasa mensaje', () => {
    expect(enlaceWhatsapp('573001234567')).toBe('https://wa.me/573001234567')
  })

  it('codifica el mensaje con acentos y signos', () => {
    expect(enlaceWhatsapp('573001234567', 'Hola, ¿cómo está?')).toBe(
      'https://wa.me/573001234567?text=Hola%2C%20%C2%BFc%C3%B3mo%20est%C3%A1%3F',
    )
  })

  it('no agrega el parámetro text si el mensaje está vacío', () => {
    expect(enlaceWhatsapp('573001234567', '')).toBe('https://wa.me/573001234567')
  })
})

describe('mensajeWhatsappLugar', () => {
  it('arma el mensaje inicial con el nombre del lugar', () => {
    expect(mensajeWhatsappLugar('Cascada La Esperanza')).toBe(
      'Hola, vi Cascada La Esperanza en Valle Directo y quiero más información.',
    )
  })
})

describe('DIAS_SEMANA', () => {
  it('va de lunes a domingo con nombres en español', () => {
    expect(DIAS_SEMANA.map((d) => d.id)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'])
    expect(DIAS_SEMANA[0].nombre).toBe('Lunes')
    expect(DIAS_SEMANA[6].nombre).toBe('Domingo')
  })
})

describe('horaBogota', () => {
  it('convierte UTC a hora de Bogotá (UTC-5)', () => {
    expect(horaBogota(LUNES_10_BOGOTA)).toEqual({ dia: 'lun', minutos: 600 })
  })

  it('cambia de día al cruzar la medianoche de Bogotá', () => {
    // Lunes 20:00 en Bogotá es martes 01:00 UTC.
    expect(horaBogota(new Date('2026-11-10T01:00:00Z'))).toEqual({ dia: 'lun', minutos: 1200 })
  })
})

const HORARIO = {
  lun: { abre: '08:00', cierra: '18:00' },
  mar: { abre: '22:00', cierra: '02:00' },
  dom: { cerrado: true },
  mie: { abre: '8:00', cierra: '18:00' },
  jue: { abre: '08:00' },
}

describe('abiertoAhora', () => {
  it('está abierto dentro del horario del día', () => {
    expect(abiertoAhora(HORARIO, LUNES_10_BOGOTA)).toBe('abierto')
  })

  it('incluye la hora de apertura y excluye la de cierre', () => {
    expect(abiertoAhora(HORARIO, new Date('2026-11-09T13:00:00Z'))).toBe('abierto') // 08:00
    expect(abiertoAhora(HORARIO, new Date('2026-11-09T23:00:00Z'))).toBe('cerrado') // 18:00
  })

  it('está cerrado fuera del horario del día', () => {
    expect(abiertoAhora(HORARIO, new Date('2026-11-09T12:00:00Z'))).toBe('cerrado') // 07:00
  })

  it('maneja horarios que cruzan la medianoche', () => {
    // Martes 23:30 en Bogotá (martes 04:30 UTC del miércoles).
    expect(abiertoAhora(HORARIO, new Date('2026-11-11T04:30:00Z'))).toBe('abierto')
    // Martes 01:00 en Bogotá: sigue el horario del martes anterior.
    expect(abiertoAhora(HORARIO, new Date('2026-11-10T06:00:00Z'))).toBe('abierto')
    // Martes 12:00 en Bogotá: fuera del horario.
    expect(abiertoAhora(HORARIO, new Date('2026-11-10T17:00:00Z'))).toBe('cerrado')
  })

  it('devuelve cerrado si el día está marcado como cerrado', () => {
    // Domingo 12:00 en Bogotá.
    expect(abiertoAhora(HORARIO, new Date('2026-11-08T17:00:00Z'))).toBe('cerrado')
  })

  it('devuelve sin_dato sin horario, sin entrada para el día o con formato inválido', () => {
    expect(abiertoAhora(null, LUNES_10_BOGOTA)).toBe('sin_dato')
    expect(abiertoAhora(undefined, LUNES_10_BOGOTA)).toBe('sin_dato')
    expect(abiertoAhora({}, LUNES_10_BOGOTA)).toBe('sin_dato')
    expect(abiertoAhora(HORARIO, new Date('2026-11-14T15:00:00Z'))).toBe('sin_dato') // sábado sin entrada
    expect(abiertoAhora(HORARIO, new Date('2026-11-11T15:00:00Z'))).toBe('sin_dato') // miércoles "8:00"
    expect(abiertoAhora(HORARIO, new Date('2026-11-12T15:00:00Z'))).toBe('sin_dato') // jueves sin cierra
  })
})
