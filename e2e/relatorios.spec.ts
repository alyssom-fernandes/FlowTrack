import { test, expect, abrirDemo, semErros, opcaoExportar } from './fixtures'

test.describe('Relatórios', () => {
  const FORMATOS = [{ nome: /pdf/i, ext: '.pdf' }, { nome: /excel/i, ext: '.xlsx' }, { nome: /csv/i, ext: '.csv' }]
  for (const formato of FORMATOS) {
    test(`exporta ${formato.ext}`, async ({ page }) => {
      await abrirDemo(page, '/reports')
      await page.getByRole('button', { name: /exportar/i }).first().click()
      const [arquivo] = await Promise.all([
        page.waitForEvent('download'),
        opcaoExportar(page, formato.nome).click(),
      ])
      expect(arquivo.suggestedFilename().endsWith(formato.ext)).toBe(true)
      await semErros(page)
    })
  }
})
