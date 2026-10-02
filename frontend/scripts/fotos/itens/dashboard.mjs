// Itens do painel (Dashboard)
const centralizar = (loc) => loc.evaluate(el => el.scrollIntoView({ block: 'center' }))

// Passa o mouse (computador) ou toca (celular) num ponto do gráfico
async function apontar(page, seletor, fracX, mobile) {
  const loc = page.locator(seletor).first()
  await centralizar(loc)
  await page.waitForTimeout(150)
  const box = await loc.boundingBox()
  const x = box.x + box.width * fracX
  const y = box.y + box.height * 0.45
  if (mobile) await page.touchscreen.tap(x, y)
  else await page.mouse.move(x, y)
  await page.locator('.ft-chart-tip').first().waitFor()
}

// Relógio da página parado: as respostas da demonstração (que esperam alguns ms) ficam pendentes.
// Avança de 20 em 20 ms até o seletor aparecer e para ali.
async function congelarAte(page, seletor, maxMs = 3000) {
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 60_000)
  await page.reload({ waitUntil: 'domcontentloaded' })
  for (let t = 0; t < maxMs; t += 20) {
    if (await page.locator(seletor).count()) return
    await page.clock.runFor(20)
    await page.waitForTimeout(15)
  }
  throw new Error(`não apareceu: ${seletor}`)
}

// Altera a base da demonstração guardada na aba e recarrega a tela
async function mexerNaBase(page, fn, arg) {
  await page.evaluate(({ fonte, arg }) => {
    const k = 'ft-demo-db'
    const db = JSON.parse(sessionStorage.getItem(k))
    new Function('db', 'arg', fonte)(db, arg)
    sessionStorage.setItem(k, JSON.stringify(db))
  }, { fonte: `(${fn.toString()})(db, arg)`, arg })
  await page.reload({ waitUntil: 'domcontentloaded' })
}

function limparCacheDoResumo() {
  const k = 'ft-demo-db'
  const db = JSON.parse(sessionStorage.getItem(k))
  db.insight_cache = {}
  sessionStorage.setItem(k, JSON.stringify(db))
}

