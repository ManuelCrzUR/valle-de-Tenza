import { test, expect } from '@playwright/test'
import type { Browser } from '@playwright/test'

const API = process.env.API_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SR = process.env.SERVICE_ROLE_KEY ?? ''
const MAILPIT = process.env.MAILPIT_URL ?? process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'
const NEGOCIO_ID = '33333333-3333-4333-8333-333333333333'
const LUGAR = `negocio:${NEGOCIO_ID}`
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const corrida = Date.now().toString(36)
const NOMBRE = `E2E resena ${corrida}`
const COMENTARIO = `Muy buena atención ${corrida}`
const codigo = Array.from({ length: 6 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')
const telefono = `3${Math.floor(100000000 + Math.random() * 899999999)}`
const sr = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }

test.beforeAll(async () => {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 5)
  const r = await fetch(`${API}/rest/v1/reservas`, {
    method: 'POST', headers: { ...sr, Prefer: 'return=minimal' },
    body: JSON.stringify({ codigo, negocio_id: NEGOCIO_ID, lugar_id: LUGAR, tipo: 'hotel', fecha: ayer.toLocaleDateString('en-CA'), noches: 1, personas: 2, nombre: NOMBRE, contacto: telefono, estado: 'confirmada' }),
  })
  expect(r.status, await r.clone().text()).toBeLessThan(300)
})
test.afterAll(async () => {
  if (!SR) return
  // La reseña queda anónima (reserva_id null) al borrar la reserva: se borra primero por su comentario.
  await fetch(`${API}/rest/v1/resenas?comentario=eq.${encodeURIComponent(COMENTARIO)}`, { method: 'DELETE', headers: sr })
  await fetch(`${API}/rest/v1/reservas?codigo=eq.${codigo}`, { method: 'DELETE', headers: sr })
})

const publicas = async () => (await (await fetch(`${API}/rest/v1/resenas_publicas?lugar_id=eq.${encodeURIComponent(LUGAR)}&comentario=eq.${encodeURIComponent(COMENTARIO)}&select=id,calificacion`, { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '' } })).json()) as { id: string; calificacion: number }[]

async function entrarComoCoordinador(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  await page.goto('/prestadores/entrar')
  await page.getByLabel('Correo').fill('coordinador@prueba.local')
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(page.getByText('Te enviamos un enlace a coordinador@prueba.local')).toBeVisible()
  let enlace = ''
  await expect.poll(async () => {
    const lista = await (await fetch(`${MAILPIT}/api/v1/messages`)).json()
    if (!lista.messages?.length) return ''
    const m = await (await fetch(`${MAILPIT}/api/v1/message/${lista.messages[0].ID}`)).json()
    enlace = (m.HTML as string).match(/href="([^"]+)"/)?.[1].replace(/&amp;/g, '&') ?? ''
    return enlace
  }, { timeout: 15_000 }).not.toBe('')
  await page.goto(enlace)
  await page.goto('/coordinador')
  await expect(page.getByRole('heading', { name: 'Reseñas por moderar' })).toBeVisible()
  return { ctx, page }
}

test('el viajero reseña, el coordinador publica y la reseña pasa a la vista pública', async ({ browser }) => {
  const ctxV = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const viajero = await ctxV.newPage()
  await viajero.goto(`/resena/${codigo}`)
  await viajero.getByLabel('Teléfono o WhatsApp').fill(telefono)
  await viajero.getByRole('button', { name: 'Continuar' }).click()
  await expect(viajero.getByText('Hostal de prueba').first()).toBeVisible()
  await expect(viajero.getByText('Tu reseña se publica después de que el equipo la revise. No mostramos tu nombre ni tu teléfono.')).toBeVisible()
  await viajero.getByRole('radio', { name: /^5 estrellas/ }).check({ force: true })
  await viajero.getByLabel('Comentario (opcional)').fill(COMENTARIO)
  await expect(viajero.getByText(`${COMENTARIO.length} / 1000`)).toBeVisible()
  expect(await viajero.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await viajero.screenshot({ path: 'test-results/resena-375.png', fullPage: true })
  await viajero.getByRole('button', { name: 'Enviar reseña' }).click()
  await expect(viajero.getByText('¡Gracias! Recibimos tu reseña.')).toBeVisible()

  // Aún sin publicar: la ficha y la vista pública no la tienen.
  expect(await publicas()).toHaveLength(0)
  await viajero.goto(`/lugares/${LUGAR}`)
  await expect(viajero.getByRole('heading', { name: 'Hostal de prueba' })).toBeVisible()
  await expect(viajero.getByText(COMENTARIO)).toHaveCount(0)

  // Una segunda reseña con el mismo código se rechaza.
  await viajero.goto(`/resena/${codigo}`)
  await viajero.getByLabel('Teléfono o WhatsApp').fill(telefono)
  await viajero.getByRole('button', { name: 'Continuar' }).click()
  await expect(viajero.getByText('Ya dejaste una reseña para esta reserva')).toBeVisible()

  const { ctx: ctxC, page: coord } = await entrarComoCoordinador(browser)
  await coord.getByRole('button', { name: /^Publicar reseña de Hostal de prueba/ }).first().click()
  await expect.poll(async () => (await publicas()).length).toBe(1)
  expect((await publicas())[0].calificacion).toBe(5)

  await viajero.goto(`/lugares/${LUGAR}`)
  await expect(viajero.getByText(COMENTARIO)).toBeVisible()
  await expect(viajero.getByText(/de 5 · \d+ reseñas?/)).toBeVisible()
  await Promise.all([ctxC.close(), ctxV.close()])
})
