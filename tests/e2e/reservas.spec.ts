import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

const API = process.env.API_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SR = process.env.SERVICE_ROLE_KEY ?? ''
const MAILPIT = process.env.MAILPIT_URL ?? process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'
const NEGOCIO = 'negocio:33333333-3333-4333-8333-333333333333'

// Datos únicos por corrida: fecha futura lejana y teléfonos distintos (límite de 5 por contacto y día).
const corrida = Date.now().toString(36)
const fechaFutura = (min: number) => { const d = new Date(); d.setDate(d.getDate() + min + Math.floor(Math.random() * 120)); return d.toLocaleDateString('en-CA') }
const FECHA = fechaFutura(60)          // prueba 1
const FECHA_CUPO = fechaFutura(200)    // prueba 2: otra fecha, para que no sume ocupación con la anterior
const tel = () => `3${Math.floor(100000000 + Math.random() * 899999999)}`
const NOMBRE = `E2E ${corrida}`

async function reservar(page: Page, nombre: string, telefono: string, personas: number, FECHA_: string = FECHA) {
  await page.goto(`/reservar/${NEGOCIO}?fecha=${FECHA_}&personas=${personas}`)
  await expect(page.getByLabel('Fecha de llegada')).toHaveValue(FECHA_)
  await page.getByLabel('Tu nombre').fill(nombre)
  await page.getByLabel('Teléfono o WhatsApp').fill(telefono)
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
}

async function entrarComoPrestador(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  await page.goto('/prestadores/entrar')
  await page.getByLabel('Correo').fill('prestador@prueba.local')
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(page.getByText('Te enviamos un enlace a prestador@prueba.local')).toBeVisible()
  let enlace = ''
  await expect.poll(async () => {
    const lista = await (await fetch(`${MAILPIT}/api/v1/messages`)).json()
    if (!lista.messages?.length) return ''
    const m = await (await fetch(`${MAILPIT}/api/v1/message/${lista.messages[0].ID}`)).json()
    enlace = (m.HTML as string).match(/href="([^"]+)"/)?.[1].replace(/&amp;/g, '&') ?? ''
    return enlace
  }, { timeout: 15_000 }).not.toBe('')
  await page.goto(enlace)
  await expect(page).toHaveURL(/\/prestadores\/panel$/)
  await expect(page).not.toHaveURL(/code=/)
  await expect(page.getByRole('heading', { name: 'Calendario de cupos · próximos 30 días' })).toBeVisible()
  return { ctx, page }
}

test.afterAll(async () => {
  if (!SR) return
  await fetch(`${API}/rest/v1/reservas?nombre=like.${encodeURIComponent(`E2E ${corrida}*`)}`, { method: 'DELETE', headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
})

test('el prestador ve la solicitud en vivo y el viajero la encuentra con código + teléfono', async ({ browser }) => {
  const { ctx: ctxA, page: panel } = await entrarComoPrestador(browser)

  const ctxB = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const viajero = await ctxB.newPage()
  const telefono = tel()
  await reservar(viajero, NOMBRE, telefono, 2)
  await expect(viajero.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeVisible()
  const t0 = Date.now()

  // Sin recargar el panel de A.
  await expect(panel.getByText(`Nueva solicitud de ${NOMBRE}`)).toBeVisible({ timeout: 5000 })
  expect(Date.now() - t0).toBeLessThan(5000)
  await expect(panel.getByRole('button', { name: `Confirmar reserva de ${NOMBRE}` })).toBeVisible()

  const codigo = (await viajero.locator('dt:text-is("Código") + dd').innerText()).trim()
  expect(codigo).toMatch(/^[A-Z0-9]{4,}$/)

  // Contexto C: otro navegador, sin nada guardado.
  const ctxC = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const otro = await ctxC.newPage()
  await otro.goto('/reservas')
  await otro.getByLabel('Código de la reserva').fill(codigo)
  await otro.getByLabel('Teléfono o WhatsApp').fill(telefono)
  await otro.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(otro.getByText(`Encontramos tu reserva ${codigo}`)).toBeVisible()
  await expect(otro.getByText(`Código ${codigo}`)).toBeVisible()
  expect(await otro.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()])
})

test('con cupo 4, reservar 3 y luego 2 para la misma fecha muestra error de cupo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const page = await ctx.newPage()
  await reservar(page, `${NOMBRE} a`, tel(), 3, FECHA_CUPO)
  await expect(page.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeVisible()
  const page2 = await ctx.newPage()   // la SPA conserva la pantalla de éxito al cambiar solo el hash
  await reservar(page2, `${NOMBRE} b`, tel(), 2, FECHA_CUPO)
  await expect(page2.getByText(/cupo/i).filter({ hasText: /Sin cupo|Solo quedan/ }).first()).toBeVisible()
  await expect(page2.getByRole('heading', { name: 'Recibimos tu solicitud' })).toHaveCount(0)
  await ctx.close()
})
