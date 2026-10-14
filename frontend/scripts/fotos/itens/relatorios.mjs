// Relatórios: cada período, comparação, tabelas, dicas, menu de exportação,
// estados vazios e a versão de impressão. Seletores valem em pt e en.
const ABA = {
  thisMonth: /^(Este mês|This month)$/,
  lastMonth: /^(Mês passado|Last month)$/,
  '3m': /^(3 meses|3 months)$/,
  '6m': /^(6 meses|6 months)$/,
  '12m': /^(12 meses|12 months)$/,
  year: /^(Este ano|This year)$/,
  custom: /(Personalizado|Custom)/,
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diasAtras = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }

// No computador o período fica nas abas; no celular, num seletor
async function periodo(page, { mobile }, chave) {
  if (mobile) await page.getByRole('combobox', { name: /^(Período|Period)$/ }).selectOption(chave)
  else await page.getByRole('tab', { name: ABA[chave] }).click()
  await page.waitForTimeout(150)
}

async function comparar(page) {
  await page.getByRole('switch', { name: /(Comparar|Compare)/ }).click()
  await page.waitForTimeout(150)
}

async function personalizado(page, ctx, de, ate) {
  await periodo(page, ctx, 'custom')
  // Com a máquina carregada um clique pode se perder: confirma e repete uma vez
  const campo = page.getByLabel(/^(De|From)$/)
  if (!(await campo.isVisible())) await periodo(page, ctx, 'custom')
  await page.getByLabel(/^(De|From)$/).fill(de)
  await page.getByLabel(/^(Até|To)$/).fill(ate)
  await page.evaluate(() => document.activeElement && document.activeElement.blur())
  await page.waitForTimeout(200)
}

async function tabelas(page) {
  for (const tab of await page.getByRole('tab', { name: /^(Tabela|Table)$/ }).all()) await tab.click()
}

// Volta ao topo: a foto de página inteira não deve pegar barras fixas no meio
const topo = page => page.evaluate(() => window.scrollTo(0, 0))

// Passa o mouse (ou toca) num ponto do gráfico, em fração da largura
async function apontar(page, ctx, qual, fx, fy = 0.5) {
  const svg = page.locator('svg.rp-svg')[qual]()
  await svg.scrollIntoViewIfNeeded()
  const box = await svg.boundingBox()
  const pos = { x: box.width * fx, y: box.height * fy }
  if (ctx.mobile) await svg.tap({ position: pos })
  else await svg.hover({ position: pos })
  await page.waitForTimeout(150)
}

export default [
  // Padrão: últimos 6 meses
  { id: 'relatorios', rota: '/reports' },
  // As outras seções (a padrão é o Fluxo)
  { id: 'relatorios-mes-a-mes', rota: '/reports?vista=mes' },
  { id: 'relatorios-categorias', rota: '/reports?vista=categorias' },
  { id: 'relatorios-projecao', rota: '/reports?vista=projecao' },
  { id: 'relatorios-fluxo-12-meses', rota: '/reports', acao: (p, c) => periodo(p, c, '12m') },
  { id: 'relatorios-este-mes', rota: '/reports', acao: (p, c) => periodo(p, c, 'thisMonth') },
  { id: 'relatorios-mes-passado', rota: '/reports', acao: (p, c) => periodo(p, c, 'lastMonth') },
  { id: 'relatorios-3-meses', rota: '/reports', acao: (p, c) => periodo(p, c, '3m') },
  { id: 'relatorios-12-meses', rota: '/reports', acao: (p, c) => periodo(p, c, '12m') },
  { id: 'relatorios-este-ano', rota: '/reports', acao: (p, c) => periodo(p, c, 'year') },
  { id: 'relatorios-personalizado', rota: '/reports', acao: (p, c) => personalizado(p, c, diasAtras(20), diasAtras(1)) },
  { id: 'relatorios-personalizado-invalido', rota: '/reports', acao: (p, c) => personalizado(p, c, diasAtras(5), diasAtras(30)) },
  { id: 'relatorios-comparar-mes', rota: '/reports?vista=mes', acao: async (p, c) => { await periodo(p, c, 'thisMonth'); await comparar(p) } },
  { id: 'relatorios-comparar-6-meses', rota: '/reports?vista=mes', acao: async (p) => { await comparar(p) } },
  { id: 'relatorios-comparar-sem-dados', rota: '/reports?vista=mes', acao: async (p, c) => { await periodo(p, c, '12m'); await comparar(p) } },
  {
    // Erro de carga: depois de abrir, a demonstração "some" e a próxima busca vai à rede e falha
    id: 'relatorios-erro', rota: '/reports',
    acao: async (p, c) => {
      await p.evaluate(() => {
        const original = Storage.prototype.getItem
        Storage.prototype.getItem = function (k) { return k === 'ft-demo' ? null : original.call(this, k) }
      })
      await periodo(p, c, '3m')
      await p.getByRole('button', { name: /(Tentar de novo|Try again)/ }).waitFor({ timeout: 15000 })
    },
  },
  { id: 'relatorios-tabelas', rota: '/reports?vista=mes', acao: async (p, c) => { await periodo(p, c, '3m'); await comparar(p); await tabelas(p); await topo(p) } },
  {
    id: 'relatorios-categorias-demais', rota: '/reports?vista=categorias',
    acao: async (p, c) => { await periodo(p, c, '12m'); await p.getByRole('button', { name: /^(Outras \d+ categorias|\d+ more categories)/ }).click(); await topo(p) },
  },
  { id: 'relatorios-dica-barras', rota: '/reports?vista=mes', inteira: false, acao: async (p, c) => { await comparar(p); await apontar(p, c, 'first', 0.62) } },
  { id: 'relatorios-dica-projecao', rota: '/reports?vista=projecao', inteira: false, acao: (p, c) => apontar(p, c, 'last', 0.78, 0.45) },
  {
    id: 'relatorios-menu-exportar', rota: '/reports', inteira: false,
    acao: async (p) => { await p.getByRole('button', { name: /^(Exportar|Export)$/ }).click(); await p.waitForTimeout(200) },
  },
  { id: 'relatorios-sem-transacoes', rota: '/reports', acao: (p, c) => personalizado(p, c, '2020-01-01', '2020-03-31') },
  { id: 'relatorios-vazio', rota: '/reports', vazio: true },
  {
    // Folha A4 (186 mm úteis ≈ 703 px), com a mídia de impressão
    id: 'relatorios-impressao', rota: '/reports', somente: 'desktop',
    acao: async (p, c) => {
      await periodo(p, c, '3m')
      await comparar(p)
      await p.setViewportSize({ width: 703, height: 1000 })
      await p.emulateMedia({ media: 'print' })
      await p.waitForTimeout(300)
    },
  },
]
