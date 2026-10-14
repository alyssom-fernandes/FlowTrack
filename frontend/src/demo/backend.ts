// ── "Backend" do modo demonstração ────────────────────────
// Reproduz as rotas da API FastAPI em memória, com as mesmas regras
// (saldo ajustado a cada lançamento, metas calculadas pelo período,
// alertas, projeções e histórico com desfazer). Nada sai do navegador.
import type { Transaction } from '../types'
import i18n from '../i18n'
import { categoryLabel } from '../utils'
import { buildSeed, buildEmpty, newId, iso, samplePdfStatement, DB_VERSION, DEMO_USER_ID, type DemoDB, type GoalRow } from './seed'

const STORAGE_KEY = 'ft-demo-db'

export class DemoHttpError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

let db: DemoDB | null = null

export function loadDb(): DemoDB {
  if (db) return db
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDB
      if (parsed.version === DB_VERSION) { db = parsed; return db }
    }
  } catch { /* sessionStorage indisponível: segue só em memória */ }
  let empty = false
  try { empty = sessionStorage.getItem('ft-demo-vazio') === '1' } catch { /* ignora */ }
  db = empty ? buildEmpty() : buildSeed()
  saveDb()
  return db
}

function saveDb() {
  try { if (db) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db)) } catch { /* ignora */ }
}

export function resetDb() {
  db = null
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignora */ }
}

// ── Regras compartilhadas com o backend real ──────────────
const r2 = (n: number) => Math.round(n * 100) / 100
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const nowIso = () => new Date().toISOString()

export function normalizeDesc(s: string): string {
  return s.toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').slice(0, 100)
}

function monthBounds(year: number, month0: number) {
  return { start: iso(new Date(year, month0, 1)), end: iso(new Date(year, month0 + 1, 0)) }
}

function adjustBalance(accountId: string | undefined, delta: number) {
  if (!accountId || !delta) return
  const acc = loadDb().accounts.find(a => a.id === accountId)
  if (acc) { acc.balance = r2(acc.balance + delta); acc.updated_at = nowIso() }
}

function writeAudit(entityId: string, action: 'create' | 'update' | 'delete', oldValues?: Record<string, unknown>, newValues?: Record<string, unknown>) {
  loadDb().audit.unshift({ id: newId('aud'), user_id: DEMO_USER_ID, entity_type: 'transaction', entity_id: entityId, action, old_values: oldValues, new_values: newValues, undone: false, created_at: nowIso() })
}

function goalRange(g: GoalRow): { start: string; end: string } {
  const now = new Date()
  if (g.period === 'monthly') return monthBounds(now.getFullYear(), now.getMonth())
  if (g.period === 'yearly') return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  return { start: g.start_date || iso(now), end: g.end_date || iso(now) }
}

function goalCurrent(g: GoalRow): number {
  const { start, end } = goalRange(g)
  const txs = loadDb().transactions.filter(t => t.transaction_date >= start && t.transaction_date <= end && (!g.category_id || t.category_id === g.category_id))
  if (g.type === 'spending_limit') return r2(Math.abs(txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)))
  return r2(txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))
}

function goalOut(g: GoalRow) {
  const current = goalCurrent(g)
  const progress = g.target_amount > 0 ? r2(Math.min((current / g.target_amount) * 100, 100)) : 0
  return { ...g, current_amount: current, progress_percent: progress }
}

function investmentOut(i: DemoDB['investments'][number]) {
  const profit = r2(i.current_value - i.total_invested)
  const pct = i.total_invested > 0 ? r2((profit / i.total_invested) * 100) : 0
  return { ...i, profitability: profit, profitability_percent: pct }
}

// Receita e despesa ignoram transferências entre contas próprias
const isFlow = (t: Transaction) => t.type !== 'transfer'

function monthlyTotals(fromIso: string) {
  const monthly: Record<string, { month: string; income: number; expense: number }> = {}
  for (const t of loadDb().transactions) {
    if (t.transaction_date < fromIso || !isFlow(t)) continue
    const key = t.transaction_date.slice(0, 7)
    monthly[key] ??= { month: key, income: 0, expense: 0 }
    if (t.amount > 0) monthly[key].income += t.amount
    else monthly[key].expense += Math.abs(t.amount)
  }
  return Object.values(monthly).map(m => ({ ...m, income: r2(m.income), expense: r2(m.expense) })).sort((a, b) => a.month.localeCompare(b.month))
}

function monthsAgoStart(n: number) {
  const now = new Date()
  return iso(new Date(now.getFullYear(), now.getMonth() - n, 1))
}

