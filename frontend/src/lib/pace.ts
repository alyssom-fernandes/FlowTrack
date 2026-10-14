// ── Ritmo do gasto ────────────────────────────────────────
// Um orçamento não se mede só pela porcentagem: 70% gastos no dia 25 está ótimo,
// 70% no dia 5 não. O ritmo compara o gasto com o que já deveria ter saído até hoje:
// as contas fixas (recorrentes do mês anterior) contam no dia em que vencem, e o resto
// do limite se espalha pelos dias do mês. Assim o aluguel do dia 6 não deixa o mês
// inteiro "acima do ritmo".
// Mesma regra no painel ("Quanto ainda posso gastar") e na tela de Orçamentos.
import type { Transaction } from '../types'

export type PaceStatus = 'ok' | 'warn' | 'over'

export const PACE_COLOR: Record<PaceStatus, string> = {
  ok: 'var(--pace-ok)',
  warn: 'var(--pace-warn)',
  over: 'var(--pace-over)',
}

export interface Bill { day: number; amount: number }

/** Dias do mês "YYYY-MM" e o dia de hoje dentro dele (o último dia para meses fechados, 0 para futuros). */
export function monthDays(monthKey: string, now = new Date()): { dim: number; day: number } {
  const [y, m] = monthKey.split('-').map(Number)
  const dim = new Date(y, m, 0).getDate()
  const current = now.getFullYear() * 12 + now.getMonth()
  const target = y * 12 + (m - 1)
  return { dim, day: target < current ? dim : target > current ? 0 : now.getDate() }
}

/** Contas fixas: gastos recorrentes do mês anterior, por categoria, com o dia em que caíram. */
export function billsByCategory(previousMonth: Transaction[]): Map<string, Bill[]> {
  const out = new Map<string, Bill[]>()
  for (const t of previousMonth) {
    if (!t.is_recurring || t.amount >= 0 || t.type === 'transfer' || !t.category_id) continue
    const list = out.get(t.category_id) ?? []
    list.push({ day: Number(t.transaction_date.slice(8, 10)), amount: -t.amount })
    out.set(t.category_id, list)
  }
  return out
}

/** Quanto do limite já deveria ter saído até o `day`: contas vencidas + parte proporcional do resto. */
export function expectedBy(limit: number, bills: Bill[], day: number, dim: number): number {
  const billsTotal = bills.reduce((s, b) => s + b.amount, 0)
  const due = bills.filter(b => b.day <= day).reduce((s, b) => s + b.amount, 0)
  const variable = Math.max(0, limit - billsTotal)
  return Math.min(limit, due + variable * (day / dim))
}

/**
 * Como o gasto está em relação ao esperado:
 * - over: passou do limite;
 * - warn: acima do esperado para hoje (mais de 5% do limite de diferença), ou a menos de 10% do limite;
 * - ok: dentro do ritmo.
 * `diff` positivo = abaixo do ritmo (folga), negativo = acima.
 */
export function paceOf(spent: number, limit: number, expected: number): { status: PaceStatus; diff: number } {
  const status: PaceStatus = spent > limit ? 'over'
    : spent - expected > limit * 0.05 || (limit - spent < limit * 0.1 && expected < limit * 0.9) ? 'warn'
    : 'ok'
  return { status, diff: Math.round((expected - spent) * 100) / 100 }
}

// ── Estado de um orçamento ────────────────────────────────
// Fonte única para o alerta, a cor da barra, a pílula e a frase do resumo.
// A API (backend/app/api/v1/_helpers.py, budget_state) e a demonstração seguem a mesma regra.
// "paid" (fixo · pago): a categoria é quase toda conta fixa, as contas do mês já caíram
// e o gasto cabe no limite. Ex.: Moradia em 99% depois do aluguel não é um aviso.
export type BudgetStatus = PaceStatus | 'paid'

export const BUDGET_COLOR: Record<BudgetStatus, string> = { ...PACE_COLOR, paid: 'var(--chart-neutral)' }

export interface BudgetState {
  status: BudgetStatus
  expected: number   // quanto já deveria ter saído até hoje
  diff: number       // positivo = abaixo do ritmo (folga), negativo = acima
  left: number       // limite − gasto (negativo quando estourou)
}

export function budgetState(spent: number, limit: number, bills: Bill[], day: number, dim: number): BudgetState {
  const expected = expectedBy(limit, bills, day, dim)
  const pace = paceOf(spent, limit, expected)
  const billsTotal = bills.reduce((s, b) => s + b.amount, 0)
  const paid = pace.status !== 'over' && bills.length > 0 && bills.every(b => b.day <= day)
    && billsTotal >= limit * 0.8 && spent >= billsTotal * 0.9
  return { status: paid ? 'paid' : pace.status, expected, diff: pace.diff, left: Math.round((limit - spent) * 100) / 100 }
}

/** Limite de gasto de uma meta pelo ritmo do período (`elapsed` = fração já passada; null sem data de fim). */
export function goalLimitState(current: number, target: number, elapsed: number | null): PaceStatus {
  if (current > target) return 'over'
  if (elapsed === null) return current >= target * 0.9 ? 'warn' : 'ok'
  return paceOf(current, target, target * elapsed).status
}

/** Fração do período que já passou, contando o dia de hoje (0 a 1); null sem data de fim. */
export function periodElapsed(start: string, end: string | null | undefined, today: Date): number | null {
  if (!end) return null
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const total = (day(end) - day(start)) / 86_400_000 + 1
  if (total <= 0) return null
  return Math.min(1, Math.max(0, ((now - day(start)) / 86_400_000 + 1) / total))
}

type T = (key: string, opts?: Record<string, unknown>) => string

/** Texto da pílula: "no ritmo", "acima do ritmo", "estourou R$ 24,67", "fixo · pago". */
export function budgetStatusText(state: BudgetState, t: T, money: (v: number) => string): string {
  if (state.status === 'over') return t('common.budgetState.over', { value: money(-state.left) })
  return t(`common.budgetState.${state.status}`)
}

/** Frase do resumo derivada dos estados: "1 estourou · 2 de 6 acima do ritmo" ou "Todas no ritmo". */
export function budgetsSummaryText(states: BudgetStatus[], t: T): string {
  const over = states.filter(s => s === 'over').length
  const warn = states.filter(s => s === 'warn').length
  const parts: string[] = []
  if (over) parts.push(t('common.budgetState.summaryOver', { count: over, total: states.length }))
  if (warn) parts.push(t('common.budgetState.summaryWarn', { count: warn, total: states.length }))
  return parts.length ? parts.join(' · ') : t('common.budgetState.summaryOk')
}
