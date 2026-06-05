import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /modo demo/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
  })

  test('renders metric cards', async ({ page }) => {
    await expect(page.getByText(/saldo total/i)).toBeVisible()
    await expect(page.getByText(/receitas/i)).toBeVisible()
    await expect(page.getByText(/gastos/i)).toBeVisible()
  })

  test('renders monthly chart', async ({ page }) => {
    await expect(page.getByText(/evolução mensal/i)).toBeVisible()
  })

  test('renders recent transactions section', async ({ page }) => {
    await expect(page.getByText(/últimas transações/i)).toBeVisible()
  })

  test('renders AI insight card', async ({ page }) => {
    await expect(page.getByText(/insight ia/i)).toBeVisible()
  })

  test('sidebar navigation is visible on desktop', async ({ page }) => {
    await expect(page.getByRole('link', { name: /transações/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /relatórios/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /metas/i })).toBeVisible()
  })
})
