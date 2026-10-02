import { test, expect, abrirDemo, semErros } from './fixtures'

test.describe('Preferências', () => {
  test('troca para inglês e para o tema claro, e lembra depois de recarregar', async ({ page }) => {
    await abrirDemo(page, '/profile')
    await page.getByRole('radio', { name: /english/i }).check()
    await expect(page.getByRole('heading', { level: 1, name: /profile/i })).toBeVisible()
    await page.getByRole('radio', { name: /light/i }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: /profile/i })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await semErros(page)
  })

  test('todas as telas em inglês, sem erros', async ({ page }) => {
    for (const rota of ['/dashboard', '/transactions', '/investments', '/goals', '/reports', '/profile']) {
      await abrirDemo(page, rota, { idioma: 'en' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await semErros(page)
    }
  })
})
