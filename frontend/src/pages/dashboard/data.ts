// Cálculos e formatos usados só pelo painel
import { currentLocale, formatDate, formatMonth, formatPercent } from '../../utils'
import type { CashflowEvent, CashflowProjection } from '../../types'
import { variationDir, variationTone, type VariationDir, type VariationTone } from '../../lib/variation'

export type MonthTotals = { month: string; income: number; expense: number }

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Últimos n meses (o atual por último), com zero onde não houve movimento
export function lastMonths(summary: MonthTotals[], n: number, now = new Date()): MonthTotals[] {
  const byMonth = new Map(summary.map(s => [s.month, s]))
  return Array.from({ length: n }, (_, i) => {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1))
    const s = byMonth.get(key)
    return { month: key, income: s?.income ?? 0, expense: s?.expense ?? 0 }
  })
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase(currentLocale()) + s.slice(1) : s
}

export const monthShort = (key: string) => capitalize(formatMonth(key, 'short'))
export const monthLong = (key: string) => capitalize(formatMonth(key, 'long'))

// "2 de out." / "Oct 2"
export const dayMonth = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short' })
// "sex., 10 de out." / "Fri, Oct 10"
export const weekdayDayMonth = (iso: string) => capitalize(formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }))

// Rótulo de eixo: "R$ 6 mil" / "R$6K"
export function axisMoney(value: number): string {
  if (value === 0) return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(0)
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

// Marcas "redondas" do eixo (1, 2, 2,5 ou 5 × 10ⁿ)
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) { max = min + 1 }
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// Projeção dia a dia: hoje + 30 dias, saldo constante entre eventos
export interface ProjectionPoint { date: string; balance: number; events: CashflowEvent[] }

export function dailyProjection(cf: CashflowProjection, now = new Date()): ProjectionPoint[] {
  const byDate = new Map(cf.days.map(d => [d.date, d]))
  const out: ProjectionPoint[] = []
  let balance = cf.starting_balance
  for (let i = 0; i <= 30; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const iso = `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`
    const day = byDate.get(iso)
    if (day) balance = day.projected_balance
    out.push({ date: iso, balance, events: day?.events ?? [] })
  }
  return out
}

// Texto da IA: tira marcação de markdown e devolve blocos simples
export type InsightBlock = { kind: 'p' | 'li' | 'h'; text: string }

export function insightBlocks(raw: string): InsightBlock[] {
  const blocks: InsightBlock[] = []
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    let text = line.trim()
    if (!text) continue
    const isItem = /^([-*•]|\d+[.)])\s+/.test(text)
    const isHeading = /^#{1,6}\s/.test(text)
    text = text
      .replace(/^#{1,6}\s*/, '')
      .replace(/^([-*•]|\d+[.)])\s+/, '')
      .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
      .replace(/(^|\s)[*_](\S.*?\S|\S)[*_](?=\s|[.,;:!?)]|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
    // Um título logo no começo repete o do cartão: fica de fora
    if (isHeading && !blocks.length) continue
    if (text) blocks.push({ kind: isItem ? 'li' : isHeading ? 'h' : 'p', text })
  }
  return blocks
}

// Destaca valores em reais e porcentagens dentro do texto
export function splitHighlights(text: string): { text: string; strong: boolean }[] {
  const re = /(-?R\$\s?-?[\d.,]*\d(?:[.,](?=\d))?[\d]*(?:\s?(?:mil|mi|bi|K|M)\b)?|[+-]?\d+(?:[.,]\d+)?\s?%)/g
  const parts: { text: string; strong: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) parts.push({ text: text.slice(last, i), strong: false })
    parts.push({ text: m[0], strong: true })
    last = i + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false })
  return parts
}

// ── Variação contra o período anterior ────────────────────
// A cor de estado só aparece a partir de ±5% (lib/variation.ts); abaixo disso a variação fica em --text-muted.
// `amount` é a diferença em dinheiro, que vai junto da porcentagem ("+R$ 78 (+2,0%)").
export type Delta = { text: string; dir: VariationDir; tone: VariationTone; ref: string; amount?: number }

export function makeDelta(cur: number, before: number | undefined | null, upIsGood: boolean, ref = ''): Delta | null {
  if (before === undefined || before === null || before === 0) return null
  const pct = ((cur - before) / Math.abs(before)) * 100
  if (!Number.isFinite(pct)) return null
  return { text: formatPercent(pct, 1), dir: variationDir(pct), tone: variationTone(pct, upIsGood), ref, amount: cur - before }
}

export const DELTA_COLOR: Record<VariationTone, string> = { good: 'var(--green)', bad: 'var(--red)', neutral: 'var(--text-muted)' }
