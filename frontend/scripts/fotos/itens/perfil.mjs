export default [
  { id: 'perfil', rota: '/profile' },
  { id: 'perfil-vazio', rota: '/profile', vazio: true },
  { id: 'perfil-nova-conta', rota: '/profile', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova conta|new account/i }).first().click() } },
  { id: 'perfil-nova-categoria', rota: '/profile', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova categoria|new category/i }).first().click() } },
]
