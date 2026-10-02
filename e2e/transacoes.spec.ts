import { test, expect, abrirDemo, semErros, opcaoExportar } from './fixtures'

test.describe('Transações', () => {
  test('cria, edita e exclui uma transação', async ({ page }) => {
    await abrirDemo(page, '/transactions')
    await page.getByRole('button', { name: /nova transação|^nova$/i }).first().click()
    const modal = page.getByRole('dialog')
    await modal.getByLabel(/descrição/i).fill('Teste E2E mercado')
    await modal.getByLabel(/^valor/i).fill('42,50')
    await modal.getByRole('button', { name: /^salvar$/i }).click()
    await expect(page.getByText('Teste E2E mercado').first()).toBeVisible()

    await page.getByText('Teste E2E mercado').first().click()
    const edicao = page.getByRole('dialog')
    await edicao.getByLabel(/descrição/i).fill('Teste E2E feira')
    await edicao.getByRole('button', { name: /salvar/i }).click()
    await expect(page.getByText('Teste E2E feira').first()).toBeVisible()

    await page.getByText('Teste E2E feira').first().click()
    await page.getByRole('dialog').getByRole('button', { name: /^excluir$/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /excluir transação/i }).click()
    await expect(page.getByText('Teste E2E feira')).toHaveCount(0)
    await semErros(page)
  })

  const FORMATOS = [{ nome: /csv/i, ext: '.csv' }, { nome: /excel/i, ext: '.xlsx' }]
  for (const formato of FORMATOS) {
    test(`exporta ${formato.ext}`, async ({ page }) => {
      await abrirDemo(page, '/transactions')
      await page.getByRole('button', { name: /exportar/i }).first().click()
      const [arquivo] = await Promise.all([
        page.waitForEvent('download'),
        opcaoExportar(page, formato.nome).click(),
      ])
      expect(arquivo.suggestedFilename().startsWith('flowtrack-transacoes-')).toBe(true)
      expect(arquivo.suggestedFilename().endsWith(formato.ext)).toBe(true)
      await semErros(page)
    })
  }
})
