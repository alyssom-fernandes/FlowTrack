// Metas, orçamentos e investimentos: telas, abas, modais, confirmações e estados vazios
const hoje = new Date()
const mes = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const proximoMes = mes(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1))

const editar = /^(editar|edit) /i
const excluir = /^(excluir|delete) /i

const mesPassado = mes(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1))

async function dialogo(page) {
  await page.getByRole('dialog').waitFor()
}

// Muda o valor alvo do n-ésimo cartão de meta pelo modal de edição
async function mudarAlvo(page, n, valor) {
  await page.locator('.gl-card').nth(n).getByRole('button', { name: editar }).click()
  await dialogo(page)
  await page.getByLabel(/^(limite|limit|valor a juntar|amount to save)$/i).fill(valor)
  await page.getByRole('button', { name: /^(salvar alterações|save changes)$/i }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}

export default [
  // ── Metas ──
  { id: 'metas', rota: '/goals' },
  { id: 'metas-vazio', rota: '/goals', vazio: true },
  {
    // Situações que a demonstração não tem de saída: limite estourado, limite perto do fim e meta concluída
    id: 'metas-situacoes', rota: '/goals',
    acao: async page => {
      await mudarAlvo(page, 1, '250')
      await mudarAlvo(page, 2, '1800')
      await mudarAlvo(page, 3, '10000')
      await page.locator('.ft-toast').last().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
      // Volta ao topo para o cabeçalho fixo não aparecer no meio da foto inteira
      await page.evaluate(() => window.scrollTo(0, 0))
    },
  },
  { id: 'metas-nova', rota: '/goals', inteira: false, acao: async page => { await page.getByRole('button', { name: /^(nova meta|new goal)$/i }).click(); await dialogo(page) } },
  {
    id: 'metas-nova-economia', rota: '/goals', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(nova meta|new goal)$/i }).click()
      await dialogo(page)
      await page.getByRole('tab', { name: /^(meta de economia|savings goal)$/i }).click()
      await page.getByLabel(/^(fim|end)$/i).waitFor()
    },
  },
  {
    id: 'metas-nova-erros', rota: '/goals', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(nova meta|new goal)$/i }).click()
      await dialogo(page)
      await page.getByRole('button', { name: /^(criar meta|create goal)$/i }).click()
      await page.getByRole('alert').first().waitFor()
    },
  },
  { id: 'metas-editar', rota: '/goals', inteira: false, acao: async page => { await page.getByRole('button', { name: editar }).first().click(); await dialogo(page) } },
  { id: 'metas-excluir', rota: '/goals', inteira: false, acao: async page => { await page.getByRole('button', { name: excluir }).first().click(); await dialogo(page) } },
  {
    id: 'metas-vazio-economia', rota: '/goals', vazio: true, inteira: false,
    acao: async page => { await page.getByRole('button', { name: /^(criar meta de economia|create savings goal)$/i }).click(); await dialogo(page) },
  },

  // ── Orçamentos ──
  { id: 'orcamentos', rota: '/goals?aba=orcamentos' },
  { id: 'orcamentos-vazio', rota: '/goals?aba=orcamentos', vazio: true },
  { id: 'orcamentos-mes-vazio', rota: `/goals?aba=orcamentos&mes=${proximoMes}` },
  { id: 'orcamentos-mes-passado', rota: `/goals?aba=orcamentos&mes=${mesPassado}` },
  {
    id: 'orcamentos-copiar', rota: `/goals?aba=orcamentos&mes=${proximoMes}`,
    acao: async page => {
      await page.getByRole('button', { name: /^(copiar de|copy from)/i }).click()
      await page.getByRole('list', { name: /orçamentos por categoria|budgets by category/i }).waitFor()
    },
  },
  {
    id: 'orcamentos-novo', rota: '/goals?aba=orcamentos', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(novo orçamento|new budget)$/i }).click()
      await dialogo(page)
      await page.getByLabel(/^(categoria|category)$/i).selectOption({ index: 1 })
      await page.getByText(/média dos últimos|3-month average|sem gastos|no spending/i).waitFor()
    },
  },
  { id: 'orcamentos-editar', rota: '/goals?aba=orcamentos', inteira: false, acao: async page => { await page.getByRole('button', { name: editar }).first().click(); await dialogo(page) } },
  { id: 'orcamentos-excluir', rota: '/goals?aba=orcamentos', inteira: false, acao: async page => { await page.getByRole('button', { name: excluir }).first().click(); await dialogo(page) } },

  // ── Investimentos ──
  { id: 'investimentos', rota: '/investments' },
  { id: 'investimentos-vazio', rota: '/investments', vazio: true },
  {
    id: 'investimentos-dica', rota: '/investments', inteira: false,
    acao: async (page, { mobile }) => {
      const seg = page.locator('.inv-alloc__seg').nth(1)
      await seg.scrollIntoViewIfNeeded()
      if (mobile) await seg.tap(); else await seg.hover()
      await page.waitForTimeout(300)
      await page.locator('.inv-tip').waitFor()
    },
  },
  { id: 'investimentos-novo', rota: '/investments', inteira: false, acao: async page => { await page.getByRole('button', { name: /^(novo investimento|new investment)$/i }).click(); await dialogo(page) } },
  {
    id: 'investimentos-novo-preenchido', rota: '/investments', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(novo investimento|new investment)$/i }).click()
      await dialogo(page)
      await page.getByLabel(/^(nome|name)$/i).fill('PETR4')
      await page.getByLabel(/^(tipo|type)$/i).selectOption('acoes')
      await page.getByLabel(/^(valor investido|amount invested)$/i).fill('2.400,00')
      await page.getByLabel(/^(valor atual|current value)$/i).fill('2.215,40')
    },
  },
  {
    id: 'investimentos-novo-erros', rota: '/investments', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(novo investimento|new investment)$/i }).click()
      await dialogo(page)
      await page.getByRole('button', { name: /^(adicionar investimento|add investment)$/i }).click()
      await page.getByRole('alert').first().waitFor()
    },
  },
  { id: 'investimentos-editar', rota: '/investments', inteira: false, acao: async page => { await page.getByRole('button', { name: editar }).first().click(); await dialogo(page) } },
  { id: 'investimentos-excluir', rota: '/investments', inteira: false, acao: async page => { await page.getByRole('button', { name: excluir }).first().click(); await dialogo(page) } },
]
