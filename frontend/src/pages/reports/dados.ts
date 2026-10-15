// ── Relatórios: períodos e agregações ─────────────────────
// Tudo aqui é puro (sem React), para a tela e as exportações usarem os
// mesmos números. Receitas e gastos ignoram transferências entre contas.
import { transactionsService } from '../../services'
import { categoryLabel, currentLocale, formatMonth, toISODate } from '../../utils'
import type { Category, Transaction } from '../../types'
import { categoryColor, categoryPrintHex } from '../../lib/categoryColor'

export type PeriodKey = 'thisMonth' | 'lastMonth' | '3m' | '6m' | '12m' | 'year' | 'custom'
export const PERIOD_KEYS: PeriodKey[] = ['thisMonth', 'lastMonth', '3m', '6m', '12m', 'year', 'custom']

export interface Range { start: string; end: string }

const parse = (iso: string) => new Date(iso + 'T00:00:00')
// Arredonda em centavos: somas de ponto flutuante não vazam para as planilhas
const r2 = (v: number) => Math.round(v * 100) / 100
const day = (y: number, m: number, d: number) => toISODate(new Date(y, m, d))
const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return toISODate(d) }

// Períodos que incluem o mês corrente terminam hoje: o resto do mês ainda não aconteceu
export function periodRange(key: PeriodKey, custom: Range, now = new Date()): Range {
  const y = now.getFullYear(), m = now.getMonth()
  const today = toISODate(now)
  switch (key) {
    case 'thisMonth': return { start: day(y, m, 1), end: today }
    case 'lastMonth': return { start: day(y, m - 1, 1), end: day(y, m, 0) }
    case '3m': return { start: day(y, m - 2, 1), end: today }
    case '6m': return { start: day(y, m - 5, 1), end: today }
    case '12m': return { start: day(y, m - 11, 1), end: today }
    case 'year': return { start: day(y, 0, 1), end: today }
    default: return custom
  }
}

// Mesmo dia, n meses antes (o último dia do mês continua sendo o último dia)
function shiftMonths(iso: string, n: number): string {
  const d = parse(iso)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const targetLast = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()
  const dd = d.getDate() === last ? targetLast : Math.min(d.getDate(), targetLast)
  return day(d.getFullYear(), d.getMonth() + n, dd)
}

// Quantos meses cada período anda para trás na comparação
const SHIFT: Partial<Record<PeriodKey, number>> = { thisMonth: 1, lastMonth: 1, '3m': 3, '6m': 6, '12m': 12, year: 12 }

export function daysIn(r: Range): number {
  return Math.round((parse(r.end).getTime() - parse(r.start).getTime()) / 86_400_000) + 1
}

// Meses inteiros (começa no dia 1 e termina no último dia de um mês)?
function wholeMonths(r: Range): number | null {
  const s = parse(r.start), e = parse(r.end)
  const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate()
  if (s.getDate() !== 1 || e.getDate() !== lastDay) return null
  return (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1
}

// Período anterior comparável: o mesmo trecho deslocado (1 a 14 de outubro → 1 a 14 de setembro;
// este ano até hoje → o mesmo trecho do ano passado). Personalizado: período de mesmo tamanho.
export function previousRange(key: PeriodKey, r: Range): Range {
  const s = parse(r.start)
  const shift = SHIFT[key]
  if (shift) return { start: shiftMonths(r.start, -shift), end: shiftMonths(r.end, -shift) }
  const months = wholeMonths(r)
  if (months) return { start: day(s.getFullYear(), s.getMonth() - months, 1), end: addDays(r.start, -1) }
  const end = addDays(r.start, -1)
  return { start: addDays(end, -(daysIn(r) - 1)), end }
}

// "1 – 31 de outubro de 2026" / "October 1 – 31, 2026"
export function formatRange(r: Range): string {
  const fmt = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
  if (r.start === r.end) return fmt.format(parse(r.start))
  return fmt.formatRange(parse(r.start), parse(r.end))
}

// ── Leitura ───────────────────────────────────────────────
// A API devolve no máximo 500 por página: busca todas as páginas do período
export async function fetchRange(r: Range): Promise<Transaction[]> {
  const out: Transaction[] = []
  for (let page = 1; page <= 40; page++) {
    const res = await transactionsService.list({ start_date: r.start, end_date: r.end, page, page_size: 500 })
    out.push(...(res.transactions ?? []))
    if (page >= (res.total_pages || 1)) break
  }
  return out
}

// ── Resumo ────────────────────────────────────────────────
export const isFlow = (t: Transaction) => t.type !== 'transfer'

export interface Summary { income: number; expense: number; balance: number; savingsRate: number | null; count: number }

export function summarize(txs: Transaction[]): Summary {
  let income = 0, expense = 0, count = 0
  for (const t of txs) {
    if (!isFlow(t)) continue
    count++
    if (t.amount > 0) income += t.amount
    else expense += Math.abs(t.amount)
  }
  income = r2(income); expense = r2(expense)
  const balance = r2(income - expense)
  return { income, expense, balance, savingsRate: income > 0 ? (balance / income) * 100 : null, count }
}

// Variação percentual; sem base de comparação devolve null
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

// Variação em texto, sem sinal (a seta diz a direção): uma casa decimal fixa ("7,5%");
// de +100% para cima vira múltiplo ("×5,9"), mais fácil de ler que "496%"
export function changeText(v: number): string {
  if (v >= 100) return `×${new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(1 + v / 100)}`
  return new Intl.NumberFormat(currentLocale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v) / 100)
}

