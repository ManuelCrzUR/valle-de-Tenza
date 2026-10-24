import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'

// 1x1 PNG: las teselas se simulan, así la prueba no depende de OSM ni de internet.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('guardar la ruta, quedarse sin señal y abrirla completa con mapa y fichas', async ({ page, context }, info) => {
  const simular = (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG })
  await context.route('https://tile.openstreetmap.org/**', simular)
  await page.goto('/itinerario')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()   // ya controlada por el service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await page.getByRole('group', { name: 'Plan' }).getByRole('button').first().click()
  await page.getByRole('group', { name: 'Días' }).getByRole('button', { name: '1 día' }).click()
  const lista = page.locator('.it-paso')
  await expect(lista.first()).toBeVisible()
  const nombres = (await lista.locator('span').allInnerTexts()).filter(Boolean)
  const detalle = await page.locator('.it-paso a:has-text("Ver detalle")').first().getAttribute('href')

  await page.getByRole('button', { name: 'Guardar para ver sin señal' }).click()
  await expect(page.getByText(/Listo: guardamos tu ruta/)).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: `${process.env.CAPTURAS_DIR ?? info.outputDir}/guardada.png`, fullPage: true })

  await context.unroute('https://tile.openstreetmap.org/**', simular)   // desde aquí solo la caché puede dar teselas
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Sin conexión — viendo tu ruta guardada')).toBeVisible()
  await expect(page.locator('.it-paso').first()).toBeVisible()
  expect((await page.locator('.it-paso span').allInnerTexts()).filter(Boolean)).toEqual(nombres)
  await page.screenshot({ path: `${process.env.CAPTURAS_DIR ?? info.outputDir}/offline-itinerario.png`, fullPage: true })

  // Mapa de la ruta con teselas servidas desde la caché
  await page.getByRole('link', { name: /Ver mi ruta en el mapa/ }).click()
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('img.leaflet-tile')].filter((i) => i.naturalWidth > 0).length), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.screenshot({ path: `${process.env.CAPTURAS_DIR ?? info.outputDir}/offline-mapa.png` })

  // Ficha de un lugar de la ruta, con recarga completa sin señal (navegación → shell)
  await page.goto(detalle!)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/no encontrad/i)
  await page.screenshot({ path: `${process.env.CAPTURAS_DIR ?? info.outputDir}/offline-ficha.png` })
})
