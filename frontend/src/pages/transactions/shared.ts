// ── Transações: filtros, períodos, valores e agrupamento ──
import { useSyncExternalStore } from 'react'
import type { TFunction } from 'i18next'
import { categoriesService, transactionsService } from '../../services'
import type { Category, Transaction, TransactionFilters } from '../../types'
import { shownCategory } from '../../lib/review'
import { currentLocale, formatNumber, toISODate } from '../../utils'

export type Period = '' | 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'custom'
export const PERIODS: Period[] = ['', 'this_month', 'last_month', 'last_3', 'this_year', 'custom']

// "none" = só as sem categoria (filtrado no cliente; a API não tem esse filtro)
export const NO_CATEGORY = 'none'

export interface Filters {
  search: string
  account_id: string
  category_id: string
  type: string
  period: Period
  start_date: string
  end_date: string
  tag: string
  review: string   // '1' = só as que pedem revisão (sem categoria ou IA com pouca confiança)
}

export const EMPTY_FILTERS: Filters = { search: '', account_id: '', category_id: '', type: '', period: '', start_date: '', end_date: '', tag: '', review: '' }

export const PAGE_SIZE = 25

export function periodRange(f: Pick<Filters, 'period' | 'start_date' | 'end_date'>): { start?: string; end?: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  switch (f.period) {
    case 'this_month': return { start: toISODate(new Date(y, m, 1)), end: toISODate(new Date(y, m + 1, 0)) }
    case 'last_month': return { start: toISODate(new Date(y, m - 1, 1)), end: toISODate(new Date(y, m, 0)) }
    case 'last_3': return { start: toISODate(new Date(y, m - 2, 1)), end: toISODate(new Date(y, m + 1, 0)) }
    case 'this_year': return { start: `${y}-01-01`, end: `${y}-12-31` }
    case 'custom': return { start: f.start_date || undefined, end: f.end_date || undefined }
    default: return {}
  }
}

// ── Nome do período (pílula do mês e frases dos vazios e da exportação) ──
export function monthOf(f: Filters): Date | null {
  const { start, end } = periodRange(f)
  if (!start || !end) return null
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  const last = new Date(s.getFullYear(), s.getMonth() + 1, 0)
  return s.getDate() === 1 && e.getTime() === last.getTime() ? s : null
}

