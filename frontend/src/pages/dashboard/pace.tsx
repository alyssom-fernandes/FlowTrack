// ── Quanto ainda posso gastar ─────────────────────────────
// O gasto acumulado do mês (nas categorias com orçamento) contra a linha do ritmo:
// onde ele deveria estar a cada dia, com as contas fixas no dia em que vencem.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, EmptyState, Money, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import type { Budget, Transaction } from '../../types'
import { billsByCategory, expectedBy, monthDays, paceOf, paceTone, PACE_TONE_COLOR, PACE_TONE_ICON } from '../../lib/pace'
import { currentLocale, formatCurrency } from '../../utils'

interface Props {
  transactions: Transaction[]          // mês corrente
  previousMonth: Transaction[] | null  // mês anterior inteiro (contas fixas)
  budgets: Budget[] | null
  monthKey: string
  now: Date
}

// Altura total do gráfico; a faixa de cima (PAD.top) guarda a pílula da diferença, no alto da régua de hoje
const H = 180
const PAD = { top: 36, right: 8, bottom: 20, left: 8 }

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
  const clip = 'ft-pace' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

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

  // Largura da pílula de hoje, para mantê-la inteira dentro do gráfico sem sair de cima da régua
  const tagRef = useRef<HTMLSpanElement>(null)
  const [tagW, setTagW] = useState(0)
  useLayoutEffect(() => {
    const el = tagRef.current
    if (el && el.offsetWidth !== tagW) setTagW(el.offsetWidth)
  }, [tagW, data, width])

  if (budgets === null) {
    return (
      <Card className="ft-dash-pace" aria-busy>
        <CardHeader title={t('dashboard.pace.title')} />
        <Skeleton height={28} width="45%" /><div style={{ height: '0.75rem' }} /><Skeleton height={H} />
      </Card>
    )
  }
  if (!data) {
    return (
      <Card className="ft-dash-pace">
        <CardHeader title={t('dashboard.pace.title')} />
        <EmptyState compact title={t('dashboard.pace.emptyTitle')} description={t('dashboard.pace.emptyText')}
          action={<Link to="/goals?aba=orcamentos" className="ft-btn ft-btn--secondary ft-btn--sm">{t('dashboard.pace.emptyAction')}</Link>} />
      </Card>
    )
  }

  const { dim, day, limit, spent, actual, ideal, status, diff, expected } = data
  const left = limit - spent
  const lastDay = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(new Date(now.getFullYear(), now.getMonth(), dim))
  // Enquanto o mês corre, a escala vai até o maior entre o gasto e o ritmo de hoje (+15%): a diferença
  // entre as duas linhas aparece. Com a escala até o teto, elas ficavam coladas no pé do gráfico.
  // O teto vira um tique à direita quando fica acima da escala.
  const running = day > 0 && day < dim
  const top = (running ? Math.max(spent, expected) : Math.max(limit, spent)) * 1.15 || 1
  const ceilingIn = limit <= top
  const w = Math.max(0, width)
  const x = (d: number) => PAD.left + ((d - 0.5) / dim) * (w - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[], from = 0) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(from + i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  // Área entre o gasto e o ritmo até hoje, na cor do estado: mostra a diferença que a pílula anuncia
  const gap = actual.length > 1
    ? `${path(actual)} ${ideal.slice(0, actual.length).map((v, i) => [i, v] as const).reverse().map(([i, v]) => `L${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} Z`
    : ''
  const todayX = day > 0 ? x(day) : 0
  const tone = paceTone(status, diff)
  const color = PACE_TONE_COLOR[tone]
  const statusText = status === 'over' ? t('dashboard.pace.over', { value: formatCurrency(spent - limit) })
    : tone === 'margin' ? t('dashboard.pace.margin', { value: formatCurrency(-diff) })
    : diff >= 0 ? t('dashboard.pace.below', { value: formatCurrency(diff) }) : t('dashboard.pace.above', { value: formatCurrency(-diff) })
  // Diferença de hoje em texto e ícone (nunca só a cor), no alto da régua de hoje
  const showTag = w > 0 && day > 0 && actual.length > 0
  const half = (tagW || 180) / 2
  const tagLeft = Math.min(Math.max(todayX, half), w - half)
  const ceilingText = t('dashboard.pace.ceiling', { value: formatCurrency(limit) })

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
          <svg width={w} height={H} role="img" aria-label={t('dashboard.pace.a11y', { spent: formatCurrency(spent), expected: formatCurrency(expected), limit: formatCurrency(limit) })}>
            <defs><clipPath id={clip}><rect x={0} y={PAD.top} width={w} height={H - PAD.top - PAD.bottom} /></clipPath></defs>
            {/* Teto: soma dos orçamentos, só quando cabe na escala (no fim do mês). O rótulo fica à
                esquerda, onde o ritmo ainda está baixo (à direita a tracejada passava por cima dele);
                fora da escala o subtítulo do card já diz o total */}
            {ceilingIn && (
              <>
                <line x1={PAD.left} x2={w - PAD.right} y1={y(limit)} y2={y(limit)} stroke="var(--border-strong)" strokeDasharray="2 4" />
                <text x={PAD.left} y={y(limit) - 5} textAnchor="start" className="ft-pace__label ft-pace__label--halo">{ceilingText}</text>
              </>
            )}
            <g clipPath={`url(#${clip})`}>
              {/* Ritmo esperado (tracejado): até hoje em cinza médio, o resto do mês em cinza claro */}
              <path d={path(ideal.slice(0, Math.max(1, day)))} fill="none" stroke="var(--text-hint)" strokeWidth={1.5} strokeDasharray="4 4" />
              {running && <path d={path(ideal.slice(day - 1), day - 1)} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} strokeDasharray="4 4" />}
              {gap && <path d={gap} fill={color} opacity={0.15} />}
              {/* Gasto real até hoje */}
              {actual.length > 0 && <path d={path(actual)} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="ft-pace__line" />}
            </g>
            {day > 0 && actual.length > 0 && (
              <g className="ft-pace__today">
                {/* Régua de hoje: sai da pílula e desce até o eixo */}
                <line x1={todayX} x2={todayX} y1={PAD.top - 6} y2={H - PAD.bottom} stroke="var(--border-strong)" />
                {running && <circle cx={todayX} cy={y(expected)} r={3} fill="var(--bg-card)" stroke="var(--text-hint)" strokeWidth={1.5} />}
                <circle cx={todayX} cy={y(actual[actual.length - 1])} r={4.5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
              </g>
            )}
            {/* "1" e o último dia saem quando "hoje" encosta neles */}
            {(day <= 0 || x(day) - PAD.left > 34) && <text x={PAD.left} y={H - 4} className="ft-pace__label">1</text>}
            {day > 0 && <text x={Math.min(Math.max(todayX, PAD.left + 14), w - PAD.right - 14)} y={H - 4} textAnchor="middle" className="ft-pace__label ft-pace__label--today">{t('dashboard.pace.today')}</text>}
            {(day <= 0 || w - PAD.right - x(day) > 34) && <text x={w - PAD.right} y={H - 4} textAnchor="end" className="ft-pace__label">{dim}</text>}
          </svg>
        )}
        {showTag && (
          <span ref={tagRef} className={`ft-pace__status ft-pace__status--${tone} ft-pace__tag`} style={{ left: tagLeft, top: 2 }}>
            <Icon name={PACE_TONE_ICON[tone]} size={14} />
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
