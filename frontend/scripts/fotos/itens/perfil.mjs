// Perfil: abas Geral, Contas, Categorias e Histórico, com modais e confirmações
const semToast = async page => { await page.locator('.ft-toast').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {}) }

async function criarCategoria(page) {
  await page.getByRole('button', { name: /nova categoria|new category/i }).first().click()
  await page.getByLabel(/^(nome|name)$/i).fill('Pets')
  await page.getByRole('radio', { name: /#2a78d6/i }).click()
  await page.getByRole('radio', { name: /^pet$/i }).click()
  await page.getByRole('button', { name: /criar categoria|create category/i }).click()
  await page.getByRole('button', { name: /^Pets/ }).first().waitFor()
  await semToast(page)
}

export default [
  // Geral
  { id: 'perfil', rota: '/profile' },
  { id: 'perfil-preferencias-en', rota: '/profile', acao: async page => { await page.getByRole('radio', { name: 'English' }).click() } },
  { id: 'perfil-restaurar', rota: '/profile', inteira: false, acao: async page => { await page.getByRole('button', { name: /^(restaurar|restore|reset)$/i }).click() } },

  // Contas
  { id: 'perfil-contas', rota: '/profile?tab=accounts' },
  { id: 'perfil-contas-vazio', rota: '/profile?tab=accounts', vazio: true },
  { id: 'perfil-nova-conta', rota: '/profile?tab=accounts', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova conta|new account/i }).first().click() } },
  {
    id: 'perfil-nova-conta-erro', rota: '/profile?tab=accounts', inteira: false, acao: async page => {
      await page.getByRole('button', { name: /nova conta|new account/i }).first().click()
      await page.getByLabel(/saldo atual|current balance/i).fill('12 reais')
      await page.getByRole('button', { name: /criar conta|create account/i }).click()
    },
  },
  { id: 'perfil-editar-conta', rota: '/profile?tab=accounts', inteira: false, acao: async page => { await page.getByRole('button', { name: /^Nubank/ }).first().click() } },
  {
    id: 'perfil-excluir-conta', rota: '/profile?tab=accounts', inteira: false, acao: async (page, { mobile }) => {
      if (mobile) {
        await page.getByRole('button', { name: /^Inter/ }).first().click()
        await page.getByRole('button', { name: /excluir conta|delete account/i }).click()
      } else {
        await page.getByRole('button', { name: /(excluir|delete) inter/i }).click()
      }
    },
  },

  // Categorias
  { id: 'perfil-categorias', rota: '/profile?tab=categories' },
  { id: 'perfil-nova-categoria', rota: '/profile?tab=categories', inteira: false, acao: async page => { await page.getByRole('button', { name: /nova categoria|new category/i }).first().click() } },
  {
    // Prévia ao vivo: nome digitado, cor e glifo escolhidos antes de criar
    id: 'perfil-nova-categoria-preenchida', rota: '/profile?tab=categories', inteira: false, acao: async page => {
      await page.getByRole('button', { name: /nova categoria|new category/i }).first().click()
      await page.getByLabel(/^(nome|name)$/i).fill('Pets')
      await page.getByRole('radio', { name: /#2a78d6/i }).click()
      await page.getByRole('radio', { name: /^pet$/i }).click()
    },
  },
  { id: 'perfil-categoria-criada', rota: '/profile?tab=categories', acao: criarCategoria },
  {
    id: 'perfil-editar-categoria', rota: '/profile?tab=categories', inteira: false, acao: async page => {
      await criarCategoria(page)
      await page.getByRole('button', { name: /^Pets/ }).first().click()
    },
  },
  {
    id: 'perfil-excluir-categoria', rota: '/profile?tab=categories', inteira: false, acao: async (page, { mobile }) => {
      await criarCategoria(page)
      if (mobile) {
        await page.getByRole('button', { name: /^Pets/ }).first().click()
        await page.getByRole('button', { name: /excluir categoria|delete category/i }).click()
      } else {
        await page.getByRole('button', { name: /(excluir|delete) pets/i }).click()
      }
    },
  },

  // Histórico
  { id: 'perfil-historico', rota: '/profile?tab=history' },
  { id: 'perfil-historico-vazio', rota: '/profile?tab=history', vazio: true },
  { id: 'perfil-desfazer', rota: '/profile?tab=history', inteira: false, acao: async page => { await page.getByRole('button', { name: /^(desfazer|undo):/i }).first().click() } },
]
