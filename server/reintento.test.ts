import { describe, expect, it, vi } from 'vitest'
import { LUGARES, tieneUbicacion } from '../src/data/lugares.js'
import { almacenMemoria } from './almacen.js'
import { memoriaTokens, nuevoToken } from './descarga.js'
import { validarPropuesta } from './itinerario.js'
import { reintentarComprobante } from './solicitud.js'
import type { ItinerarioDto } from './itinerario.js'
import type { SolicitudFila } from './almacen.js'

function itinerario(): ItinerarioDto {
  const parada = LUGARES.find((l) => tieneUbicacion(l) && l.municipio === 'tenza' && l.categoria !== 'alojamiento')
  if (!parada) throw new Error('falta parada')
  const v = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [parada.id], comida: null }] })
  if (!v.ok) throw new Error(v.error)
  return { ...v.dto, modo: 'ajuste', modelo: null, resumen: 'guardado' }
}

async function bloqueada() {
  const almacen = almacenMemoria()
  const fila = await almacen.crear({
    idempotencyKey: crypto.randomUUID(),
    nombre: 'Ana',
    correo: 'persona@example.com',
    telefono: null,
    fecha: '2026-12-01',
    personas: 2,
    nota: null,
    itinerario: itinerario(),
  })
  await almacen.marcarOutbox(fila.outbox.id, { estado: 'bloqueado_dominio', intentos: 0, ultimoError: 'dominio_no_verificado' })
  const tokens = memoriaTokens()
  const t = await nuevoToken(Date.parse('2026-11-07T12:00:00Z'))
  await tokens.guardar(t.hash, fila.id, t.expira)
  return { almacen, tokens, fila, token: t.token }
}

describe('reintento del comprobante guardado', () => {
  it('pasa de bloqueado a enviado con el mismo registro y el correo original', async () => {
    const { almacen, tokens, fila, token } = await bloqueada()
    const enviados: { para: string; clave: string }[] = []
    const primero = await reintentarComprobante(token, {
      tokens, almacen, ahora: Date.parse('2026-11-07T12:30:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async (f) => {
        enviados.push({ para: f.correo, clave: f.outbox.idempotencyKey })
        return { ok: true, id: 're_1' }
      },
    })
    expect(primero.ok && primero.resultado.reenviado).toBe(true)
    expect(primero.ok && primero.resultado.comprobante).toBe('enviado')
    expect(enviados).toEqual([{ para: 'persona@example.com', clave: fila.outbox.idempotencyKey }])
    const despues = await almacen.buscarPorId(fila.id)
    expect(despues?.id).toBe(fila.id)
    expect(despues?.outbox.id).toBe(fila.outbox.id)
    expect(despues?.correo).toBe('persona@example.com')
    expect(despues?.outbox.estado).toBe('enviado')
    expect(despues?.itinerario.dias).toEqual(fila.itinerario.dias)

    const segundo = await reintentarComprobante(token, {
      tokens, almacen, ahora: Date.parse('2026-11-07T12:40:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async () => { enviados.push({ para: 'no', clave: 'no' }); return { ok: true, id: 're_2' } },
    })
    expect(segundo.ok && segundo.resultado.reenviado).toBe(false)
    expect(segundo.ok && segundo.resultado.comprobante).toBe('enviado')
    expect(enviados).toHaveLength(1)
  })

  it('sigue bloqueado si el remitente actual no puede escribir, y un fallo no crea otra fila', async () => {
    const { almacen, tokens, fila, token } = await bloqueada()
    let llamadas = 0
    const sigue = await reintentarComprobante(token, {
      tokens, almacen, ahora: Date.parse('2026-11-07T12:30:00Z'),
      remitente: 'onboarding@resend.dev',
      destinatarioPrueba: 'cuenta@resend.dev',
      enviar: async () => { llamadas++; return { ok: true, id: 'no' } },
    })
    expect(llamadas).toBe(0)
    expect(sigue.ok && sigue.resultado.comprobante).toBe('bloqueado_dominio')
    expect((await almacen.buscarPorId(fila.id))?.outbox.id).toBe(fila.outbox.id)

    const fallo = await reintentarComprobante(token, {
      tokens, almacen, ahora: Date.parse('2026-11-07T12:35:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async (f: SolicitudFila) => {
        expect(f.correo).toBe('persona@example.com')
        return { ok: false, error: 'resend_500' }
      },
    })
    expect(fallo.ok && fallo.resultado.comprobante).toBe('fallido')
    expect(fallo.ok && fallo.resultado.mensaje).toContain('destinatario no cambió')
    expect((await almacen.buscarPorId(fila.id))?.correo).toBe('persona@example.com')
  })

  it('un enlace vencido o un envío simultáneo no manda un segundo correo', async () => {
    const { almacen, tokens, token } = await bloqueada()
    const vencido = await reintentarComprobante(token, {
      tokens, almacen, ahora: Date.parse('2026-11-07T15:00:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async () => { throw new Error('no') },
    })
    expect(vencido.ok).toBe(false)

    const vivo = await bloqueada()
    let liberar: (v: { ok: true; id: string }) => void = () => {}
    const espera = new Promise<{ ok: true; id: string }>((r) => { liberar = r })
    let llamadas = 0
    const primero = reintentarComprobante(vivo.token, {
      tokens: vivo.tokens, almacen: vivo.almacen, ahora: Date.parse('2026-11-07T12:30:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async (f) => { llamadas++; expect(f.correo).toBe('persona@example.com'); return espera },
    })
    await vi.waitFor(() => expect(llamadas).toBe(1))
    const segundo = await reintentarComprobante(vivo.token, {
      tokens: vivo.tokens, almacen: vivo.almacen, ahora: Date.parse('2026-11-07T12:30:00Z'),
      remitente: 'Valle Directo <planes@example.com>',
      enviar: async () => { llamadas++; return { ok: true, id: 're_extra' } },
    })
    expect(segundo.ok && segundo.resultado.reenviado).toBe(false)
    expect(llamadas).toBe(1)
    liberar({ ok: true, id: 're_1' })
    const cerrado = await primero
    expect(cerrado.ok && cerrado.resultado.reenviado).toBe(true)
    expect(llamadas).toBe(1)
  })
})
