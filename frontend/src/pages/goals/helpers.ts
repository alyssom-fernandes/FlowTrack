// Contas de metas e orçamentos (sem React): períodos, situação e valores digitados
import { currentLocale, formatDate, formatMonth, formatNumber, toISODate } from '../../utils'
import { goalLimitState } from '../../lib/pace'
import type { Category, Goal, GoalColor, Transaction } from '../../types'

const DAY = 86_400_000

// "1.300,50", "1,300.50", "1300.5", "R$ 89" → número; vazio ou inválido → NaN
export function parseAmount(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(s)) return NaN
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  // O último separador só é decimal quando tem 1 ou 2 dígitos depois
  if (last >= 0 && s.length - last - 1 <= 2) {
    return Number(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1))
  }
  return Number(s.replace(/[.,]/g, ''))
}

// Valor salvo → texto do campo no idioma atual ("1.300,00" / "1,300.00")
export function amountToInput(value: number | undefined): string {
  return value ? formatNumber(value, 2) : ''
}

// "0,00" / "0.00" conforme o idioma
export function amountPlaceholder(): string {
  return formatNumber(0, 2)
}

export function parseISO(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00')
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Mesmas regras da API: mensal = mês corrente, anual = ano corrente, personalizado = datas da meta
export function goalRange(goal: Pick<Goal, 'period' | 'start_date' | 'end_date'>, today: Date): { start: Date; end: Date | null } {
  if (goal.period === 'monthly') return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 0) }
  if (goal.period === 'yearly') return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31) }
  return { start: parseISO(goal.start_date), end: goal.end_date ? parseISO(goal.end_date) : null }
}

export type GoalStatus = 'ok' | 'warn' | 'over' | 'behind' | 'done' | 'upcoming' | 'ended'

export interface GoalView {
  pct: number          // sem teto (um limite pode passar de 100%)
  remaining: number    // limite: quanto ainda pode gastar · economia: quanto falta
  status: GoalStatus
  daysLeft: number | null
  elapsed: number | null   // fração do período que já passou (marca de ritmo na barra)
  periodText: string
}

export function describeGoal(goal: Goal, today: Date, t: (k: string, o?: Record<string, unknown>) => string): GoalView {
  const isLimit = goal.type === 'spending_limit'
  const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0
  const remaining = goal.target_amount - goal.current_amount
  const { start, end } = goalRange(goal, today)
  const now = startOfDay(today)

  const daysLeft = end && now <= end ? Math.round((end.getTime() - now.getTime()) / DAY) + 1 : null
  const elapsed = end ? Math.min(1, Math.max(0, (now.getTime() - start.getTime() + DAY) / (end.getTime() - start.getTime() + DAY))) : null

  let status: GoalStatus
  if (now < start) status = 'upcoming'
  // Limite pelo ritmo do período (lib/pace.ts): a mesma regra do alerta
  else if (isLimit) status = goal.current_amount > goal.target_amount ? 'over' : end && now > end ? 'ended' : goalLimitState(goal.current_amount, goal.target_amount, elapsed)
  else if (pct >= 100) status = 'done'
  else if (end && now > end) status = 'ended'
  // Economia atrasada: mais de 5 pontos abaixo do esperado para a fração do período que já passou
  else status = elapsed !== null && pct < elapsed * 100 - 5 ? 'behind' : 'ok'

  return { pct, remaining, status, daysLeft, elapsed, periodText: periodText(goal, today, t) }
}

function periodText(goal: Pick<Goal, 'period' | 'start_date' | 'end_date'>, today: Date, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (goal.period === 'monthly') return t('goals.period.monthlyOf', { month: formatMonth(toISODate(today).slice(0, 7), 'long') })
  if (goal.period === 'yearly') return t('goals.period.yearlyOf', { year: today.getFullYear() })
  const from = formatDate(goal.start_date, { day: 'numeric', month: 'short', year: 'numeric' })
  if (!goal.end_date) return t('goals.period.from', { date: from })
  const sameYear = goal.start_date.slice(0, 4) === goal.end_date.slice(0, 4)
  const a = sameYear ? formatDate(goal.start_date, { day: 'numeric', month: 'short' }) : from
  const b = formatDate(goal.end_date, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${b}`
}

// ── Meta de economia: identidade e previsão ──────────────
// Cores oferecidas: o vinho e as --cat-* que não lembram estado (sem verde, âmbar e vermelho)
export const GOAL_COLORS: GoalColor[] = ['accent', 'cat-1', 'cat-3', 'cat-5', 'cat-7', 'cat-2', 'cat-6']
export const goalColorVar = (c: GoalColor) => `var(--${c})`

// Meses fechados que contam para o ritmo: do mês de início até o mês passado
export function closedMonths(goal: Pick<Goal, 'start_date'>, today: Date): { from: string; to: string; count: number } | null {
  const start = parseISO(goal.start_date)
  const count = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth()
  if (count <= 0) return null
  return { from: goal.start_date.slice(0, 10), to: toISODate(new Date(today.getFullYear(), today.getMonth(), 0)), count }
}

// Quando a meta chega lá no ritmo real dos meses já fechados (média do que entrou por mês).
// Menos de 2 meses fechados ou nada guardado neles: sem previsão (a tela diz só quanto falta).
export const MIN_FORECAST_MONTHS = 2
export function savingsForecast(goal: Goal, closedTxs: Transaction[], today: Date): Date | null {
  const remaining = goal.target_amount - goal.current_amount
  const months = closedMonths(goal, today)
  if (remaining <= 0 || !months || months.count < MIN_FORECAST_MONTHS) return null
  const saved = closedTxs.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0)
  const perMonth = saved / months.count
  if (!(perMonth > 0)) return null
  // O mês corrente já está no "guardado até agora": a conta começa no próximo
  return new Date(today.getFullYear(), today.getMonth() + Math.ceil(remaining / perMonth), 1)
}

// "fev. de 2027" / "Feb 2027"
export function forecastText(d: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), { month: 'short', year: 'numeric' }).format(d)
}

// ── Meses (orçamentos) ─────────────────────────────────────
export function monthKey(d: Date): string {
  return toISODate(d).slice(0, 7)
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

export function monthBounds(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number)
  return { start: toISODate(new Date(y, m - 1, 1)), end: toISODate(new Date(y, m, 0)) }
}

// Só o nome do mês ("outubro"); com o ano quando for de outro ano que o de referência
export function monthName(key: string, refKey?: string): string {
  if (refKey && refKey.slice(0, 4) !== key.slice(0, 4)) return formatMonth(key, 'long')
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(currentLocale(), { month: 'long' }).format(new Date(y, m - 1, 1))
}

// "outubro de 2026" → "Outubro de 2026" (título da navegação)
export function monthTitle(key: string): string {
  const s = formatMonth(key, 'long')
  return s.charAt(0).toLocaleUpperCase(currentLocale()) + s.slice(1)
}

// Receita e transferência não fazem sentido como limite de gasto
export function isSpendingCategory(c: Category): boolean {
  return !(c.is_default && (c.name === 'Receita' || c.name === 'Transferência'))
}
