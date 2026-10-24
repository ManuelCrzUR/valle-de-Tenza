import { test, expect } from '@playwright/test'

// Los enlaces compartidos antes del cambio a BrowserRouter (`/#/ruta`) siguen funcionando.
test('/#/lugares termina en /lugares', async ({ page }) => {
  await page.goto('/#/lugares')
  await expect(page).toHaveURL(/\/lugares$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('/#/i/xxxx termina en /i/xxxx y conserva la query', async ({ page }) => {
  await page.goto('/#/i/xxxx')
  await expect(page).toHaveURL(/\/i\/xxxx$/)
  await page.goto('/?a=1#/reservar/abc?fecha=2030-01-01')
  await expect(page).toHaveURL(/\/reservar\/abc\?fecha=2030-01-01&a=1$/)
})
