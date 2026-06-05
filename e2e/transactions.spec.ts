import { test, expect } from '@playwright/test'

test.describe('Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /modo demo/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    await page.getByRole('link', { name: /transações/i }).first().click()
    await expect(page).toHaveURL(/\/transactions/)
  })

  test('renders transaction list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transações/i })).toBeVisible()
  })

  test('search input is present', async ({ page }) => {
    await expect(page.getByPlaceholder(/buscar/i)).toBeVisible()
  })

  test('import modal opens', async ({ page }) => {
    await page.getByRole('button', { name: /importar/i }).click()
    await expect(page.getByText(/PDF/i)).toBeVisible()
    await expect(page.getByText(/OFX/i)).toBeVisible()
    await expect(page.getByText(/CSV/i)).toBeVisible()
  })

  test('new transaction modal opens', async ({ page }) => {
    await page.getByRole('button', { name: /nova transação/i }).click()
    await expect(page.getByLabel(/descrição/i)).toBeVisible()
    await expect(page.getByLabel(/valor/i)).toBeVisible()
  })
})
