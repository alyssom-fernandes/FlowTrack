// ── Quanto ainda posso gastar ─────────────────────────────
// O gasto acumulado do mês (nas categorias com orçamento) contra a linha do ritmo:
// onde ele deveria estar a cada dia, com as contas fixas no dia em que vencem.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, EmptyState, Money, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import type { Budget, Transaction } from '../../types'
import { billsByCategory, expectedBy, monthDays, paceOf, PACE_COLOR } from '../../lib/pace'
import { currentLocale, formatCurrency } from '../../utils'

interface Props {
  transactions: Transaction[]          // mês corrente
  previousMonth: Transaction[] | null  // mês anterior inteiro (contas fixas)
  budgets: Budget[] | null
  monthKey: string
  now: Date
}

const H = 172
const PAD = { top: 16, right: 8, bottom: 20, left: 8 }

export function PaceCard({ transactions, previousMonth, budgets, monthKey, now }: Props) {
  const { t } = useTranslation()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [budgets])

  const data = useMemo(() => {
    if (!budgets?.length) return null
    const { dim, day } = monthDays(monthKey, now)
    const bills = billsByCategory(previousMonth ?? [])
    const ids = new Set(budgets.map(b => b.category_id))
    const limit = budgets.reduce((s, b) => s + b.limit_amount, 0)
    const spent = budgets.reduce((s, b) => s + b.spent, 0)
    // Gasto acumulado por dia, só nas categorias com orçamento
    const perDay = new Array(dim + 1).fill(0)
    for (const tx of transactions) {
      if (tx.amount >= 0 || tx.type === 'transfer' || !tx.category_id || !ids.has(tx.category_id)) continue
      const d = Number(tx.transaction_date.slice(8, 10))
      if (d >= 1 && d <= dim) perDay[d] += -tx.amount
    }
    const actual: number[] = []
    let acc = 0
    for (let d = 1; d <= day; d++) { acc += perDay[d]; actual.push(acc) }
    const ideal = Array.from({ length: dim }, (_, i) => budgets.reduce((s, b) => s + expectedBy(b.limit_amount, bills.get(b.category_id) ?? [], i + 1, dim), 0))
    const expected = day > 0 ? ideal[day - 1] : 0
    const pace = paceOf(spent, limit, expected)
    return { dim, day, limit, spent, actual, ideal, expected, ...pace }
  }, [budgets, previousMonth, transactions, monthKey, now])

  if (budgets === null) {
    return (
      <Card className="ft-dash-pace" aria-busy>
        <CardHeader title={t('dashboard.pace.title')} />
        <Skeleton height={28} width="45%" /><div style={{ height: '0.75rem' }} /><Skeleton height={H - 30} />
      </Card>
    )
  }
  if (!data) {
    return (
      <Card className="ft-dash-pace">
        <CardHeader title={t('dashboard.pace.title')} />
        <EmptyState compact icon="target" title={t('dashboard.pace.emptyTitle')} description={t('dashboard.pace.emptyText')}
          action={<Link to="/goals?aba=orcamentos" className="ft-btn ft-btn--secondary ft-btn--sm">{t('dashboard.pace.emptyAction')}</Link>} />
      </Card>
    )
  }

  const { dim, day, limit, spent, actual, ideal, status, diff } = data
  const left = limit - spent
  const lastDay = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(new Date(now.getFullYear(), now.getMonth(), dim))
  const top = Math.max(limit, spent) * 1.15 || 1
  const w = Math.max(0, width)
  const x = (d: number) => PAD.left + ((d - 0.5) / dim) * (w - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  // Área entre o gasto e o ritmo até hoje, na cor do estado: mostra a diferença que a frase anuncia
  const gap = actual.length > 1
    ? `${path(actual)} ${ideal.slice(0, actual.length).map((v, i) => [i, v] as const).reverse().map(([i, v]) => `L${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} Z`
    : ''
  const todayX = day > 0 ? x(day) : 0
  const todayY = actual.length ? y(actual[actual.length - 1]) : 0
  const color = PACE_COLOR[status]
  const statusText = status === 'over'
    ? t('dashboard.pace.over', { value: formatCurrency(spent - limit) })
    : diff >= 0 ? t('dashboard.pace.below', { value: formatCurrency(diff) }) : t('dashboard.pace.above', { value: formatCurrency(-diff) })

  return (
    <Card className="ft-dash-pace">
      <CardHeader title={t('dashboard.pace.title')} subtitle={t('dashboard.pace.subtitle', { total: formatCurrency(limit), count: budgets?.length ?? 0 })}
        action={<Link to="/goals?aba=orcamentos" className="ft-dash-link">{t('dashboard.budgets.manage')}</Link>} />
      <div className="ft-pace__head">
        <div>
          <Money value={Math.max(0, left)} size="kpi" className="ft-pace__value" style={left < 0 ? { color: 'var(--red)' } : undefined} />
          <span className="ft-pace__until">{left >= 0 ? t('dashboard.pace.freeUntil', { date: lastDay }) : t('dashboard.pace.overTotal')}</span>
        </div>
      </div>
      <div ref={wrap} className="ft-pace__chart" data-chart="ritmo">
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={t('dashboard.pace.a11y', { spent: formatCurrency(spent), expected: formatCurrency(data.expected), limit: formatCurrency(limit) })}>
            {/* Teto: soma dos orçamentos */}
            <line x1={PAD.left} x2={w - PAD.right} y1={y(limit)} y2={y(limit)} stroke="var(--border-strong)" strokeDasharray="2 4" />
            <text x={w - PAD.right} y={y(limit) - 5} textAnchor="end" className="ft-pace__label">{t('dashboard.pace.ceiling', { value: formatCurrency(limit) })}</text>
            {/* Ritmo esperado (tracejado) */}
            <path d={path(ideal)} fill="none" stroke="var(--text-hint)" strokeWidth={1.5} strokeDasharray="4 4" />
            {gap && <path d={gap} fill={color} opacity={0.15} />}
            {/* Gasto real até hoje */}
            {actual.length > 0 && <path d={path(actual)} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="ft-pace__line" />}
            {day > 0 && actual.length > 0 && (
              <g className="ft-pace__today">
                <line x1={x(day)} x2={x(day)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border)" />
                <circle cx={x(day)} cy={y(actual[actual.length - 1])} r={4.5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
              </g>
            )}
            <text x={PAD.left} y={H - 4} className="ft-pace__label">1</text>
            {day > 0 && <text x={x(day)} y={H - 4} textAnchor="middle" className="ft-pace__label ft-pace__label--today">{t('dashboard.pace.today')}</text>}
            <text x={w - PAD.right} y={H - 4} textAnchor="end" className="ft-pace__label">{dim}</text>
          </svg>
        )}
        {/* Diferença ancorada no ponto de hoje (texto e ícone, nunca só a cor) */}
        {w > 0 && day > 0 && actual.length > 0 && (
          <span className={`ft-pace__status ft-pace__status--${status} ft-pace__tag`}
            style={{ left: Math.min(Math.max(todayX, 105), w - 105), top: Math.max(0, todayY - 40) }}>
            <Icon name={status === 'ok' ? 'checkCircle' : status === 'warn' ? 'alert' : 'alertCircle'} size={14} />
            {statusText}
          </span>
        )}
      </div>
      <div className="ft-pace__legend">
        <span><i className="ft-pace__key" style={{ background: color }} />{t('dashboard.pace.legendSpent')}</span>
        <span><i className="ft-pace__key ft-pace__key--dashed" />{t('dashboard.pace.legendPace')}</span>
      </div>
      <details className="ft-pace__how">
        <summary>{t('dashboard.pace.howTitle')}</summary>
        <p>{t('dashboard.pace.howText')}</p>
      </details>
    </Card>
  )
}
