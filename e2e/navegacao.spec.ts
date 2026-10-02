import { test, expect, abrirDemo, semErros } from './fixtures'

const TELAS = [
  { rota: '/dashboard', titulo: /dashboard/i },
  { rota: '/transactions', titulo: /transações/i },
  { rota: '/investments', titulo: /investimentos/i },
  { rota: '/goals', titulo: /metas/i },
  { rota: '/goals?aba=orcamentos', titulo: /metas/i },
  { rota: '/reports', titulo: /relatórios/i },
  { rota: '/profile', titulo: /perfil/i },
]

test.describe('Navegação na demonstração', () => {
  for (const tela of TELAS) {
    test(`${tela.rota} abre sem erros`, async ({ page }) => {
      await abrirDemo(page, tela.rota)
      await expect(page.getByRole('heading', { level: 1, name: tela.titulo })).toBeVisible()
      await semErros(page)
    })
  }

  test('estados vazios abrem sem erros', async ({ page }) => {
    for (const tela of TELAS) {
      await abrirDemo(page, tela.rota, { vazio: true })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await semErros(page)
    }
  })

  test('nada de rolagem horizontal', async ({ page }) => {
    for (const tela of TELAS) {
      await abrirDemo(page, tela.rota)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largo = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      expect(largo, `rolagem horizontal em ${tela.rota}`).toBe(false)
    }
  })
})
