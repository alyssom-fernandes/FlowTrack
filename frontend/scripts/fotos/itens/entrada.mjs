// Login e redefinição de senha (fora da demonstração)
export default [
  { id: 'entrada', rota: '/login', semDemo: true },
  { id: 'entrada-esqueci', rota: '/login', semDemo: true, acao: async page => { await page.getByText(/esqueci/i).first().click() } },
  { id: 'redefinir-senha', rota: '/reset-password', semDemo: true },
]
