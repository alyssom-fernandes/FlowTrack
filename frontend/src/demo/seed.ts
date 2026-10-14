// ── Dados fictícios do modo demonstração ──────────────────
// Tudo é calculado a partir da data de hoje, então o painel sempre
// mostra um mês corrente cheio e um histórico de 12 meses.
import type { Account, AuditLogEntry, Category, Investment, NetWorthSnapshot, Transaction } from '../types'

export const DEMO_EMAIL = 'demo@flowtrack.app'
export const DEMO_USER_ID = 'demo-user'
export const DB_VERSION = 4

export interface GoalRow {
  id: string
  user_id: string
  category_id?: string
  name: string
  type: 'spending_limit' | 'savings_target'
  target_amount: number
  current_amount: number
  currency: string
  period: 'monthly' | 'yearly' | 'custom'
  start_date: string
  end_date?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BudgetRow {
  id: string
  user_id: string
  category_id: string
  month: string
  limit_amount: number
  created_at: string
}

export interface DemoDB {
  version: number
  created_at: string
  user: { id: string; email: string; created_at: string }
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  goals: GoalRow[]
  investments: Omit<Investment, 'profitability' | 'profitability_percent'>[]
  budgets: BudgetRow[]
  snapshots: NetWorthSnapshot[]
  audit: AuditLogEntry[]
  insight_cache: Record<string, { text: string; ts: string }>
}

// ── Helpers de data ───────────────────────────────────────
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

let counter = 0
export function newId(prefix = 'd'): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

// Variação determinística (sem aleatoriedade) para os valores parecerem reais
function vary(base: number, k: number, i: number, spread = 0.12): number {
  const h = Math.abs(Math.sin((k + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453) % 1
  return Math.round(base * (1 + (h * 2 - 1) * spread) * 100) / 100
}

// ── Dados em inglês ───────────────────────────────────────
// A demonstração nasce no idioma escolhido (ft-lang) quando a aba abre.
// Nomes de marcas e produtos ficam como estão.
const EN: Record<string, string> = {
  'Salário': 'Salary', 'Aluguel': 'Rent', 'Condomínio': 'Condo fee', 'Enel Energia': 'Enel electricity',
  'Vivo Fibra': 'Vivo Fiber', 'Supermercado Pão de Açúcar': 'Pão de Açúcar supermarket', 'Posto Shell': 'Shell gas station',
  '99 Táxi': '99 Taxi', 'Restaurante Madero': 'Madero restaurant',
  'Transferência para Sicredi Poupança': 'Transfer to Sicredi Savings', 'Aporte na reserva': 'Emergency fund deposit',
  'Rendimento da poupança': 'Savings interest', 'Consulta dermatologista': 'Dermatologist visit',
  'Notebook Dell': 'Dell laptop', 'Passagem Lisboa — TAP': 'Lisbon flight — TAP', 'Viagem de férias em janeiro': 'Holiday trip in January',
  'estudos': 'studies', 'saúde': 'health', 'trabalho': 'work', 'viagem': 'travel',
  'Sicredi Poupança': 'Sicredi Savings',
  'Reserva de emergência': 'Emergency fund', 'Assinaturas no ano': 'Subscriptions this year', 'Lazer no ano': 'Leisure this year',
  'Vencimento em 2029, indexado ao IPCA': 'Matures in 2029, indexed to inflation (IPCA)', 'Liquidez diária': 'Daily liquidity',
  'Isenta de IR, vence em 12 meses': 'Tax-exempt, matures in 12 months', 'Dividendos mensais': 'Monthly dividends',
  'Posição pequena, de longo prazo': 'Small long-term position', 'Estorno compra': 'Purchase refund',
}

export function demoLang(): 'pt' | 'en' {
  try { return localStorage.getItem('ft-lang') === 'en' ? 'en' : 'pt' } catch { return 'pt' }
}

function tr(text: string): string
function tr(text: string | undefined): string | undefined
function tr(text: string | undefined): string | undefined {
  return text && demoLang() === 'en' ? (EN[text] ?? text) : text
}

// ── Categorias (iguais às do schema.sql) ──────────────────
const CATEGORY_DEFS: [string, string, string][] = [
  // Cores do tema claro da paleta de categorias (src/lib/categoryColor.ts)
  ['Alimentação', 'utensils', '#eb6834'],
  ['Transporte', 'car', '#eda100'],
  ['Moradia', 'home', '#2a78d6'],
  ['Saúde', 'heart', '#e87ba4'],
  ['Educação', 'book', '#a86a1c'],
  ['Lazer', 'music', '#0f8fb3'],
  ['Vestuário', 'shirt', '#e34948'],
  ['Assinaturas', 'repeat', '#4a3aa7'],
  ['Investimentos', 'trending-up', '#9D2449'],
  ['Receita', 'dollar-sign', '#2ca470'],
  ['Transferência', 'arrow-right', '#8e8e99'],
  ['Outros', 'more-horizontal', '#8e8e99'],
]

interface TxSpec {
  acc: 'nub' | 'inter' | 'sic'
  desc: string
  amount: number
  day: number
  cat?: string
  recurring?: boolean
  type?: 'debit' | 'credit' | 'transfer'
  by?: 'rule' | 'cache' | 'ai'
  conf?: number
  tags?: string[]
  inst?: [number, number]
  notes?: string
}

export function buildSeed(now = new Date()): DemoDB {
  const createdAt = new Date(now.getFullYear() - 1, now.getMonth(), 3, 10, 12).toISOString()
  const stamp = (d: Date, h = 9, min = 30) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).toISOString()

  const categories: Category[] = CATEGORY_DEFS.map(([name, icon, color], i) => ({
    id: `cat-${i + 1}`, name, icon, color, is_default: true, created_at: createdAt,
  }))
  const cat = (name: string) => categories.find(c => c.name === name)?.id

  const accounts: Account[] = [
    { id: 'acc-nub', user_id: DEMO_USER_ID, name: 'Nubank', bank_name: 'Nubank', bank_color: '#820ad1', account_type: 'checking', currency: 'BRL', balance: 4180.35, is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'acc-inter', user_id: DEMO_USER_ID, name: 'Inter', bank_name: 'Inter', bank_color: '#FF7A00', account_type: 'checking', currency: 'BRL', balance: 1245.8, is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'acc-sic', user_id: DEMO_USER_ID, name: tr('Sicredi Poupança'), bank_name: 'Sicredi', bank_color: '#008000', account_type: 'savings', currency: 'BRL', balance: 10950, is_active: true, created_at: createdAt, updated_at: createdAt },
  ]
  const accId = { nub: 'acc-nub', inter: 'acc-inter', sic: 'acc-sic' }

  const transactions: Transaction[] = []
  const today = now.getDate()

  // k = meses atrás (11 … 0). O mês corrente fica parcial, como na vida real:
  // só entra o que tem dia até hoje (nada de espremer o mês inteiro nos primeiros dias).
  for (let k = 11; k >= 0; k--) {
    const y = new Date(now.getFullYear(), now.getMonth() - k, 1).getFullYear()
    const m = new Date(now.getFullYear(), now.getMonth() - k, 1).getMonth()
    const dim = daysInMonth(y, m)
    const dayOf = (d: number) => Math.min(d, dim)

    const specs: TxSpec[] = [
      { acc: 'nub', desc: 'Salário', amount: k >= 6 ? 5800 : 6200, day: 5, cat: 'Receita', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Aluguel', amount: -1650, day: 6, cat: 'Moradia', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Condomínio', amount: -380, day: 6, cat: 'Moradia', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Enel Energia', amount: -vary(168, k, 1, 0.18), day: 12, cat: 'Moradia', recurring: true, by: 'cache', conf: 0.98 },
      { acc: 'nub', desc: 'Vivo Fibra', amount: -99.9, day: 8, cat: 'Assinaturas', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Netflix', amount: -44.9, day: 15, cat: 'Assinaturas', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Spotify', amount: -21.9, day: 15, cat: 'Assinaturas', recurring: true, by: 'rule' },
      { acc: 'nub', desc: 'Smart Fit', amount: -119.9, day: 10, cat: 'Saúde', recurring: true, by: 'cache', conf: 0.97 },
      { acc: 'inter', desc: 'Alura', amount: -99, day: 20, cat: 'Educação', recurring: true, by: 'ai', conf: 0.93, tags: ['estudos'] },
      { acc: 'nub', desc: 'Supermercado Pão de Açúcar', amount: -vary(318, k, 2), day: 3, cat: 'Alimentação', by: 'cache', conf: 0.99 },
      { acc: 'nub', desc: 'Carrefour', amount: -vary(186, k, 3), day: 17, cat: 'Alimentação', by: 'cache', conf: 0.99 },
      { acc: 'nub', desc: 'Hortifruti', amount: -vary(92, k, 4), day: 24, cat: 'Alimentação', by: 'ai', conf: 0.91 },
      { acc: 'nub', desc: 'iFood', amount: -vary(64, k, 5), day: 9, cat: 'Alimentação', by: 'cache', conf: 0.96 },
      { acc: 'nub', desc: 'iFood', amount: -vary(71, k, 6), day: 21, cat: 'Alimentação', by: 'cache', conf: 0.96 },
      { acc: 'inter', desc: k % 2 ? 'Restaurante Madero' : 'Coco Bambu', amount: -vary(k % 2 ? 132 : 214, k, 7), day: 13, cat: 'Alimentação', by: 'ai', conf: 0.88 },
      { acc: 'nub', desc: 'Padaria Real', amount: -vary(31, k, 8), day: 19, cat: 'Alimentação', by: 'ai', conf: 0.86 },
      { acc: 'nub', desc: 'Uber', amount: -vary(32, k, 9), day: 4, cat: 'Transporte', by: 'cache', conf: 0.99 },
      { acc: 'nub', desc: 'Uber', amount: -vary(27, k, 10), day: 16, cat: 'Transporte', by: 'cache', conf: 0.99 },
      { acc: 'nub', desc: '99 Táxi', amount: -vary(24, k, 11), day: 26, cat: 'Transporte', by: 'ai', conf: 0.94 },
      { acc: 'nub', desc: 'Posto Shell', amount: -vary(210, k, 12, 0.08), day: 14, cat: 'Transporte', by: 'cache', conf: 0.97 },
      { acc: 'nub', desc: 'Drogasil', amount: -vary(58, k, 13, 0.3), day: 11, cat: 'Saúde', by: 'ai', conf: 0.9, tags: ['saúde'] },
      { acc: 'inter', desc: k % 2 ? 'Cinemark' : 'Steam', amount: -vary(k % 2 ? 64 : 59.9, k, 14, 0.05), day: 22, cat: 'Lazer', by: 'ai', conf: 0.87 },
      // Reserva: sai do Nubank e entra na poupança (transferência entre contas)
      { acc: 'nub', desc: 'Transferência para Sicredi Poupança', amount: -1000, day: 7, cat: 'Investimentos', recurring: true, type: 'transfer', by: 'rule' },
      { acc: 'sic', desc: 'Aporte na reserva', amount: 1000, day: 7, cat: 'Investimentos', recurring: true, type: 'transfer', by: 'rule' },
      { acc: 'sic', desc: 'Rendimento da poupança', amount: vary(92, k, 15, 0.1), day: 28, cat: 'Investimentos', by: 'rule' },
    ]

    if (k % 3 === 1) specs.push({ acc: 'inter', desc: 'Freelance — landing page', amount: 1800, day: 18, cat: 'Receita', by: 'ai', conf: 0.92, tags: ['trabalho'] })
    if (k % 4 === 2) specs.push({ acc: 'nub', desc: 'Renner', amount: -vary(189, k, 16), day: 23, cat: 'Vestuário', by: 'ai', conf: 0.95 })
    if (k % 4 === 0) specs.push({ acc: 'nub', desc: 'Amazon', amount: -vary(146, k, 17), day: 27, cat: 'Vestuário', by: 'ai', conf: 0.71 })
    if (k === 6) specs.push({ acc: 'nub', desc: 'Consulta dermatologista', amount: -280, day: 15, cat: 'Saúde', by: 'ai', conf: 0.89, tags: ['saúde'] })
    if (k === 3) specs.push({ acc: 'inter', desc: 'Livraria Cultura', amount: -84.7, day: 9, cat: 'Educação', by: 'ai', conf: 0.9, tags: ['estudos'] })

    // Compras parceladas
    if (k <= 4) {
      const n = 5 - k
      specs.push({ acc: 'nub', desc: 'Notebook Dell', amount: -389.9, day: 10, cat: 'Outros', by: 'ai', conf: 0.82, tags: ['trabalho'], inst: [n, 10] })
    }
    if (k <= 1) {
      const n = 2 - k
      specs.push({ acc: 'nub', desc: 'Passagem Lisboa — TAP', amount: -312.4, day: 2, cat: 'Lazer', by: 'ai', conf: 0.9, tags: ['viagem'], inst: [n, 6], notes: 'Viagem de férias em janeiro' })
    }

    // Mês corrente: três lançamentos ainda sem categoria (geram o alerta)
    if (k === 0) {
      specs.push({ acc: 'nub', desc: 'PIX JOAO M SILVA', amount: -85, day: 18 })
      specs.push({ acc: 'nub', desc: 'PAG*MERCADOLIVRE', amount: -149.9, day: 20 })
      specs.push({ acc: 'inter', desc: 'COMPRA DEB 4402 LOJA', amount: -37.5, day: 25 })
    }

    specs.forEach((s, i) => {
      if (k === 0 && s.day > today) return
      const d = new Date(y, m, dayOf(s.day))
      const id = `tx-${k}-${i}`
      transactions.push({
        id,
        user_id: DEMO_USER_ID,
        account_id: accId[s.acc],
        category_id: s.cat ? cat(s.cat) : undefined,
        description: tr(s.desc),
        amount: Math.round(s.amount * 100) / 100,
        currency: 'BRL',
        transaction_date: iso(d),
        type: s.type ?? (s.amount > 0 ? 'credit' : 'debit'),
        is_recurring: !!s.recurring,
        installment_current: s.inst?.[0],
        installment_total: s.inst?.[1],
        categorized_by: s.cat ? (s.by ?? 'rule') : undefined,
        confidence_score: s.cat ? (s.conf ?? 1) : undefined,
        import_batch_id: s.type === 'transfer' ? `batch-${k}` : undefined,
        sync_status: 'synced',
        notes: tr(s.notes),
        tags: s.tags?.map(tag => tr(tag)),
        created_at: stamp(d),
        updated_at: stamp(d),
      })
    })
  }

  transactions.sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))

  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1))
  // Metas: uma de economia (a reserva) e limites anuais; os limites do mês ficam nos orçamentos
  const goals: GoalRow[] = [
    { id: 'goal-2', user_id: DEMO_USER_ID, category_id: cat('Investimentos'), name: tr('Reserva de emergência'), type: 'savings_target', target_amount: 15000, current_amount: 0, currency: 'BRL', period: 'custom', start_date: `${now.getFullYear()}-01-01`, end_date: `${now.getFullYear()}-12-31`, is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'goal-4', user_id: DEMO_USER_ID, category_id: cat('Assinaturas'), name: tr('Assinaturas no ano'), type: 'spending_limit', target_amount: 2400, current_amount: 0, currency: 'BRL', period: 'yearly', start_date: `${now.getFullYear()}-01-01`, is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'goal-5', user_id: DEMO_USER_ID, category_id: cat('Lazer'), name: tr('Lazer no ano'), type: 'spending_limit', target_amount: 4800, current_amount: 0, currency: 'BRL', period: 'yearly', start_date: `${now.getFullYear()}-01-01`, is_active: true, created_at: createdAt, updated_at: createdAt },
  ]

  const investments: DemoDB['investments'] = [
    { id: 'inv-1', user_id: DEMO_USER_ID, name: 'Tesouro IPCA+ 2029', type: 'tesouro_direto', institution: 'Tesouro Nacional', total_invested: 5000, current_value: 5347.2, currency: 'BRL', notes: tr('Vencimento em 2029, indexado ao IPCA'), is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'inv-2', user_id: DEMO_USER_ID, name: 'CDB Nubank 120% CDI', type: 'cdb', institution: 'Nubank', total_invested: 3000, current_value: 3128.5, currency: 'BRL', notes: tr('Liquidez diária'), is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'inv-3', user_id: DEMO_USER_ID, name: 'LCI Sicredi', type: 'lci_lca', institution: 'Sicredi', total_invested: 2000, current_value: 2089, currency: 'BRL', notes: tr('Isenta de IR, vence em 12 meses'), is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'inv-4', user_id: DEMO_USER_ID, name: 'MXRF11 — Maxi Renda', type: 'fundo_imobiliario', institution: 'XP Investimentos', total_invested: 1500, current_value: 1380, currency: 'BRL', notes: tr('Dividendos mensais'), is_active: true, created_at: createdAt, updated_at: createdAt },
    { id: 'inv-5', user_id: DEMO_USER_ID, name: 'Bitcoin', type: 'criptomoeda', institution: 'Mercado Bitcoin', total_invested: 1500, current_value: 1854.6, currency: 'BRL', notes: tr('Posição pequena, de longo prazo'), is_active: true, created_at: createdAt, updated_at: createdAt },
  ]

  // Orçamentos dos últimos 3 meses. O limite sai do gasto de um mês fechado (o anterior),
  // escolhido para mostrar faixas diferentes no fim do mês: Lazer estoura, Saúde sobra.
  const month = monthStart.slice(0, 7)
  const prevMonth = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  const spentIn = (catName: string, mon: string) => transactions
    .filter(t => t.transaction_date.startsWith(mon) && t.category_id === cat(catName) && t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const limitFor = (catName: string, pct: number) => Math.max(50, Math.round(spentIn(catName, prevMonth) / pct / 50) * 50)
  const budgetDefs: [string, number][] = [
    ['Moradia', 0.97], ['Alimentação', 0.88], ['Transporte', 0.7], ['Assinaturas', 0.9], ['Lazer', 1.06], ['Saúde', 0.6],
  ]
  const budgets: BudgetRow[] = [2, 1, 0].flatMap(back => {
    const mon = iso(new Date(now.getFullYear(), now.getMonth() - back, 1)).slice(0, 7)
    return budgetDefs.map(([name, pct], i) => ({
      id: `bud-${back}-${i + 1}`, user_id: DEMO_USER_ID, category_id: cat(name)!, month: mon,
      limit_amount: limitFor(name, pct), created_at: createdAt,
    }))
  })

  // Patrimônio: 12 fotos de fim de mês, crescendo até o valor atual
  const totalAcc = accounts.reduce((s, a) => s + a.balance, 0)
  const totalInv = investments.reduce((s, i) => s + i.current_value, 0)
  const snapshots: NetWorthSnapshot[] = []
  for (let k = 11; k >= 0; k--) {
    const d = k === 0 ? now : new Date(now.getFullYear(), now.getMonth() - k + 1, 0)
    const a = Math.round((totalAcc - k * 520 + (vary(1, k, 20, 0.9) - 1) * 900) * 100) / 100
    const inv = Math.round((totalInv - k * 610 + (vary(1, k, 21, 0.9) - 1) * 700 - (k === 4 ? 950 : 0)) * 100) / 100
    snapshots.push({ date: iso(d), total_accounts: k === 0 ? totalAcc : a, total_investments: k === 0 ? totalInv : inv, net_worth: Math.round(((k === 0 ? totalAcc : a) + (k === 0 ? totalInv : inv)) * 100) / 100 })
  }

  // Histórico recente para a seção "Histórico de alterações"
  const recent = transactions.filter(t => t.transaction_date.startsWith(month)).slice(0, 3)
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const audit: AuditLogEntry[] = []
  if (recent[0]) audit.push({ id: 'aud-1', user_id: DEMO_USER_ID, entity_type: 'transaction', entity_id: recent[0].id, action: 'create', new_values: { ...recent[0] } as Record<string, unknown>, undone: false, created_at: hoursAgo(2) })
  if (recent[1]) audit.push({ id: 'aud-2', user_id: DEMO_USER_ID, entity_type: 'transaction', entity_id: recent[1].id, action: 'update', old_values: { ...recent[1], amount: Math.round((recent[1].amount - 10) * 100) / 100 } as Record<string, unknown>, new_values: { amount: recent[1].amount }, undone: false, created_at: hoursAgo(5) })
  audit.push({
    id: 'aud-3', user_id: DEMO_USER_ID, entity_type: 'transaction', entity_id: 'tx-removed-1', action: 'delete',
    old_values: { id: 'tx-removed-1', user_id: DEMO_USER_ID, account_id: 'acc-nub', category_id: cat('Assinaturas'), description: 'Globoplay', amount: -24.9, currency: 'BRL', transaction_date: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)), type: 'debit', is_recurring: false, sync_status: 'synced', categorized_by: 'rule', confidence_score: 1 },
    undone: false, created_at: hoursAgo(26),
  })
  if (recent[2]) audit.push({ id: 'aud-4', user_id: DEMO_USER_ID, entity_type: 'transaction', entity_id: recent[2].id, action: 'delete', old_values: { ...recent[2] } as Record<string, unknown>, undone: true, created_at: hoursAgo(49) })

  return {
    version: DB_VERSION,
    created_at: now.toISOString(),
    user: { id: DEMO_USER_ID, email: DEMO_EMAIL, created_at: createdAt },
    categories, accounts, transactions, goals, investments, budgets, snapshots, audit,
    insight_cache: {},
  }
}

