export default [
  { id: 'metas', rota: '/goals' },
  { id: 'metas-vazio', rota: '/goals', vazio: true },
  { id: 'metas-nova', rota: '/goals', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova meta|new goal/i }).first().click() } },
  { id: 'investimentos', rota: '/investments' },
  { id: 'investimentos-vazio', rota: '/investments', vazio: true },
  { id: 'investimentos-novo', rota: '/investments', inteira: false, acao: async page => { await page.getByRole('button', { name: /novo investimento|new investment/i }).first().click() } },
]