export const monthName = (d: Date) => new Intl.DateTimeFormat(currentLocale(), { month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).format(d)

// "1 – 10 de out." / "Oct 1 – 10" (com o ano só fora do ano corrente)
function rangeText(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  const year = s.getFullYear() !== new Date().getFullYear() || e.getFullYear() !== s.getFullYear() ? 'numeric' : undefined
  const fmt = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short', year })
  return fmt.formatRange(s, e)
}
const dayText = (iso: string) => new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(new Date(iso + 'T00:00:00'))

/** Nome do período: o da pílula ("Outubro", "Todo o período") e o das frases ("em outubro", "em todo o período"). */
export function periodText(f: Filters, t: TFunction): { label: string; phrase: string } {
  const month = monthOf(f)
  if (month) { const m = monthName(month); return { label: m, phrase: t('transactions.period.inMonth', { month: m }) } }
  if (f.period === '') return { label: t('transactions.filters.allTime'), phrase: t('transactions.period.inAll') }
  if (f.period === 'last_3') return { label: t('transactions.filters.last3'), phrase: t('transactions.period.inLast3') }
  if (f.period === 'this_year') return { label: t('transactions.filters.thisYear'), phrase: t('transactions.period.inYear') }
  const { start, end } = periodRange(f)
  const label = start && end ? rangeText(start, end)
    : start ? t('transactions.period.since', { date: dayText(start) })
    : end ? t('transactions.period.until', { date: dayText(end) })
    : t('transactions.filters.allTime')
  return { label, phrase: start || end ? t('transactions.period.inRange', { range: label }) : t('transactions.period.inAll') }
}

export function toQuery(f: Filters): TransactionFilters {
  const { start, end } = periodRange(f)
  const q: TransactionFilters = {}
  if (f.search.trim()) q.search = f.search.trim()
  if (f.account_id) q.account_id = f.account_id
  if (f.category_id && f.category_id !== NO_CATEGORY) q.category_id = f.category_id
  if (f.type) q.type = f.type
  if (f.tag) q.tag = f.tag
  if (f.review) q.needs_review = true
  if (start) q.start_date = start
  if (end) q.end_date = end
  return q
}

// Filtros escondidos atrás do botão "Filtros" (a busca fica sempre à vista)
// O mês corrente é a vista padrão, não conta como filtro
export const DEFAULT_FILTERS: Filters = { ...EMPTY_FILTERS, period: 'this_month' }

// O período não entra na conta: quem cuida dele é a pílula do mês (com o próprio "×")
export function activeFilterCount(f: Filters): number {
  return [f.account_id, f.category_id, f.type, f.tag, f.review].filter(Boolean).length
}

export function hasAnyFilter(f: Filters): boolean {
  return activeFilterCount(f) > 0 || !!f.search.trim() || f.period !== 'this_month'
}

// Todas as transações do filtro (exportação e resumo), em lotes de 500
export async function fetchAll(f: Filters): Promise<Transaction[]> {
  const query = toQuery(f)
  const out: Transaction[] = []
  for (let page = 1; page <= 40; page++) {
    const res = await transactionsService.list({ ...query, page, page_size: 500 })
    out.push(...(res.transactions || []))
    if (page >= res.total_pages) break
  }
  if (f.category_id !== NO_CATEGORY) return out
  // "Sem categoria" inclui o "Outros" que a IA deu por falta de opção (na lista ele aparece sem categoria)
  const categories = (await categoriesService.list()).categories || []
  return out.filter(t => !shownCategory(t, categories))
}

// Receitas e gastos ignoram transferências entre contas próprias
export const isFlow = (t: Transaction) => t.type !== 'transfer'

export function sumFlows(txs: Transaction[]) {
  let income = 0, expense = 0
  for (const t of txs) {
    if (!isFlow(t)) continue
    if (t.amount > 0) income += t.amount
    else expense += -t.amount
  }
  const r = (v: number) => Math.round(v * 100) / 100
  return { income: r(income), expense: r(expense), net: r(income - expense) }
}

export const AUTO_SOURCES = ['ai', 'cache', 'rule']

// Com as categorias, o "Outros" dado pela IA conta como sem categoria (como na lista)
export function autoStats(txs: Transaction[], categories?: Category[]) {
  const hasCategory = (t: Transaction) => !!t.category_id && (!categories || !!shownCategory(t, categories))
  const auto = txs.filter(t => hasCategory(t) && t.categorized_by && AUTO_SOURCES.includes(t.categorized_by)).length
  const pending = txs.filter(t => !hasCategory(t)).length
  return { auto, pending, pct: txs.length ? (auto / txs.length) * 100 : 0 }
}

// ── Parcelas da mesma compra (modo revisão: uma linha e um ✓ para todas) ──
// Mesma conta, mesma descrição, mesmo valor e mesmo total de parcelas
export function installmentKey(t: Transaction): string | null {
  if (!t.installment_current || !t.installment_total || t.installment_total < 2 || t.type === 'transfer') return null
  return [t.account_id, (t.description_normalized || t.description).toUpperCase().trim(), t.amount, t.installment_total].join('|')
}

/** Junta as parcelas de cada compra na mais recente (a lista vem da mais nova para a mais velha).
 *  Devolve a lista sem as outras parcelas e, para cada linha que ficou, as parcelas que ela representa. */
export function groupInstallments(txs: Transaction[]): { items: Transaction[]; parcels: Map<string, Transaction[]> } {
  const byKey = new Map<string, Transaction[]>()
  for (const t of txs) {
    const key = installmentKey(t)
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), t])
  }
  const parcels = new Map<string, Transaction[]>()
  const items = txs.filter(t => {
    const group = byKey.get(installmentKey(t) ?? '')
    if (!group || group.length < 2) return true
    if (group[0].id !== t.id) return false
    parcels.set(t.id, group)
    return true
  })
  return { items, parcels }
}

