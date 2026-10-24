import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Prueba de cierre (Fase 3): un enlace /i/<id> abierto en otro navegador muestra el mismo itinerario,
// y el resultado visto 3 s registra una fila de demanda anónima.
const API = process.env.API_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SR = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const cab = { apikey: SR, Authorization: `Bearer ${SR}` }
const compartidos: string[] = []
let ultimaDemandaAntes = 0

const contarDemanda = async () => {
  const r = await fetch(`${API}/rest/v1/demanda?select=id&order=id.desc&limit=1`, { headers: cab })
  const filas = (await r.json()) as { id: number }[]
  return filas[0]?.id ?? 0
}
const totalDemanda = async () => {
  const r = await fetch(`${API}/rest/v1/demanda?select=id`, { headers: { ...cab, Prefer: 'count=exact', Range: '0-0' } })
  return Number((r.headers.get('content-range') ?? '*/0').split('/')[1])
}

// Paradas, comida y hospedaje de cada día, por el enlace «Ver detalle» (id del lugar).
const paradasPorDia = (page: Page) => page.locator('.it-dia').evaluateAll((dias) =>
  dias.map((d) => [...d.querySelectorAll('.it-paso a[href*="/lugares/"]')].map((a) => a.getAttribute('href'))))

async function sinScrollHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
}

test.beforeAll(async () => { if (SR) ultimaDemandaAntes = await contarDemanda() })
test.afterAll(async () => {
  if (!SR) return
  for (const id of compartidos) await fetch(`${API}/rest/v1/itinerarios_compartidos?id=eq.${id}`, { method: 'DELETE', headers: cab })
  await fetch(`${API}/rest/v1/demanda?id=gt.${ultimaDemandaAntes}`, { method: 'DELETE', headers: cab })
})

test('compartir un itinerario y abrirlo en otro navegador; la demanda se registra a los 3 s', async ({ browser }) => {
  test.skip(!SR, 'Requiere SERVICE_ROLE_KEY y Supabase local')
  const antes = await totalDemanda()

  const ctxA = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const a = await ctxA.newPage()
  const consola: string[] = []
  a.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()) })
  await a.goto('/#/itinerario')
  await a.getByRole('group', { name: 'Plan' }).getByRole('button').first().click()
  await expect(a.locator('.resultado')).toBeVisible()
  await expect(a.getByRole('list', { name: 'Resumen del itinerario' }).or(a.getByLabel('Resumen del itinerario'))).toContainText('Hospedaje')
  await expect(a.getByText('Probar otra ruta')).toBeVisible()
  await a.waitForLoadState('networkidle')
  await sinScrollHorizontal(a)
  await a.screenshot({ path: 'test-results/compartir-375.png', fullPage: true })

  // Demanda: a los 3 s del resultado estable aparece una fila.
  await expect.poll(totalDemanda, { timeout: 15_000 }).toBeGreaterThan(antes)

  // Compartir: copiar enlace.
  await a.getByRole('button', { name: 'Copiar enlace' }).click()
  const campo = a.getByLabel('Enlace para compartir')
  await expect(campo).toBeVisible()
  const enlace = await campo.inputValue()
  expect(enlace).toMatch(/#\/i\/[A-Za-z0-9]{8}$/)
  compartidos.push(enlace.slice(-8))
  await expect(a.getByText(/Enlace copiado|No pudimos copiarlo/)).toBeVisible()
  await sinScrollHorizontal(a)
  const esperado = await paradasPorDia(a)
  expect(esperado.flat().length).toBeGreaterThan(0)

  // Otro contexto (sin localStorage compartido) abre el enlace.
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const b = await ctxB.newPage()
  await b.goto(enlace)
  await expect(b).toHaveURL(/#\/itinerario$/)
  await expect(b.locator('.resultado')).toBeVisible()
  await b.waitForLoadState('networkidle')
  await expect.poll(() => paradasPorDia(b), { timeout: 15_000 }).toEqual(esperado)
  await sinScrollHorizontal(b)
  await b.screenshot({ path: 'test-results/compartido-375.png', fullPage: true })

  // Un enlace que no existe muestra un mensaje claro.
  await b.goto('/#/i/NoExiste')
  await expect(b.getByText('No encontramos este itinerario')).toBeVisible()

  expect(consola.filter((t) => !/favicon|tile|openstreetmap/i.test(t))).toEqual([])
  await ctxA.close(); await ctxB.close()
})
