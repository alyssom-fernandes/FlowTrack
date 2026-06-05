import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('renders login page', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('img', { name: 'FlowTrack' })).toBeVisible()
    await expect(page.getByRole('button', { name: /modo demo/i })).toBeVisible()
  })

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('E-mail').fill('wrong@email.com')
    await page.getByLabel('Senha').fill('wrongpassword')
    await page.getByRole('button', { name: /entrar/i }).click()
    await expect(page.getByText(/e-mail ou senha incorretos/i)).toBeVisible()
  })

  test('accesses demo mode without credentials', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /modo demo/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
  })

  test('forgot password flow shows confirmation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /esqueci a senha/i }).click()
    await page.getByLabel('E-mail').fill('test@example.com')
    await page.getByRole('button', { name: /enviar link/i }).click()
    await expect(page.getByText(/link enviado/i)).toBeVisible()
  })
})