export default [
  { id: 'dashboard', rota: '/dashboard' },
  { id: 'dashboard-vazio', rota: '/dashboard', vazio: true },
  {
    id: 'dashboard-dica-mensal', rota: '/dashboard', inteira: false,
    acao: (page, { mobile }) => apontar(page, '[data-chart="mensal"]', 0.62, mobile),
  },
  {
    id: 'dashboard-dica-projecao', rota: '/dashboard', inteira: false,
    acao: (page, { mobile }) => apontar(page, '[data-chart="projecao"]', 0.4, mobile),
  },
  {
    id: 'dashboard-dica-patrimonio', rota: '/dashboard', inteira: false,
    acao: (page, { mobile }) => apontar(page, '[data-chart="patrimonio"]', 0.5, mobile),
  },
  {
    // Teclado: foco no gráfico e setas percorrem os meses
    id: 'dashboard-teclado', rota: '/dashboard', inteira: false, somente: 'desktop',
    acao: async page => {
      const grafico = page.locator('.ft-chart:has([data-chart="mensal"])')
      await grafico.focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.locator('.ft-chart-tip').first().waitFor()
    },
  },
  {
    id: 'dashboard-projecao-todos', rota: '/dashboard', inteira: false,
    acao: async page => {
      const botao = page.getByRole('button', { name: /mostrar todos|show all/i })
      await botao.click()
      await centralizar(page.getByRole('button', { name: /mostrar menos|show less/i }))
    },
  },
  {
    id: 'dashboard-resumo-atualizado', rota: '/dashboard', inteira: false,
    acao: async page => {
      const botao = page.getByRole('button', { name: /atualizar resumo|refresh summary/i })
      await centralizar(botao)
      await botao.click()
      await page.waitForFunction(() => !document.querySelector('.ft-dash-insight[aria-busy="true"]'))
    },
  },
  {
    // Resposta da IA com markdown cru (como pode vir da API): a tela limpa e organiza
    id: 'dashboard-resumo-markdown', rota: '/dashboard', inteira: false,
    acao: async page => {
      await mexerNaBase(page, (db) => {
        const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const h = new Date()
        const periodo = `${iso(new Date(h.getFullYear(), h.getMonth(), 1))}:${iso(new Date(h.getFullYear(), h.getMonth() + 1, 0))}`
        const ts = new Date(Date.now() - 42 * 60000).toISOString()
        db.insight_cache[`${periodo}:pt`] = { ts, text: `## Resumo
**Você guardou 20%** do que entrou: R$ 6.289,31 contra R$ 5.040,30 de gastos.
- *Moradia* foi a maior despesa, com R$ 2.223,77.
- Lazer passou do orçamento em R$ 24,67.
No ritmo atual, a reserva fica completa em cerca de 4 meses.` }
        db.insight_cache[`${periodo}:en`] = { ts, text: `## Summary
**You kept 20%** of what came in: R$6,289.31 against R$5,040.30 of spending.
- *Housing* was the largest expense at R$2,223.77.
- Leisure went R$24.67 over budget.
At this pace, the emergency fund is complete in about 4 months.` }
      })
      const card = page.locator('.ft-dash-insight')
      await card.locator('.ft-insight__text li').first().waitFor()
      await centralizar(card)
    },
  },
  {
    id: 'dashboard-resumo-carregando', rota: '/dashboard', inteira: false,
    acao: async page => {
      await page.evaluate(limparCacheDoResumo)
      await congelarAte(page, '.ft-dash-insight[aria-busy="true"] .ft-insight__skeleton')
      await centralizar(page.locator('.ft-dash-insight'))
    },
  },
  {
    id: 'dashboard-carregando', rota: '/dashboard', inteira: false,
    acao: async page => {
      await congelarAte(page, '.ft-dash .ft-skeleton')
    },
  },
  {
    // Saldo baixo e o aluguel caindo no meio da janela: a projeção fica negativa
    id: 'dashboard-projecao-negativa', rota: '/dashboard', inteira: false,
    acao: async page => {
      await mexerNaBase(page, (db) => {
        const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const hoje = new Date()
        const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 13)
        const aluguel = db.transactions.find(t => t.id === 'tx-0-1')
        aluguel.transaction_date = iso(new Date(alvo.getFullYear(), alvo.getMonth() - 1, alvo.getDate()))
        const saldos = { 'acc-nub': 900, 'acc-inter': 250, 'acc-sic': 50 }
        db.accounts.forEach(a => { a.balance = saldos[a.id] ?? a.balance })
      })
      const card = page.locator('.ft-dash-cashflow')
      await card.locator('[data-chart="projecao"] svg').waitFor()
      await centralizar(card)
    },
  },
  {
    // Relógio no dia 18: a demonstração é recriada nessa data e os recorrentes se espalham pela projeção
    id: 'dashboard-meio-do-mes', rota: '/dashboard',
    acao: async page => {
      const h = new Date()
      await page.clock.setFixedTime(new Date(h.getFullYear(), h.getMonth(), 18, 10, 0))
      await page.evaluate(() => sessionStorage.removeItem('ft-demo-db'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('[data-chart="projecao"] svg').waitFor()
    },
  },
  {
    // Dica da projeção com vários lançamentos no mesmo dia
    id: 'dashboard-meio-do-mes-dica', rota: '/dashboard', inteira: false,
    acao: async (page, { mobile }) => {
      const h = new Date()
      await page.clock.setFixedTime(new Date(h.getFullYear(), h.getMonth(), 18, 10, 0))
      await page.evaluate(() => sessionStorage.removeItem('ft-demo-db'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      // 5 do mês seguinte: salário (dia 18 + 18 dias ≈ 60% da janela)
      await apontar(page, '[data-chart="projecao"]', 0.6, mobile)
    },
  },
  {
    id: 'dashboard-resumo-erro', rota: '/dashboard', inteira: false,
    acao: async page => {
      await page.evaluate(limparCacheDoResumo)
      await mexerNaBase(page, (db) => { db.goals = null })
      const botao = page.locator('.ft-dash-insight').getByRole('button', { name: /tentar de novo|try again/i })
      await botao.waitFor()
      await centralizar(botao)
    },
  },
  {
    id: 'dashboard-vazio-com-conta', rota: '/dashboard', vazio: true,
    acao: async page => {
      await mexerNaBase(page, (db) => {
        db.accounts = [{ id: 'acc-1', user_id: db.user.id, name: 'Nubank', bank_name: 'Nubank', bank_color: '#820ad1', account_type: 'checking', currency: 'BRL', balance: 2500, is_active: true, created_at: db.created_at, updated_at: db.created_at }]
      })
      await page.getByText(/concluído|done/i).first().waitFor()
    },
  },
  {
    // Atalho do cabeçalho abre a tela de transações já com o formulário aberto
    id: 'dashboard-atalho-nova', rota: '/dashboard', inteira: false,
    acao: async page => {
      await page.getByRole('link', { name: /nova transação|new transaction/i }).click()
      await page.waitForURL(/\/transactions/)
      await page.getByRole('dialog').waitFor()
    },
  },
  {
    id: 'dashboard-erro', rota: '/dashboard', inteira: false,
    acao: async page => {
      // Base da demonstração corrompida de propósito: as rotas falham e a tela mostra o erro
      await page.evaluate(() => {
        const k = 'ft-demo-db'
        const db = JSON.parse(sessionStorage.getItem(k))
        db.transactions = null
        sessionStorage.setItem(k, JSON.stringify(db))
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: /tentar de novo|try again/i }).waitFor()
    },
  },
]
