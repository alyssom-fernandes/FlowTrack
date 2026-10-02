export default [
  { id: 'transacoes', rota: '/transactions' },
  { id: 'transacoes-vazio', rota: '/transactions', vazio: true },
  { id: 'transacoes-nova', rota: '/transactions', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova transação|new transaction/i }).first().click() } },
  { id: 'transacoes-importar', rota: '/transactions', inteira: false, acao: async page => { await page.getByRole('button', { name: /importar|import/i }).first().click() } },
]
