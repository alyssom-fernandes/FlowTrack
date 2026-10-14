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
