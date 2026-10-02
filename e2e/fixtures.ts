import { test as base, expect, type Page } from '@playwright/test'

// Abre o app já dentro da demonstração (dados fictícios no navegador, sem servidor)
export async function abrirDemo(page: Page, rota = '/dashboard', opcoes: { idioma?: 'pt' | 'en'; tema?: 'dark' | 'light'; vazio?: boolean } = {}) {
  await page.addInitScript(({ idioma, tema, vazio }) => {
    // Só na primeira carga: depois, recarregar a página respeita o que o teste mudou
    if (sessionStorage.getItem('ft-e2e')) return
    sessionStorage.setItem('ft-e2e', '1')
    sessionStorage.setItem('ft-demo', '1')
    if (vazio) sessionStorage.setItem('ft-demo-vazio', '1')
    localStorage.setItem('ft-lang', idioma)
    localStorage.setItem('ft-theme', tema)
  }, { idioma: opcoes.idioma ?? 'pt', tema: opcoes.tema ?? 'dark', vazio: !!opcoes.vazio })
  await page.goto(rota)
}

// Nenhum erro de JS, promessa, console.error, recurso ou tradução faltando
export async function semErros(page: Page) {
  const erros = await page.evaluate(() => (window as unknown as { errosRegistrados: () => unknown[] }).errosRegistrados())
  expect(erros, JSON.stringify(erros, null, 1)).toEqual([])
}

// Opção do menu de exportação: item de menu no computador, botão da folha no celular
export function opcaoExportar(page: Page, nome: RegExp) {
  return page.getByRole('menuitem', { name: nome }).or(page.getByRole('dialog').getByRole('button', { name: nome })).first()
}

export const test = base
export { expect }
