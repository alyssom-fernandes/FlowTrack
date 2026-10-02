import { test, expect, semErros } from './fixtures'

test.describe('Entrada', () => {
  test('mostra a marca e entra na demonstração sem cadastro', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('img', { name: 'FlowTrack' }).first()).toBeVisible()
    await page.getByRole('button', { name: /ver a demonstração|try the demo/i }).first().click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('note')).toContainText(/demonstração/i)
    await semErros(page)
  })

  test('sair da demonstração volta para a entrada', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /ver a demonstração|try the demo/i }).first().click()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.getByRole('note').getByRole('button', { name: /^sair$/i }).click()
    await expect(page).toHaveURL(/\/login/)
    await semErros(page)
  })

  test('rota protegida sem sessão leva para a entrada', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page).toHaveURL(/\/login/)
  })
})