const isEn = () => !!i18n.language?.startsWith('en')
const brl = (v: number) => new Intl.NumberFormat(isEn() ? 'en-US' : 'pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// ── Rotas ─────────────────────────────────────────────────
type Handler = (ctx: { params: URLSearchParams; body: unknown; match: RegExpMatchArray }) => unknown | Promise<unknown>
const routes: [string, RegExp, Handler][] = []
const route = (method: string, pattern: string, handler: Handler) => {
  routes.push([method, new RegExp('^/api/v1' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), handler])
}

// Contas
route('GET', '/accounts', () => {
  const accounts = loadDb().accounts.filter(a => a.is_active)
  return { accounts: clone(accounts), total: accounts.length }
})
route('POST', '/accounts', ({ body }) => {
  const b = body as Record<string, unknown>
  const acc = { id: newId('acc'), user_id: DEMO_USER_ID, name: String(b.name || 'Conta'), bank_name: String(b.bank_name || 'Outro'), bank_color: String(b.bank_color || '#9D2449'), account_type: (b.account_type as 'checking') || 'checking', currency: String(b.currency || 'BRL'), balance: Number(b.balance || 0), is_active: true, created_at: nowIso(), updated_at: nowIso() }
  loadDb().accounts.push(acc)
  return clone(acc)
})
route('PATCH', '/accounts/:id', ({ match, body }) => {
  const acc = loadDb().accounts.find(a => a.id === match[1])
  if (!acc) throw new DemoHttpError(404, 'Account not found')
  Object.assign(acc, stripNull(body), { updated_at: nowIso() })
  return clone(acc)
})
route('DELETE', '/accounts/:id', ({ match }) => {
  const acc = loadDb().accounts.find(a => a.id === match[1])
  if (!acc) throw new DemoHttpError(404, 'Account not found')
  acc.is_active = false
  return null
})

// Transações
route('GET', '/transactions', ({ params }) => {
  let txs = loadDb().transactions.slice()
  const p = (k: string) => params.get(k) || ''
  if (p('account_id')) txs = txs.filter(t => t.account_id === p('account_id'))
  if (p('category_id')) txs = txs.filter(t => t.category_id === p('category_id'))
  if (p('start_date')) txs = txs.filter(t => t.transaction_date >= p('start_date'))
  if (p('end_date')) txs = txs.filter(t => t.transaction_date <= p('end_date'))
  if (p('type')) txs = txs.filter(t => t.type === p('type'))
  if (p('search')) { const q = p('search').toLowerCase(); txs = txs.filter(t => t.description.toLowerCase().includes(q)) }
  if (p('tag')) txs = txs.filter(t => (t.tags || []).includes(p('tag')))
  txs.sort((a, b) => (a.transaction_date === b.transaction_date ? b.created_at.localeCompare(a.created_at) : b.transaction_date.localeCompare(a.transaction_date)))
  const page = Math.max(1, Number(p('page') || 1))
  const size = Math.min(500, Math.max(1, Number(p('page_size') || 50)))
  const total = txs.length
  return { transactions: clone(txs.slice((page - 1) * size, page * size)), total, page, page_size: size, total_pages: Math.ceil(total / size) }
})

// Categorização automática: o backend real manda os lançamentos sem categoria para
// a fila do Claude; a demonstração simula com regras por palavra-chave.
const AUTO_RULES: [RegExp, string, number][] = [
  [/mercad|supermerc|zaffari|carrefour|hortifruti|p[aã]o de a[cç]|atacad|assa[ií]/i, 'Alimentação', 0.94],
  [/ifood|burger|restaur|padaria|lanch|pizza|caf[eé]/i, 'Alimentação', 0.91],
  [/uber|99|t[aá]xi|shell|posto|ipiranga|combust|estacion/i, 'Transporte', 0.95],
  [/drogasil|raia|farm[aá]c|droga|cl[ií]nic|consulta/i, 'Saúde', 0.92],
  [/livrar|curso|alura|udemy|escola/i, 'Educação', 0.9],
  [/netflix|spotify|prime|globoplay|disney|assinatura/i, 'Assinaturas', 0.97],
  [/cinema|cinemark|steam|show|ingresso/i, 'Lazer', 0.88],
  [/renner|riachuelo|zara|c&a|roupa/i, 'Vestuário', 0.9],
]

function autoCategorize(desc: string): { category_id: string; confidence: number } | null {
  const d = loadDb()
  for (const [re, catName, confidence] of AUTO_RULES) {
    if (!re.test(desc)) continue
    const cat = d.categories.find(c => c.is_default && c.name === catName)
    if (cat) return { category_id: cat.id, confidence }
  }
  return null
}

function insertTransaction(b: Record<string, unknown>, opts: { audit: boolean }): Transaction {
  const d = loadDb()
  const desc = String(b.description || '').trim()
  const amount = r2(Number(b.amount || 0))
  const date = String(b.transaction_date || iso(new Date()))
  const accountId = String(b.account_id || '')
  const dup = d.transactions.some(t => t.account_id === accountId && t.transaction_date === date && t.amount === amount && normalizeDesc(t.description) === normalizeDesc(desc))
  if (dup) throw new DemoHttpError(409, 'Duplicate transaction')
  const tx: Transaction = {
    id: newId('tx'), user_id: DEMO_USER_ID, account_id: accountId,
    category_id: (b.category_id as string) || undefined,
    description: desc, description_normalized: normalizeDesc(desc), amount, currency: String(b.currency || 'BRL'),
    transaction_date: date, type: (b.type as Transaction['type']) || (amount > 0 ? 'credit' : 'debit'),
    is_recurring: !!b.is_recurring,
    installment_current: (b.installment_current as number) || undefined,
    installment_total: (b.installment_total as number) || undefined,
    categorized_by: b.category_id ? 'manual' : undefined,
    confidence_score: b.category_id ? 1 : undefined,
    sync_status: 'synced', notes: (b.notes as string) || undefined,
    tags: Array.isArray(b.tags) && b.tags.length ? (b.tags as string[]) : undefined,
    created_at: nowIso(), updated_at: nowIso(),
  }
  if (!tx.category_id && tx.type !== 'transfer') {
    const guess = autoCategorize(desc)
    if (guess) Object.assign(tx, { category_id: guess.category_id, categorized_by: 'ai', confidence_score: guess.confidence })
  }
  d.transactions.unshift(tx)
  adjustBalance(tx.account_id, tx.amount)
  if (opts.audit) writeAudit(tx.id, 'create', undefined, clone(tx) as unknown as Record<string, unknown>)
  return tx
}

route('POST', '/transactions', ({ body }) => clone(insertTransaction(body as Record<string, unknown>, { audit: true })))

route('PATCH', '/transactions/:id', ({ match, body }) => {
  const d = loadDb()
  const tx = d.transactions.find(t => t.id === match[1])
  if (!tx) throw new DemoHttpError(404, 'Transaction not found')
  const data = stripNull(body) as Partial<Transaction>
  if (!Object.keys(data).length) throw new DemoHttpError(400, 'No fields to update')
  if ('category_id' in data && !('categorized_by' in data)) { data.categorized_by = 'manual'; data.confidence_score = 1 }
  const old = clone(tx)
  Object.assign(tx, data, { updated_at: nowIso() })
  if (data.description) tx.description_normalized = normalizeDesc(data.description)
  if (data.amount !== undefined) tx.amount = r2(Number(data.amount))
  if (old.account_id === tx.account_id) adjustBalance(tx.account_id, tx.amount - old.amount)
  else { adjustBalance(old.account_id, -old.amount); adjustBalance(tx.account_id, tx.amount) }
  writeAudit(tx.id, 'update', old as unknown as Record<string, unknown>, data as Record<string, unknown>)
  return clone(tx)
})

route('DELETE', '/transactions/:id', ({ match }) => {
  const d = loadDb()
  const idx = d.transactions.findIndex(t => t.id === match[1])
  if (idx < 0) throw new DemoHttpError(404, 'Transaction not found')
  const [old] = d.transactions.splice(idx, 1)
  adjustBalance(old.account_id, -old.amount)
  writeAudit(old.id, 'delete', clone(old) as unknown as Record<string, unknown>)
  return null
})

route('POST', '/transactions/bulk', ({ body }) => {
  const b = body as { account_id: string; transactions: { description: string; amount: number; transaction_date: string; type: string }[] }
  let imported = 0, skipped = 0
  for (const t of b.transactions || []) {
    try { insertTransaction({ ...t, account_id: b.account_id }, { audit: false }); imported++ } catch { skipped++ }
  }
  return { imported, skipped, total: (b.transactions || []).length }
})

route('POST', '/transfers', ({ body }) => {
  const b = body as { from_account_id: string; to_account_id: string; amount: number; description?: string; transaction_date: string; notes?: string }
  const d = loadDb()
  if (b.from_account_id === b.to_account_id) throw new DemoHttpError(400, 'Conta de origem e destino devem ser diferentes.')
  const from = d.accounts.find(a => a.id === b.from_account_id)
  const to = d.accounts.find(a => a.id === b.to_account_id)
  if (!from || !to) throw new DemoHttpError(404, 'Conta não encontrada.')
  const batch = newId('batch')
  const amount = Math.abs(Number(b.amount))
  const debitDesc = b.description && !['Transferência', 'Transfer'].includes(b.description) ? b.description : (isEn() ? `Transfer to ${to.name}` : `Transferência para ${to.name}`)
  const rows = [
    insertTransaction({ account_id: from.id, description: debitDesc, amount: -amount, transaction_date: b.transaction_date, type: 'transfer', notes: b.notes }, { audit: false }),
    insertTransaction({ account_id: to.id, description: isEn() ? `Transfer from ${from.name}` : `Transferência de ${from.name}`, amount, transaction_date: b.transaction_date, type: 'transfer', notes: b.notes }, { audit: false }),
  ]
  rows.forEach(r => { r.import_batch_id = batch })
  return { transactions: clone(rows), batch_id: batch }
})

route('GET', '/export/transactions', ({ params }) => {
  const d = loadDb()
  const p = (k: string) => params.get(k) || ''
  const txs = d.transactions.filter(t => (!p('start_date') || t.transaction_date >= p('start_date')) && (!p('end_date') || t.transaction_date <= p('end_date')) && (!p('account_id') || t.account_id === p('account_id')))
  const fields = ['id', 'transaction_date', 'description', 'amount', 'currency', 'type', 'category_id', 'account_id', 'categorized_by', 'confidence_score', 'is_recurring', 'notes', 'created_at'] as const
  const esc = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [fields.join(','), ...txs.map(t => fields.map(f => esc(t[f])).join(','))].join('\n')
  return new Blob([csv], { type: 'text/csv' })
})

// Importação
route('POST', '/import/pdf/parse', async () => {
  await wait(700)
  return samplePdfStatement()
})
route('POST', '/import/pdf', async ({ body }) => {
  await wait(700)
  const accountId = body instanceof FormData ? String(body.get('account_id') || '') : ''
  const sample = samplePdfStatement()
  let imported = 0, skipped = 0
  for (const t of sample.transactions) {
    try { insertTransaction({ ...t, account_id: accountId }, { audit: false }); imported++ } catch { skipped++ }
  }
  return { bank: sample.bank, imported, skipped, total: sample.transactions.length }
})
route('POST', '/import/ofx/parse', async ({ body }) => {
  const file = body instanceof FormData ? body.get('file') : null
  const text = file instanceof Blob ? await file.text() : ''
  const blocks = text.match(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || []
  const field = (block: string, tag: string) => (block.match(new RegExp(`<${tag}>([^\\n<]+)`, 'i'))?.[1] || '').trim()
  const transactions = blocks.map(b => {
    const dt = field(b, 'DTPOSTED'), amt = Number(field(b, 'TRNAMT').replace(',', '.'))
    if (!dt || !amt) return null
    return { description: (field(b, 'MEMO') || field(b, 'NAME') || field(b, 'TRNTYPE')).slice(0, 200), amount: amt, transaction_date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`, type: amt > 0 ? 'credit' : 'debit' }
  }).filter(Boolean)
  if (!transactions.length) throw new DemoHttpError(422, 'Nenhuma transação encontrada no arquivo OFX.')
  return { transactions, total: transactions.length }
})

// Investimentos
route('GET', '/investments', () => {
  const list = loadDb().investments.filter(i => i.is_active).map(investmentOut)
  const inv = r2(list.reduce((s, i) => s + i.total_invested, 0))
  const cur = r2(list.reduce((s, i) => s + i.current_value, 0))
  return { investments: clone(list), total: list.length, total_invested: inv, total_current_value: cur, total_profitability: r2(cur - inv), total_profitability_percent: inv > 0 ? r2(((cur - inv) / inv) * 100) : 0 }
})
route('POST', '/investments', ({ body }) => {
  const b = body as Record<string, unknown>
  const inv = { id: newId('inv'), user_id: DEMO_USER_ID, account_id: (b.account_id as string) || undefined, name: String(b.name || 'Investimento'), type: (b.type as 'outro') || 'outro', institution: (b.institution as string) || undefined, total_invested: Number(b.total_invested || 0), current_value: Number(b.current_value || 0), currency: 'BRL', notes: (b.notes as string) || undefined, is_active: true, created_at: nowIso(), updated_at: nowIso() }
  loadDb().investments.push(inv)
  return clone(investmentOut(inv))
})
route('PATCH', '/investments/:id', ({ match, body }) => {
  const inv = loadDb().investments.find(i => i.id === match[1])
  if (!inv) throw new DemoHttpError(404, 'Investment not found')
  Object.assign(inv, stripNull(body), { updated_at: nowIso() })
  return clone(investmentOut(inv))
})
route('DELETE', '/investments/:id', ({ match }) => {
  const inv = loadDb().investments.find(i => i.id === match[1])
  if (!inv) throw new DemoHttpError(404, 'Investment not found')
  inv.is_active = false
  return null
})

// Categorias
route('GET', '/categories', () => {
  const cats = loadDb().categories.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { categories: clone(cats), total: cats.length }
})
route('POST', '/categories', ({ body }) => {
  const b = body as Record<string, unknown>
  const c = { id: newId('cat'), user_id: DEMO_USER_ID, name: String(b.name || 'Categoria'), color: String(b.color || '#9D2449'), icon: (b.icon as string) || undefined, is_default: false, created_at: nowIso() }
  loadDb().categories.push(c)
  return clone(c)
})
route('PATCH', '/categories/:id', ({ match, body }) => {
  const c = loadDb().categories.find(x => x.id === match[1])
  if (!c) throw new DemoHttpError(404, 'Category not found')
  if (c.is_default) throw new DemoHttpError(403, 'Cannot edit default categories')
  Object.assign(c, stripNull(body))
  return clone(c)
})
route('DELETE', '/categories/:id', ({ match }) => {
  const d = loadDb()
  const c = d.categories.find(x => x.id === match[1])
  if (!c) throw new DemoHttpError(404, 'Category not found')
  if (c.is_default) throw new DemoHttpError(403, 'Cannot delete default categories')
  d.categories = d.categories.filter(x => x.id !== c.id)
  d.transactions.forEach(t => { if (t.category_id === c.id) t.category_id = undefined })
  return null
})

// Resumos e análises
route('GET', '/summary/monthly', ({ params }) => {
  const months = Math.min(24, Math.max(1, Number(params.get('months') || 6)))
  return monthlyTotals(monthsAgoStart(months - 1))
})

route('GET', '/alerts', () => {
  const d = loadDb()
  const now = new Date()
  const { start, end } = monthBounds(now.getFullYear(), now.getMonth())
  const txs = d.transactions.filter(t => t.transaction_date >= start && t.transaction_date <= end)
  const alerts: { type: string; message: string; category: string; amount?: number }[] = []

  for (const g of d.goals.filter(x => x.is_active && x.type === 'spending_limit')) {
    const cur = goalCurrent(g)
    const pct = g.target_amount > 0 ? (cur / g.target_amount) * 100 : 0
    const remaining = r2(g.target_amount - cur)
    if (pct >= 100) alerts.push({ type: 'danger', message: isEn() ? `Goal “${g.name}” exceeded by ${brl(Math.abs(remaining))}` : `Meta “${g.name}” excedida em ${brl(Math.abs(remaining))}`, category: 'budget', amount: Math.abs(remaining) })
    else if (pct >= 75) alerts.push({ type: 'warning', message: isEn() ? `Goal “${g.name}” at ${pct.toFixed(0)}%, ${brl(remaining)} left` : `Meta “${g.name}” em ${pct.toFixed(0)}%, faltam ${brl(remaining)}`, category: 'budget', amount: remaining })
  }
  for (const a of d.accounts.filter(x => x.is_active && x.balance < 0)) alerts.push({ type: 'danger', message: isEn() ? `Negative balance: ${a.name}` : `Saldo negativo: ${a.name}`, category: 'account', amount: a.balance })

  const uncategorized = txs.filter(t => !t.category_id && t.amount < 0)
  if (uncategorized.length >= 3) alerts.push({ type: 'info', message: isEn() ? `${uncategorized.length} uncategorized transactions this month` : `${uncategorized.length} transações sem categoria este mês`, category: 'uncategorized' })

  const prev = monthBounds(now.getFullYear(), now.getMonth() - 1)
  const currNorms = new Set(txs.map(t => normalizeDesc(t.description)))
  const seen = new Set<string>()
  for (const t of d.transactions.filter(x => x.is_recurring && x.transaction_date >= prev.start && x.transaction_date <= prev.end)) {
    const n = normalizeDesc(t.description)
    if (seen.has(n) || currNorms.has(n)) continue
    if (now.getDate() < Number(t.transaction_date.slice(8, 10)) + 2) continue
    seen.add(n)
    if (seen.size > 5) break
    alerts.push({ type: 'info', message: isEn() ? `Recurring “${t.description}” not seen this month` : `Recorrente “${t.description}” não apareceu este mês`, category: 'recurring' })
  }

  const month = start.slice(0, 7)
  const spent: Record<string, number> = {}
  for (const t of txs) if (t.category_id && t.amount < 0) spent[t.category_id] = (spent[t.category_id] || 0) + Math.abs(t.amount)
  for (const b of d.budgets.filter(x => x.month === month)) {
    const s = spent[b.category_id] || 0
    const pct = b.limit_amount > 0 ? (s / b.limit_amount) * 100 : 0
    const name = categoryLabel(d.categories.find(c => c.id === b.category_id), isEn() ? 'Category' : 'Categoria')
    if (pct >= 100) alerts.push({ type: 'danger', message: isEn() ? `Budget “${name}” exceeded` : `Orçamento “${name}” estourado`, category: 'budget' })
    else if (pct >= 80) alerts.push({ type: 'warning', message: isEn() ? `Budget “${name}” at ${pct.toFixed(0)}%, ${brl(b.limit_amount - s)} left` : `Orçamento “${name}” em ${pct.toFixed(0)}%, faltam ${brl(b.limit_amount - s)}`, category: 'budget', amount: r2(b.limit_amount - s) })
  }
  return { alerts, total: alerts.length }
})

route('GET', '/cashflow/projection', () => {
  const d = loadDb()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const endDate = new Date(today.getTime() + 30 * 86_400_000)
  const starting = r2(d.accounts.filter(a => a.is_active).reduce((s, a) => s + a.balance, 0))
  const lookback = monthsAgoStart(2)
  const days: Record<string, { description: string; amount: number; source: 'recurring' | 'installment' }[]> = {}
  const add = (date: Date, description: string, amount: number, source: 'recurring' | 'installment') => {
    if (date > today && date <= endDate) (days[iso(date)] ??= []).push({ description, amount: r2(amount), source })
  }
  // Uma ocorrência por recorrente; o dia vem da última ocorrência de um mês já fechado
  // (no mês corrente a demonstração comprime as datas até hoje)
  const thisMonth = iso(new Date(today.getFullYear(), today.getMonth(), 1))
  const byKey = new Map<string, Transaction>()
  const recurring = d.transactions.filter(t => t.is_recurring && t.type !== 'transfer' && t.transaction_date >= lookback).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  for (const r of recurring) {
    const key = `${r.account_id}|${normalizeDesc(r.description)}`
    const cur = byKey.get(key)
    if (!cur || (cur.transaction_date >= thisMonth && r.transaction_date < thisMonth)) byKey.set(key, cur && r.transaction_date < thisMonth ? { ...r, amount: cur.amount } : r)
  }
  for (const r of byKey.values()) {
    const baseDay = Number(r.transaction_date.slice(8, 10))
    for (let dm = 0; dm < 3; dm++) {
      const first = new Date(today.getFullYear(), today.getMonth() + dm, 1)
      const day = Math.min(baseDay, new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate())
      add(new Date(first.getFullYear(), first.getMonth(), day), r.description, r.amount, 'recurring')
    }
  }
  // Parcelas: só a parcela mais recente de cada compra projeta as seguintes
  const latest = new Map<string, Transaction>()
  for (const t of d.transactions) {
    if (!t.installment_current || !t.installment_total || t.installment_current >= t.installment_total) continue
    const key = normalizeDesc(t.description)
    const cur = latest.get(key)
    if (!cur || (cur.installment_current || 0) < t.installment_current) latest.set(key, t)
  }
  for (const t of latest.values()) {
    const base = new Date(t.transaction_date + 'T00:00:00')
    for (let i = 1; i <= (t.installment_total || 0) - (t.installment_current || 0); i++) {
      const first = new Date(base.getFullYear(), base.getMonth() + i, 1)
      const day = Math.min(base.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate())
      add(new Date(first.getFullYear(), first.getMonth(), day), t.description, t.amount, 'installment')
    }
  }
  let cumulative = 0, negative = false
  const out = Object.keys(days).sort().map(date => {
    cumulative = r2(cumulative + days[date].reduce((s, e) => s + e.amount, 0))
    const projected = r2(starting + cumulative)
    if (projected < 0) negative = true
    return { date, events: days[date], cumulative_change: cumulative, projected_balance: projected }
  })
  return { days: out, starting_balance: starting, projected_balance: r2(starting + cumulative), has_negative_days: negative }
})

route('GET', '/net-worth', () => {
  const d = loadDb()
  const acc = r2(d.accounts.filter(a => a.is_active).reduce((s, a) => s + a.balance, 0))
  const inv = r2(d.investments.filter(i => i.is_active).reduce((s, i) => s + i.current_value, 0))
  const snapshots = clone(d.snapshots)
  const last = snapshots[snapshots.length - 1]
  if (last) Object.assign(last, { total_accounts: acc, total_investments: inv, net_worth: r2(acc + inv) })
  return { total_accounts: acc, total_investments: inv, net_worth: r2(acc + inv), snapshots }
})

route('GET', '/projections', () => {
  const history = monthlyTotals(monthsAgoStart(11))
  if (!history.length) return { history: [], projections: [], months_available: 0, avg_income: 0, avg_expense: 0 }
  // O mês corrente ainda está pela metade: entra no gráfico, mas não na conta
  const currentKey = monthsAgoStart(0).slice(0, 7)
  const closed = history.filter(h => h.month < currentKey)
  const base = closed.length ? closed : history
  const n = base.length
  const avgIncome = base.reduce((s, h) => s + h.income, 0) / n
  const avgExpense = base.reduce((s, h) => s + h.expense, 0) / n
  const incSlope = n >= 2 ? (base[n - 1].income - base[0].income) / (n - 1) : 0
  const expSlope = n >= 2 ? (base[n - 1].expense - base[0].expense) / (n - 1) : 0
  const last = base[n - 1]
  const now = new Date()
  const projections = [1, 2, 3].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return {
      month: iso(d).slice(0, 7),
      income: r2(Math.max(0, last.income + incSlope * i * 0.4 + (avgIncome - last.income) * 0.3)),
      expense: r2(Math.max(0, last.expense + expSlope * i * 0.4 + (avgExpense - last.expense) * 0.3)),
      is_projection: true,
    }
  })
  return { history: history.map(h => ({ ...h, is_projection: false })), projections, months_available: n, avg_income: r2(avgIncome), avg_expense: r2(avgExpense) }
})

// Frase da reserva no resumo: mesma regra da tela de Metas (goals/helpers.ts, describeGoal):
// atrasada quando o guardado está mais de 5 pontos abaixo da fração do prazo que já passou.
function reserveSentence(g: GoalRow): string {
  const now = new Date()
  const { start, end } = goalRange(g)
  const cur = goalCurrent(g)
  const missing = r2(g.target_amount - cur)
  const name = `“${g.name}”`
  if (missing <= 0) return isEn() ? `${name} has been reached.` : `A meta ${name} já foi atingida.`
  const s0 = new Date(start + 'T00:00:00').getTime(), e0 = new Date(end + 'T00:00:00').getTime()
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - s0) / (e0 - s0 + 86_400_000)))
  const pct = (cur / g.target_amount) * 100
  const monthsLeft = Math.max(1, (new Date(end).getFullYear() - now.getFullYear()) * 12 + new Date(end).getMonth() - now.getMonth() + 1)
  const endLabel = new Intl.DateTimeFormat(isEn() ? 'en-US' : 'pt-BR', { month: 'long' }).format(new Date(end + 'T00:00:00'))
  if (pct >= elapsed * 100 - 5) {
    return isEn()
      ? `${name} is on pace: ${pct.toFixed(0)}% saved with ${(elapsed * 100).toFixed(0)}% of the time gone.`
      : `A meta ${name} está no ritmo: ${pct.toFixed(0)}% guardados com ${(elapsed * 100).toFixed(0)}% do prazo passado.`
  }
  const perMonth = brl(missing / monthsLeft)
  return isEn()
    ? `To finish ${name} by ${endLabel}, ${brl(missing)} is missing: about ${perMonth} a month.`
    : `Para a meta ${name} fechar em ${endLabel}, faltam ${brl(missing)}: cerca de ${perMonth} por mês.`
}

route('POST', '/insights', async ({ body }) => {
  const { start_date, end_date } = body as { start_date: string; end_date: string }
  const d = loadDb()
  const key = `${start_date}:${end_date}:${isEn() ? 'en' : 'pt'}`
  const cached = d.insight_cache[key]
  if (cached) return { text: cached.text, generated_at: cached.ts, cached: true }
  await wait(600)
  const txs = d.transactions.filter(t => t.transaction_date >= start_date && t.transaction_date <= end_date && isFlow(t))
  const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const byCat: Record<string, number> = {}
  for (const t of txs.filter(x => x.amount < 0)) byCat[t.category_id || ''] = (byCat[t.category_id || ''] || 0) + Math.abs(t.amount)
  const top = Object.entries(byCat).filter(([k]) => k).sort((a, b) => b[1] - a[1])[0]
  const topName = top ? categoryLabel(d.categories.find(c => c.id === top[0])) : undefined
  const rate = income > 0 ? ((income - expense) / income) * 100 : 0
  const reserve = d.goals.find(g => g.type === 'savings_target' && g.is_active)
  const share = top ? ((top[1] / Math.max(expense, 1)) * 100).toFixed(0) : '0'
  const parts = isEn()
    ? [
        `You kept ${rate.toFixed(0)}% of what came in: ${brl(income)} of income against ${brl(expense)} of spending.`,
        topName ? `${topName} was the largest expense at ${brl(top![1])}, ${share}% of the total.` : '',
      ]
    : [
        `Você guardou ${rate.toFixed(0)}% do que entrou no período: ${brl(income)} de receitas contra ${brl(expense)} de gastos.`,
        topName ? `${topName} foi a maior despesa, com ${brl(top![1])}, ${share}% do total.` : '',
      ]
  if (reserve) parts.push(reserveSentence(reserve))
  const text = parts.filter(Boolean).join(' ')
  const ts = nowIso()
  d.insight_cache[key] = { text, ts }
  return { text, generated_at: ts, cached: false }
})

// Orçamentos
function budgetOut(b: DemoDB['budgets'][number]) {
  const d = loadDb()
  const [y, m] = b.month.split('-').map(Number)
  const { start, end } = monthBounds(y, m - 1)
  const spent = r2(d.transactions.filter(t => t.category_id === b.category_id && t.amount < 0 && t.transaction_date >= start && t.transaction_date <= end).reduce((s, t) => s + Math.abs(t.amount), 0))
  const c = d.categories.find(x => x.id === b.category_id)
  return { ...b, spent, percent: b.limit_amount > 0 ? r2((spent / b.limit_amount) * 100) : 0, category_name: c?.name, category_color: c?.color }
}
route('GET', '/budgets', ({ params }) => {
  const month = params.get('month') || iso(new Date()).slice(0, 7)
  const list = loadDb().budgets.filter(b => b.month === month).map(budgetOut)
  return { budgets: clone(list), total: list.length }
})
route('POST', '/budgets', ({ body }) => {
  const b = body as { category_id: string; month: string; limit_amount: number }
  const d = loadDb()
  if (d.budgets.some(x => x.category_id === b.category_id && x.month === b.month)) throw new DemoHttpError(409, 'Já existe um orçamento para esta categoria neste mês.')
  const row = { id: newId('bud'), user_id: DEMO_USER_ID, category_id: b.category_id, month: b.month, limit_amount: Number(b.limit_amount), created_at: nowIso() }
  d.budgets.push(row)
  return clone(budgetOut(row))
})
route('PATCH', '/budgets/:id', ({ match, body }) => {
  const b = loadDb().budgets.find(x => x.id === match[1])
  if (!b) throw new DemoHttpError(404, 'Budget not found')
  Object.assign(b, stripNull(body))
  return clone(budgetOut(b))
})
route('DELETE', '/budgets/:id', ({ match }) => {
  const d = loadDb()
  if (!d.budgets.some(x => x.id === match[1])) throw new DemoHttpError(404, 'Budget not found')
  d.budgets = d.budgets.filter(x => x.id !== match[1])
  return null
})

route('GET', '/tags', () => {
  const tags = new Set<string>()
  loadDb().transactions.forEach(t => (t.tags || []).forEach(tag => tag.trim() && tags.add(tag.trim())))
  return { tags: [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR')) }
})

// Histórico (auditoria) e desfazer
route('GET', '/audit-log', ({ params }) => {
  const limit = Math.min(100, Number(params.get('limit') || 50))
  const entries = loadDb().audit.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
  return { entries: clone(entries), total: entries.length }
})
route('POST', '/audit-log/:id/undo', ({ match }) => {
  const d = loadDb()
  const log = d.audit.find(a => a.id === match[1])
  if (!log) throw new DemoHttpError(404, 'Entrada de auditoria não encontrada.')
  if (log.undone) throw new DemoHttpError(409, 'Esta ação já foi desfeita.')
  if (log.entity_type !== 'transaction') throw new DemoHttpError(400, 'Desfazer suportado apenas para transações.')
  const old = (log.old_values || {}) as Partial<Transaction>
  if (log.action === 'create') {
    const idx = d.transactions.findIndex(t => t.id === log.entity_id)
    if (idx >= 0) { const [t] = d.transactions.splice(idx, 1); adjustBalance(t.account_id, -t.amount) }
  } else if (log.action === 'delete') {
    if (old.id && !d.transactions.some(t => t.id === old.id)) {
      d.transactions.unshift({ ...(old as Transaction), sync_status: 'synced', created_at: old.created_at || nowIso(), updated_at: nowIso() })
      adjustBalance(old.account_id, Number(old.amount || 0))
    }
  } else if (log.action === 'update') {
    const tx = d.transactions.find(t => t.id === log.entity_id)
    if (tx) {
      const restore = { ...old }
      for (const k of ['id', 'user_id', 'created_at', 'updated_at', 'description_normalized', 'sync_status'] as const) delete restore[k]
      if (restore.amount !== undefined) adjustBalance(tx.account_id, Number(restore.amount) - tx.amount)
      Object.assign(tx, restore, { updated_at: nowIso() })
    }
  }
  log.undone = true
  return { undone: true, action: log.action, entity_id: log.entity_id }
})

// Metas
route('GET', '/goals', () => {
  const goals = loadDb().goals.filter(g => g.is_active).map(goalOut)
  return { goals: clone(goals), total: goals.length }
})
route('POST', '/goals', ({ body }) => {
  const b = body as Record<string, unknown>
  const g: GoalRow = { id: newId('goal'), user_id: DEMO_USER_ID, category_id: (b.category_id as string) || undefined, name: String(b.name || 'Meta'), type: (b.type as GoalRow['type']) || 'spending_limit', target_amount: Number(b.target_amount || 0), current_amount: 0, currency: 'BRL', period: (b.period as GoalRow['period']) || 'monthly', start_date: String(b.start_date || iso(new Date())), end_date: (b.end_date as string) || undefined, is_active: true, created_at: nowIso(), updated_at: nowIso() }
  loadDb().goals.push(g)
  return clone(goalOut(g))
})
route('PATCH', '/goals/:id', ({ match, body }) => {
  const g = loadDb().goals.find(x => x.id === match[1])
  if (!g) throw new DemoHttpError(404, 'Goal not found')
  Object.assign(g, stripNull(body), { updated_at: nowIso() })
  return clone(goalOut(g))
})
route('DELETE', '/goals/:id', ({ match }) => {
  const g = loadDb().goals.find(x => x.id === match[1])
  if (!g) throw new DemoHttpError(404, 'Goal not found')
  g.is_active = false
  return null
})

// ── Entrada única ─────────────────────────────────────────
function stripNull(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.entries((body as Record<string, unknown>) || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) out[k] = v })
  return out
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function handleDemoRequest(method: string, url: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const [path, query = ''] = url.split('?')
  const params = new URLSearchParams(query)
  await wait(140)
  for (const [m, re, handler] of routes) {
    if (m !== method.toUpperCase()) continue
    const match = path.match(re)
    if (!match) continue
    try {
      const data = await handler({ params, body, match })
      if (method.toUpperCase() !== 'GET') saveDb()
      const status = method.toUpperCase() === 'POST' ? 201 : data === null ? 204 : 200
      return { status, data }
    } catch (e) {
      if (e instanceof DemoHttpError) return { status: e.status, data: { detail: e.message } }
      throw e
    }
  }
  if (path === '/health') return { status: 200, data: { status: 'ok' } }
  return { status: 404, data: { detail: 'Not found' } }
}