// Conta nova, sem nenhum lançamento: usada para fotografar os estados vazios
export function buildEmpty(now = new Date()): DemoDB {
  const full = buildSeed(now)
  return { ...full, accounts: [], transactions: [], goals: [], investments: [], budgets: [], snapshots: [], audit: [], insight_cache: {} }
}

// Extrato de exemplo devolvido quando alguém importa um PDF na demonstração
export function samplePdfStatement(now = new Date()): { bank: string; transactions: { description: string; amount: number; transaction_date: string; type: 'credit' | 'debit' }[] } {
  const d = (back: number) => iso(new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - back)))
  return {
    bank: 'Nubank',
    transactions: [
      { description: 'Mercadinho São Jorge', amount: -46.8, transaction_date: d(1), type: 'debit' },
      { description: 'Uber *Trip', amount: -23.4, transaction_date: d(1), type: 'debit' },
      { description: 'Raia Drogasil', amount: -38.9, transaction_date: d(2), type: 'debit' },
      { description: 'Ifood *Burger King', amount: -52.9, transaction_date: d(3), type: 'debit' },
      { description: 'Livraria da Vila', amount: -69.9, transaction_date: d(4), type: 'debit' },
      { description: tr('Estorno compra'), amount: 39.9, transaction_date: d(5), type: 'credit' },
      { description: 'Zaffari Supermercados', amount: -132.45, transaction_date: d(6), type: 'debit' },
      { description: 'Shell Box', amount: -150, transaction_date: d(7), type: 'debit' },
    ],
  }
}