export interface DayGroup { date: string; items: Transaction[] }

export function groupByDay(txs: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const t of txs) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.transaction_date) last.items.push(t)
    else groups.push({ date: t.transaction_date, items: [t] })
  }
  return groups
}

// "Quarta-feira, 24 de setembro" (com o ano só fora do ano corrente)
export function dayHeading(date: string, labels: { today: string; yesterday: string }, short = false): string {
  const d = new Date(date + 'T00:00:00')
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const sameYear = d.getFullYear() === now.getFullYear()
  const dayMonth = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: short ? 'short' : 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(d).replace('.', '')
  if (date === toISODate(now)) return `${labels.today}, ${dayMonth}`
  if (date === toISODate(yesterday)) return `${labels.yesterday}, ${dayMonth}`
  const text = new Intl.DateTimeFormat(currentLocale(), { weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(d)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Aceita "1.234,56", "1234,56", "1,234.56" e "1234.56"; NaN se não for número
export function parseAmount(raw: string, locale = currentLocale()): number {
  let s = raw.replace(/[^\d,.-]/g, '')
  if (!s || !/\d/.test(s)) return NaN
  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.'
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.')
  } else if (lastComma >= 0) {
    const thousands = /^\d{1,3}(,\d{3})+$/.test(s) && locale.startsWith('en')
    s = thousands ? s.replace(/,/g, '') : s.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '')
  } else if (lastDot >= 0) {
    const thousands = /^\d{1,3}(\.\d{3})+$/.test(s) && !locale.startsWith('en')
    s = thousands ? s.replace(/\./g, '') : s.replace(/\.(?=[^.]*$)/, '#').replace(/\./g, '').replace('#', '.')
  }
  const v = Number(s)
  return Number.isFinite(v) ? (negative ? -v : v) : NaN
}

// Valor para o campo de texto: "1.650,00" / "1,650.00"
export const amountToInput = (v: number) => formatNumber(Math.abs(v), 2)

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))]
}

// Filtros na URL: dá para voltar, recarregar e criar links para a tela
const URL_KEYS: (keyof Filters)[] = ['search', 'account_id', 'category_id', 'type', 'period', 'start_date', 'end_date', 'tag', 'review']

export function filtersFromParams(p: URLSearchParams): Filters {
  const f = { ...EMPTY_FILTERS }
  for (const k of URL_KEYS) {
    const v = p.get(k)
    if (v) (f as Record<string, string>)[k] = v
  }
  if (!PERIODS.includes(f.period)) f.period = ''
  // Datas soltas na URL viram período personalizado
  if (!f.period && (f.start_date || f.end_date)) f.period = 'custom'
  // Sem nenhum filtro no endereço, a tela abre no mês corrente (navegação por mês)
  if (!URL_KEYS.some(k => p.has(k))) f.period = 'this_month'
  return f
}

export function filtersToParams(f: Filters, page: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of URL_KEYS) {
    if (f[k] && ((k !== 'start_date' && k !== 'end_date') || f.period === 'custom')) out[k] = f[k]
  }
  // "Todo o período" vai explícito: sem ele o endereço volta a abrir no mês corrente
  if (!f.period) out.period = 'all'
  if (page > 1) out.page = String(page)
  return out
}

// Largura da tela (para trocar linhas da tabela por cartões no celular)
// Na impressão vale o layout de tabela
const MOBILE_QUERY = 'screen and (max-width: 767px)'
function subscribe(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches, () => false)
}

/** A outra perna de uma transferência entre contas próprias (as duas têm o mesmo import_batch_id). */
export function transferPeer(txn: Transaction, pool: Transaction[]): Transaction | undefined {
  if (txn.type !== 'transfer' || !txn.import_batch_id) return undefined
  return pool.find(o => o.id !== txn.id && o.type === 'transfer' && o.import_batch_id === txn.import_batch_id && Math.sign(o.amount) === -Math.sign(txn.amount))
}