// ── Série no tempo ────────────────────────────────────────
export type Granularity = 'week' | 'month'

export interface Bucket {
  key: string
  start: string
  end: string
  label: string      // rótulo curto do eixo
  longLabel: string  // dica e tabelas
  yearMark?: string  // ano embaixo do rótulo (primeiro mês e janeiro)
  future?: boolean   // ainda não chegou
  income: number
  expense: number
}

export function granularityOf(r: Range): Granularity {
  return daysIn(r) <= 31 ? 'week' : 'month'
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase(currentLocale()) + s.slice(1)

function shortDay(iso: string) {
  return new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(parse(iso)).replace(/\./g, '').replace(' de ', ' ')
}

export function buildBuckets(r: Range, g = granularityOf(r)): Bucket[] {
  const out: Bucket[] = []
  const today = toISODate()
  if (g === 'week') {
    const fmt = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' })
    let s = r.start
    while (s <= r.end) {
      const e7 = addDays(s, 6)
      const e = e7 < r.end ? e7 : r.end
      out.push({ key: s, start: s, end: e, label: shortDay(s), longLabel: fmt.formatRange(parse(s), parse(e)), future: s > today, income: 0, expense: 0 })
      s = addDays(e, 1)
    }
    return out
  }
  const s = parse(r.start), e = parse(r.end)
  const sameYear = s.getFullYear() === e.getFullYear()
  for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const first = toISODate(d) < r.start ? r.start : toISODate(d)
    const lastIso = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    const last = lastIso > r.end ? r.end : lastIso
    const yearMark = !sameYear && (out.length === 0 || d.getMonth() === 0) ? String(d.getFullYear()) : undefined
    out.push({ key, start: first, end: last, label: cap(formatMonth(key, 'short')), longLabel: cap(formatMonth(key, 'long')), yearMark, future: first > today, income: 0, expense: 0 })
  }
  return out
}

export function fillBuckets(buckets: Bucket[], txs: Transaction[]): Bucket[] {
  const out = buckets.map(b => ({ ...b, income: 0, expense: 0 }))
  for (const t of txs) {
    if (!isFlow(t)) continue
    const b = out.find(x => t.transaction_date >= x.start && t.transaction_date <= x.end)
    if (!b) continue
    if (t.amount > 0) b.income += t.amount
    else b.expense += Math.abs(t.amount)
  }
  return out.map(b => ({ ...b, income: r2(b.income), expense: r2(b.expense) }))
}

// ── Por categoria ─────────────────────────────────────────
export interface CategoryRow {
  id: string
  name: string
  value: number
  share: number          // % do total de gastos
  prev: number           // mesmo grupo no período anterior
  change: number | null  // variação %
  count: number
  color: string          // cor fixa da categoria (CSS)
  printHex: string       // a mesma cor no tema claro, para PDF e Excel
}

export function byCategory(txs: Transaction[], prevTxs: Transaction[], categories: Category[], noCategory: string): CategoryRow[] {
  const catMap = new Map(categories.map(c => [c.id, c]))
  const sum = (list: Transaction[]) => {
    const m = new Map<string, { value: number; count: number }>()
    for (const t of list) {
      if (!isFlow(t) || t.amount >= 0) continue
      const k = t.category_id && catMap.has(t.category_id) ? t.category_id : '__none__'
      const cur = m.get(k) ?? { value: 0, count: 0 }
      cur.value += Math.abs(t.amount); cur.count++
      m.set(k, cur)
    }
    return m
  }
  const curr = sum(txs), prev = sum(prevTxs)
  const total = [...curr.values()].reduce((s, v) => s + v.value, 0)
  return [...curr.entries()]
    .map(([id, v]) => {
      const p = prev.get(id)?.value ?? 0
      return {
        id,
        name: id === '__none__' ? noCategory : categoryLabel(catMap.get(id), noCategory),
        value: r2(v.value),
        share: total > 0 ? (v.value / total) * 100 : 0,
        prev: r2(p),
        change: pctChange(v.value, p),
        count: v.count,
        color: id === '__none__' ? 'var(--text-hint)' : categoryColor(catMap.get(id)),
        printHex: id === '__none__' ? '#8e8e99' : categoryPrintHex(catMap.get(id)),
      }
    })
    .sort((a, b) => b.value - a.value)
}

