// Cartões do painel
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, ProgressBar, Skeleton } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { alertHref, categoryLabel, formatCurrency, formatPercent, formatRelative, formatSignedCurrency } from '../../utils'
import type { Account, Alert, Budget, Category, CashflowProjection, InsightResponse, NetWorth, Transaction } from '../../types'
import { CashflowChart, MonthlyChart, Sparkline } from './charts'
import { CategoryIcon } from './CategoryIcon'
import { dayMonth, insightBlocks, splitHighlights, type MonthTotals, type ProjectionPoint } from './data'

// Link de texto do cabeçalho dos cartões ("Ver todas", "Gerenciar")
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="ft-dash-link">{children}<Icon name="arrowRight" size={14} /></Link>
}

// ── Métrica do topo ───────────────────────────────────────
export type Delta = { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral'; ref: string }

// `foot` aparece quando não há comparação; `extra` aparece sempre, no fim da linha
export function KpiTile({ label, value, delta, foot, extra, negative }: { label: string; value: string; delta?: Delta | null; foot?: ReactNode; extra?: ReactNode; negative?: boolean }) {
  const color = delta?.tone === 'good' ? 'var(--green)' : delta?.tone === 'bad' ? 'var(--red)' : 'var(--text-muted)'
  const icon: IconName = delta?.dir === 'up' ? 'arrowUpRight' : delta?.dir === 'down' ? 'arrowDownRight' : 'minus'
  return (
    <Card className="ft-kpi">
      <span className="ft-kpi__label">{label}</span>
      <span className="ft-kpi__value" style={negative ? { color: 'var(--red)' } : undefined}>{value}</span>
      <span className="ft-kpi__foot">
        {delta && (
          <span className="ft-kpi__delta ft-num" style={{ color }}>
            <Icon name={icon} size={13} strokeWidth={2} />{delta.text}
          </span>
        )}
        {delta && <span className="ft-kpi__ref">{delta.ref}</span>}
        {!delta && foot}
        {extra && <span className="ft-kpi__extra">{extra}</span>}
      </span>
    </Card>
  )
}

// ── Evolução mensal ───────────────────────────────────────
export function MonthlyCard({ data, currentMonth }: { data: MonthTotals[]; currentMonth: string }) {
  const { t } = useTranslation()
  const withData = data.filter(d => d.income || d.expense)
  const avgNet = withData.length ? withData.reduce((s, d) => s + d.income - d.expense, 0) / withData.length : 0
  return (
    <Card className="ft-dash-monthly">
      <CardHeader title={t('dashboard.monthly.title')} subtitle={t('dashboard.monthly.subtitle')}
        action={
          <div className="ft-legend" aria-hidden>
            <span><i style={{ background: 'var(--chart-income)' }} />{t('dashboard.monthly.income')}</span>
            <span><i style={{ background: 'var(--chart-expense)' }} />{t('dashboard.monthly.expenses')}</span>
          </div>
        } />
      <MonthlyChart data={data} currentMonth={currentMonth} />
      {withData.length > 1 && (
        <p className="ft-dash-note">
          {t('dashboard.monthly.avgNet', { count: withData.length })}{' '}
          <strong className="ft-num" style={{ color: avgNet < 0 ? 'var(--red)' : 'var(--text-primary)' }}>{formatSignedCurrency(avgNet)}</strong>
        </p>
      )}
    </Card>
  )
}

// ── Resumo do mês (IA) ────────────────────────────────────
export function InsightCard({ insight, loading, error, onRefresh }: { insight: InsightResponse | null; loading: boolean; error: boolean; onRefresh: () => void }) {
  const { t } = useTranslation()
  // Parágrafos e listas na ordem em que vieram (itens seguidos viram uma lista)
  const groups: { kind: 'p' | 'h' | 'ul'; texts: string[] }[] = []
  for (const b of insight ? insightBlocks(insight.text) : []) {
    const last = groups[groups.length - 1]
    if (b.kind === 'li' && last?.kind === 'ul') last.texts.push(b.text)
    else groups.push({ kind: b.kind === 'li' ? 'ul' : b.kind, texts: [b.text] })
  }
  const render = (text: string) => splitHighlights(text).map((p, i) => p.strong ? <strong key={i} className="ft-num">{p.text}</strong> : <span key={i}>{p.text}</span>)

  return (
    <Card className="ft-dash-insight" aria-busy={loading || undefined}>
      <CardHeader
        title={t('dashboard.insight.title')}
        subtitle={
          <span className="ft-insight__meta">
            {insight && !loading ? t('dashboard.insight.generated', { when: formatRelative(insight.generated_at) }) : t('dashboard.insight.byAi')}
          </span>
        }
        action={<IconButton icon="refresh" label={t('dashboard.insight.refresh')} onClick={onRefresh} loading={loading} />}
      />
      {loading && !insight ? (
        <div className="ft-insight__skeleton" aria-label={t('dashboard.insight.loading')}>
          <Skeleton height={12} /><Skeleton height={12} width="94%" /><Skeleton height={12} width="97%" /><Skeleton height={12} width="88%" /><Skeleton height={12} width="56%" />
        </div>
      ) : error && !insight ? (
        <div className="ft-insight__error">
          <p>{t('dashboard.insight.error')}</p>
          <Button variant="secondary" size="sm" icon="refresh" onClick={onRefresh}>{t('dashboard.insight.retry')}</Button>
        </div>
      ) : (
        <div className="ft-insight__text" style={{ opacity: loading ? 0.5 : 1 }}>
          {groups.map((g, i) => g.kind === 'ul'
            ? <ul key={i}>{g.texts.map((text, j) => <li key={j}>{render(text)}</li>)}</ul>
            : <p key={i} className={g.kind === 'h' ? 'ft-insight__h' : undefined}>{render(g.texts[0])}</p>)}
        </div>
      )}
    </Card>
  )
}

// ── Projeção de saldo ─────────────────────────────────────
export function CashflowCard({ cashflow, points }: { cashflow: CashflowProjection | null; points: ProjectionPoint[] }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  if (!cashflow) {
    return (
      <Card className="ft-dash-cashflow" aria-busy>
        <CardHeader title={t('dashboard.cashflow.title')} subtitle={t('dashboard.cashflow.subtitle')} />
        <Skeleton height={190} radius="var(--radius-md)" />
      </Card>
    )
  }
  const events = cashflow.days.flatMap(d => d.events.map(e => ({ ...e, date: d.date })))
  const visible = all ? events : events.slice(0, 5)
  const start = points.length ? points[0].balance : cashflow.starting_balance
  const end = points.length ? points[points.length - 1].balance : cashflow.projected_balance
  const change = end - start
  // Menor saldo do período (o primeiro dia em que ele acontece)
  const low = points.reduce<ProjectionPoint | null>((m, p) => (!m || p.balance < m.balance ? p : m), null)
  const lowWhen = !low || low === points[0] ? t('dashboard.cashflow.todayLower') : dayMonth(low.date)
  const tone = (v: number) => (v < 0 ? { color: 'var(--red)' } : undefined)

  return (
    <Card className="ft-dash-cashflow">
      <CardHeader title={t('dashboard.cashflow.title')} subtitle={t('dashboard.cashflow.subtitle')}
        action={cashflow.has_negative_days ? <Badge variant="red" icon="alert">{t('dashboard.cashflow.negative')}</Badge> : undefined} />
      {events.length > 0 && <dl className="ft-cash-stats">
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.today')}</dt>
          <dd><span className="ft-cash-stat__value ft-num" style={tone(start)}>{formatCurrency(start)}</span></dd>
        </div>
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.lowest')}</dt>
          <dd>
            <span className="ft-cash-stat__value ft-num" style={tone(low?.balance ?? start)}>{formatCurrency(low?.balance ?? start)}</span>
            <span className="ft-cash-stat__sub">{lowWhen}</span>
          </dd>
        </div>
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.in30')}</dt>
          <dd>
            <span className="ft-cash-stat__value ft-num" style={tone(end)}>{formatCurrency(end)}</span>
            {change !== 0 && <span className="ft-cash-stat__sub ft-num" style={{ color: change < 0 ? 'var(--red)' : 'var(--green)' }}>{formatSignedCurrency(change)}</span>}
          </dd>
        </div>
      </dl>}
      {events.length === 0 ? (
        <EmptyState compact icon="calendar" title={t('dashboard.cashflow.emptyTitle')} description={t('dashboard.cashflow.emptyText')} />
      ) : (
        <>
          <CashflowChart points={points} />
          <div className="ft-upcoming">
            <div className="ft-upcoming__head">{t('dashboard.cashflow.upcoming')}</div>
            <ul>
              {visible.map((e, i) => (
                <li key={i} className="ft-upcoming__row">
                  <span className="ft-upcoming__date ft-num">{dayMonth(e.date)}</span>
                  <span className="ft-upcoming__desc">
                    <span className="ft-upcoming__name">{e.description}</span>
                    <span className="ft-upcoming__src">{t(e.source === 'installment' ? 'dashboard.cashflow.installment' : 'dashboard.cashflow.recurring')}</span>
                  </span>
                  <span className="ft-upcoming__amount ft-num" style={{ color: e.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }}>{formatSignedCurrency(e.amount)}</span>
                </li>
              ))}
            </ul>
            {events.length > 5 && (
              <Button variant="ghost" size="sm" block iconRight={all ? 'chevronUp' : 'chevronDown'} onClick={() => setAll(v => !v)} aria-expanded={all} style={{ marginTop: '0.375rem' }}>
                {all ? t('dashboard.cashflow.showLess') : t('dashboard.cashflow.showAll', { count: events.length })}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

// ── Patrimônio líquido ────────────────────────────────────
export function NetWorthCard({ nw }: { nw: NetWorth | null }) {
  const { t } = useTranslation()
  if (!nw) {
    return (
      <Card className="ft-dash-networth" aria-busy>
        <CardHeader title={t('dashboard.netWorth.title')} />
        <Skeleton height={30} width="60%" /><Skeleton height={64} style={{ marginTop: '1rem' }} /><Skeleton height={8} style={{ marginTop: '1rem' }} />
      </Card>
    )
  }
  const snaps = nw.snapshots
  const first = snaps[0]
  const change = first ? nw.net_worth - first.net_worth : 0
  const total = Math.max(0, nw.total_accounts) + Math.max(0, nw.total_investments)
  const accPct = total ? (Math.max(0, nw.total_accounts) / total) * 100 : 0
  const invPct = total ? 100 - accPct : 0
  const parts = [
    { key: 'accounts', label: t('dashboard.netWorth.accounts'), value: nw.total_accounts, pct: accPct, color: 'var(--chart-2)' },
    { key: 'investments', label: t('dashboard.netWorth.investments'), value: nw.total_investments, pct: invPct, color: 'var(--chart-1)' },
  ]

  return (
    <Card className="ft-dash-networth">
      <CardHeader title={t('dashboard.netWorth.title')} action={<CardLink to="/investments">{t('dashboard.netWorth.link')}</CardLink>} />
      <div className="ft-nw__value" style={{ color: nw.net_worth < 0 ? 'var(--red)' : undefined }}>{formatCurrency(nw.net_worth)}</div>
      {first && snaps.length > 1 && (
        <div className="ft-nw__change ft-num" style={{ color: change < 0 ? 'var(--red)' : 'var(--green)' }}>
          <Icon name={change < 0 ? 'arrowDownRight' : 'arrowUpRight'} size={13} strokeWidth={2} />
          {formatSignedCurrency(change)}
          {first.net_worth > 0 && <span> ({formatPercent((change / first.net_worth) * 100, 1)})</span>}
          <span className="ft-nw__since">{t('dashboard.netWorth.since', { count: snaps.length })}</span>
        </div>
      )}
      {snaps.length > 1 && (
        <div style={{ marginTop: '0.875rem' }}>
          <Sparkline values={snaps.map(s => s.net_worth)} dates={snaps.map(s => s.date)}
            label={t('dashboard.netWorth.a11y', { count: snaps.length, start: formatCurrency(snaps[0].net_worth), end: formatCurrency(nw.net_worth) })} />
        </div>
      )}
      {total > 0 && (
        <div className="ft-nw__split">
          <div className="ft-nw__bar" role="img" aria-label={parts.map(p => `${p.label}: ${formatCurrency(p.value)}`).join(', ')}>
            {parts.filter(p => p.pct > 0).map(p => <span key={p.key} style={{ width: `${p.pct}%`, background: p.color }} />)}
          </div>
          {parts.map(p => (
            <div key={p.key} className="ft-nw__row">
              <span className="ft-nw__swatch" style={{ background: p.color }} />
              <span className="ft-nw__label">{p.label}</span>
              <span className="ft-nw__pct ft-num">{formatPercent(p.pct, 0, false)}</span>
              <span className="ft-nw__amount ft-num">{formatCurrency(p.value)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="ft-dash-note" style={{ marginTop: '0.75rem' }}>{t('dashboard.netWorth.note')}</p>
    </Card>
  )
}

// ── Alertas ───────────────────────────────────────────────
const ALERT_ICON: Record<Alert['type'], { icon: IconName; color: string }> = {
  danger: { icon: 'alertCircle', color: 'var(--red)' },
  warning: { icon: 'alert', color: 'var(--amber)' },
  info: { icon: 'info', color: 'var(--blue)' },
}

export function AlertsCard({ alerts, loading, error, onRetry }: { alerts: Alert[]; loading: boolean; error?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const order = { danger: 0, warning: 1, info: 2 }
  const sorted = [...alerts].sort((a, b) => order[a.type] - order[b.type])
  const visible = all ? sorted : sorted.slice(0, 5)
  return (
    <Card className="ft-dash-alerts" aria-busy={(loading && !alerts.length) || undefined}>
      <CardHeader title={t('dashboard.alerts.title')} action={alerts.length > 0 ? <Badge>{alerts.length}</Badge> : undefined} />
      {loading && !alerts.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}><Skeleton height={14} /><Skeleton height={14} width="80%" /></div>
      ) : error && sorted.length === 0 ? (
        <div className="ft-alerts-ok">
          <Icon name="alertCircle" size={18} style={{ color: 'var(--red)' }} />
          <div>
            <div className="ft-alerts-ok__title">{t('nav.alertsError')}</div>
            {onRetry && <button type="button" className="ft-link-btn" style={{ padding: 0, marginTop: '0.25rem' }} onClick={onRetry}>{t('nav.retry')}</button>}
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="ft-alerts-ok">
          <Icon name="checkCircle" size={18} style={{ color: 'var(--green)' }} />
          <div>
            <div className="ft-alerts-ok__title">{t('dashboard.alerts.allGood')}</div>
            <div className="ft-alerts-ok__text">{t('dashboard.alerts.allGoodText')}</div>
          </div>
        </div>
      ) : (
        <>
          <ul className="ft-alert-list">
            {visible.map((a, i) => {
              const look = ALERT_ICON[a.type] ?? ALERT_ICON.info
              const href = alertHref(a)
              const content = (
                <>
                  <Icon name={look.icon} size={16} style={{ color: look.color, marginTop: '0.125rem' }} />
                  <span>{a.message}</span>
                  {href && <Icon name="chevronRight" size={14} style={{ color: 'var(--text-hint)', marginLeft: 'auto', marginTop: '0.1875rem' }} />}
                </>
              )
              return <li key={i}>{href ? <Link to={href} className="ft-alert-link">{content}</Link> : content}</li>
            })}
          </ul>
          {sorted.length > 5 && (
            <Button variant="ghost" size="sm" block iconRight={all ? 'chevronUp' : 'chevronDown'} onClick={() => setAll(v => !v)} aria-expanded={all} style={{ marginTop: '0.5rem' }}>
              {all ? t('dashboard.alerts.showLess') : t('dashboard.alerts.showAll', { count: sorted.length })}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

// ── Orçamentos do mês ─────────────────────────────────────
export function BudgetsCard({ budgets, categories, loading }: { budgets: Budget[]; categories: Category[]; loading: boolean }) {
  const { t } = useTranslation()
  const manage = '/goals?aba=orcamentos'
  if (loading) {
    return (
      <Card className="ft-dash-budgets" aria-busy>
        <CardHeader title={t('dashboard.budgets.title')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}><Skeleton height={12} width="40%" /><Skeleton height={6} /></div>)}
        </div>
      </Card>
    )
  }
  const sorted = [...budgets].sort((a, b) => b.percent - a.percent)
  const spent = budgets.reduce((s, b) => s + b.spent, 0)
  const limit = budgets.reduce((s, b) => s + b.limit_amount, 0)
  const catById = new Map(categories.map(c => [c.id, c]))

  return (
    <Card className="ft-dash-budgets">
      <CardHeader title={t('dashboard.budgets.title')}
        subtitle={budgets.length ? <span className="ft-num">{t('dashboard.budgets.total', { spent: formatCurrency(spent), limit: formatCurrency(limit) })}</span> : undefined}
        action={budgets.length ? <CardLink to={manage}>{t('dashboard.budgets.manage')}</CardLink> : undefined} />
      {budgets.length === 0 ? (
        <EmptyState compact icon="target" title={t('dashboard.budgets.emptyTitle')} description={t('dashboard.budgets.emptyText')}
          action={<Link to={manage} className="ft-btn ft-btn--secondary ft-btn--sm">{t('dashboard.budgets.emptyAction')}</Link>} />
      ) : (
        <ul className="ft-budget-list">
          {sorted.map(b => {
            const cat = catById.get(b.category_id)
            const name = categoryLabel(cat ?? (b.category_name ? { name: b.category_name } : null), t('dashboard.recent.uncategorized'))
            const over = b.spent > b.limit_amount
            const pctColor = b.percent >= 100 ? 'var(--red)' : b.percent >= 80 ? 'var(--amber)' : 'var(--text-muted)'
            return (
              <li key={b.id}>
                <div className="ft-budget__top">
                  <span className="ft-budget__name"><span className="ft-dot" style={{ background: b.category_color || cat?.color || 'var(--chart-neutral)' }} />{name}</span>
                  <span className="ft-budget__pct ft-num" style={{ color: pctColor }}>{formatPercent(b.percent, 0, false)}</span>
                </div>
                <ProgressBar value={b.percent} tone="spending" label={name} />
                <div className="ft-budget__bottom ft-num">
                  <span>{t('dashboard.budgets.of', { spent: formatCurrency(b.spent), limit: formatCurrency(b.limit_amount) })}</span>
                  <span style={{ color: over ? 'var(--red)' : undefined }}>
                    {over ? t('dashboard.budgets.over', { value: formatCurrency(b.spent - b.limit_amount) }) : t('dashboard.budgets.left', { value: formatCurrency(b.limit_amount - b.spent) })}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Últimas transações ────────────────────────────────────
export function RecentCard({ transactions, categories, accounts }: { transactions: Transaction[]; categories: Category[]; accounts: Account[] }) {
  const { t } = useTranslation()
  const catById = new Map(categories.map(c => [c.id, c]))
  const accById = new Map(accounts.map(a => [a.id, a]))
  return (
    <Card className="ft-dash-recent">
      <CardHeader title={t('dashboard.recent.title')} action={transactions.length ? <CardLink to="/transactions">{t('dashboard.recent.viewAll')}</CardLink> : undefined} />
      {transactions.length === 0 ? (
        <EmptyState compact icon="list" title={t('dashboard.recent.emptyTitle')} description={t('dashboard.recent.emptyText')}
          action={<Link to="/transactions?acao=importar" className="ft-btn ft-btn--secondary ft-btn--sm"><Icon name="upload" size={14} />{t('dashboard.recent.emptyAction')}</Link>} />
      ) : (
        <ul className="ft-recent-list">
          {transactions.map(tx => {
            const cat = tx.category_id ? catById.get(tx.category_id) : undefined
            const transfer = tx.type === 'transfer'
            const label = transfer ? t('dashboard.recent.transfer') : categoryLabel(cat, t('dashboard.recent.uncategorized'))
            const acc = accById.get(tx.account_id)
            return (
              <li key={tx.id} className="ft-row">
                <span className="ft-recent__icon" style={{ '--cat': transfer ? 'var(--chart-neutral)' : cat?.color || 'var(--chart-neutral)' } as React.CSSProperties}>
                  {transfer ? <Icon name="transfer" size={16} /> : <CategoryIcon name={cat?.icon} size={16} />}
                </span>
                <div className="ft-recent__main">
                  <div className="ft-recent__desc">
                    {tx.description}
                    {tx.installment_total ? (
                      <span className="ft-recent__inst ft-num">
                        <span aria-hidden>{tx.installment_current}/{tx.installment_total}</span>
                        <span className="ft-sr-only">{t('dashboard.recent.installment', { current: tx.installment_current, total: tx.installment_total })}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="ft-recent__meta">
                    <span>{label}</span>
                    <span aria-hidden className="ft-recent__sep">·</span>
                    <span>{dayMonth(tx.transaction_date)}</span>
                    {acc && <span className="ft-recent__acc"><span aria-hidden className="ft-recent__sep">·</span>{acc.name}</span>}
                  </div>
                </div>
                <span className="ft-recent__amount ft-num" style={{ color: transfer ? 'var(--text-muted)' : tx.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }}>
                  {formatSignedCurrency(tx.amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Começo guiado (conta nova) ────────────────────────────
export function Onboarding({ hasAccount, hasTransactions, hasBudget }: { hasAccount: boolean; hasTransactions: boolean; hasBudget: boolean }) {
  const { t } = useTranslation()
  const steps = [
    { key: 'account', done: hasAccount, to: '/profile?tab=accounts', icon: 'bank' as IconName },
    { key: 'import', done: hasTransactions, to: '/transactions?acao=importar', icon: 'upload' as IconName },
    { key: 'budget', done: hasBudget, to: '/goals?aba=orcamentos', icon: 'target' as IconName },
  ]
  const doneCount = steps.filter(s => s.done).length
  const next = steps.findIndex(s => !s.done)
  const previews: { key: string; icon: IconName }[] = [
    { key: 'monthly', icon: 'chart' },
    { key: 'cashflow', icon: 'calendar' },
    { key: 'summary', icon: 'fileText' },
  ]
  return (
    <>
      <Card padding="lg" className="ft-onboarding">
        <div className="ft-onboarding__intro">
          <h2>{t('dashboard.onboarding.title')}</h2>
          <p>{t('dashboard.onboarding.text')}</p>
          <div className="ft-onboarding__progress">
            <ProgressBar value={(doneCount / steps.length) * 100} tone="accent" height={4} label={t('dashboard.onboarding.progress', { done: doneCount, total: steps.length })} />
            <span className="ft-num">{t('dashboard.onboarding.progress', { done: doneCount, total: steps.length })}</span>
          </div>
        </div>
        <ol className="ft-steps">
          {steps.map((s, i) => (
            <li key={s.key} className={`ft-step${s.done ? ' ft-step--done' : ''}${i === next ? ' ft-step--next' : ''}`}>
              <span className="ft-step__num" aria-hidden>{s.done ? <Icon name="check" size={15} strokeWidth={2.25} /> : i + 1}</span>
              <div className="ft-step__body">
                <div className="ft-step__title">{t(`dashboard.onboarding.${s.key}.title`)}</div>
                <p className="ft-step__text">{t(`dashboard.onboarding.${s.key}.text`)}</p>
              </div>
              {s.done ? (
                <span className="ft-step__done">{t('dashboard.onboarding.done')}</span>
              ) : (
                <Link to={s.to} className={`ft-btn ft-btn--sm ${i === next ? 'ft-btn--primary' : 'ft-btn--secondary'} ft-step__action`}>
                  <Icon name={s.icon} size={14} />{t(`dashboard.onboarding.${s.key}.action`)}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <section className="ft-preview" aria-labelledby="ft-preview-title">
        <h2 id="ft-preview-title" className="ft-preview__title">{t('dashboard.onboarding.preview')}</h2>
        <ul className="ft-preview__grid">
          {previews.map(p => (
            <li key={p.key} className="ft-preview__item">
              <span className="ft-preview__icon"><Icon name={p.icon} size={16} /></span>
              <div>
                <div className="ft-preview__name">{t(`dashboard.onboarding.previews.${p.key}.title`)}</div>
                <p className="ft-preview__text">{t(`dashboard.onboarding.previews.${p.key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

// ── Esqueleto (primeira carga), no mesmo desenho da grade ──
function SkeletonCard({ className, chart = 0, lines = 0 }: { className: string; chart?: number; lines?: number }) {
  return (
    <Card className={className}>
      <Skeleton height={14} width="38%" />
      <Skeleton height={11} width="24%" style={{ marginTop: '0.5rem' }} />
      {chart > 0 && <Skeleton height={chart} radius="var(--radius-md)" style={{ marginTop: '1.25rem' }} />}
      {lines > 0 && (
        <div className="ft-insight__skeleton" style={{ marginTop: '1.25rem' }}>
          {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={12} width={i === lines - 1 ? '60%' : `${96 - i * 4}%`} />)}
        </div>
      )}
    </Card>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="ft-dash-grid" aria-busy="true">
      <div className="ft-dash-kpis">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="ft-kpi"><Skeleton height={12} width="45%" /><Skeleton height={26} width="70%" style={{ margin: '0.625rem 0' }} /><Skeleton height={11} width="55%" /></Card>
        ))}
      </div>
      <SkeletonCard className="ft-dash-monthly" chart={236} />
      <SkeletonCard className="ft-dash-networth" chart={150} />
      <SkeletonCard className="ft-dash-cashflow" chart={200} />
      <div className="ft-dash-side">
        <SkeletonCard className="ft-dash-insight" lines={5} />
        <SkeletonCard className="ft-dash-alerts" lines={3} />
      </div>
    </div>
  )
}