// ── Maiores gastos (agrupados pela descrição) ─────────────
export interface TopRow { key: string; description: string; category: string; count: number; value: number; share: number; lastDate: string }

export function topExpenses(txs: Transaction[], categories: Category[], noCategory: string, limit = 6): TopRow[] {
  const catMap = new Map(categories.map(c => [c.id, c]))
  const groups = new Map<string, { description: string; cats: Map<string, number>; count: number; value: number; lastDate: string }>()
  let total = 0
  for (const t of txs) {
    if (!isFlow(t) || t.amount >= 0) continue
    const v = Math.abs(t.amount)
    total += v
    const key = t.description.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')
    const g = groups.get(key) ?? { description: t.description.trim(), cats: new Map(), count: 0, value: 0, lastDate: '' }
    g.count++; g.value += v
    if (t.transaction_date > g.lastDate) { g.lastDate = t.transaction_date; g.description = t.description.trim() }
    const c = t.category_id ?? ''
    g.cats.set(c, (g.cats.get(c) ?? 0) + 1)
    groups.set(key, g)
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const catId = [...g.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      return { key, description: g.description, category: catId ? categoryLabel(catMap.get(catId), noCategory) : noCategory, count: g.count, value: r2(g.value), share: total > 0 ? (g.value / total) * 100 : 0, lastDate: g.lastDate }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

// ── Mês fora da curva (etiqueta de leitura no Mês a mês) ──
// Entre os períodos já fechados (sem o corrente, ainda pela metade, e sem os futuros), o gasto
// mais longe da média. Só vale com 3 ou mais períodos e um desvio que importe (±5%, a mesma
// régua das setas coloridas); senão não há o que destacar.
export interface Outlier { index: number; pct: number }

export function spendOutlier(buckets: Bucket[], today = toISODate(), minPct = 5): Outlier | null {
  const closed = buckets.map((b, i) => ({ b, i })).filter(({ b }) => !b.future && b.end < today && b.expense > 0)
  if (closed.length < 3) return null
  const avg = closed.reduce((s, x) => s + x.b.expense, 0) / closed.length
  if (avg <= 0) return null
  const best = closed.reduce((a, x) => (Math.abs(x.b.expense - avg) > Math.abs(a.b.expense - avg) ? x : a))
  const pct = ((best.b.expense - avg) / avg) * 100
  return Math.abs(pct) >= minPct ? { index: best.i, pct } : null
}

// ── Eixos ─────────────────────────────────────────────────
// Divisões "redondas" para o eixo de valores (0, 2 mil, 4 mil…)
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v < max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

// Eixo justo: o topo é o maior valor + 10% (não a próxima divisão redonda, que deixava metade do
// gráfico vazia: R$ 7,6 mil no topo e eixo até R$ 10 mil). As linhas de grade seguem redondas.
export function snugAxis(max: number, count = 4): { ticks: number[]; yMax: number } {
  if (max <= 0) return { ticks: [0, 1], yMax: 1 }
  const yMax = max * 1.1
  const ticks = niceTicks(yMax, count).filter(v => v <= yMax)
  return { ticks, yMax }
}

// "R$ 2 mil" / "R$2K" — só para eixos
export function axisMoney(v: number, signed = false): string {
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto' }).format(v)
}

// ── Fatias da rosca ───────────────────────────────────────
export interface Slice { key: string; name: string; value: number; share: number; color: string; prev: number; change: number | null; children?: CategoryRow[] }

// Até 6 fatias: as 5 maiores com a cor fixa da categoria (a mesma em todas as telas e no PDF)
// e o resto agrupado em cinza hachurado (diferente da categoria "Outros", que é cinza liso)
export function toSlices(rows: CategoryRow[], othersLabel: (count: number) => string): Slice[] {
  const main = rows.length <= 6 ? rows : rows.slice(0, 5)
  const rest = rows.length <= 6 ? [] : rows.slice(5)
  const slices: Slice[] = main.map(r => ({ key: r.id, name: r.name, value: r.value, share: r.share, color: r.color, prev: r.prev, change: r.change }))
  if (rest.length) {
    const value = r2(rest.reduce((s, r) => s + r.value, 0))
    const prev = r2(rest.reduce((s, r) => s + r.prev, 0))
    slices.push({ key: '__others__', name: othersLabel(rest.length), value, share: rest.reduce((s, r) => s + r.share, 0), color: 'var(--cat-group)', prev, change: pctChange(value, prev), children: rest })
  }
  return slices
}
