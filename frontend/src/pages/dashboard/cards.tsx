// Cartões do painel
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Money, ProgressBar, Skeleton } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { alertHref, categoryLabel, currentLocale, formatCurrency, formatPercent, formatRelative } from '../../utils'
import type { Account, Alert, Budget, Category, CashflowProjection, InsightResponse, NetWorth, Transaction } from '../../types'
import { CashflowChart, Sparkline } from './charts'
import { CategoryIcon } from './CategoryIcon'
import { categoryColor } from '../../lib/categoryColor'
import { useAuthStore } from '../../store'
import { shownCategory } from '../../lib/review'
import { billsByCategory, budgetState, budgetStatusText, monthDays, BUDGET_COLOR, type BudgetStatus } from '../../lib/pace'
import { DELTA_COLOR, dayMonth, insightBlocks, splitHighlights, type Delta, type ProjectionPoint } from './data'
import { variationDir, variationTone, type VariationDir, type VariationTone } from '../../lib/variation'

// Link de texto do cabeçalho dos cartões ("Ver todas", "Gerenciar")
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="ft-dash-link">{children}</Link>
}

// ── Variação contra o período anterior (makeDelta em data.ts) ──
// Seta e porcentagem com o valor em dinheiro junto ("+R$ 78 (+2,0%)").
export type { Delta }
const DELTA_ICON: Record<VariationDir, IconName> = { up: 'arrowUpRight', down: 'arrowDownRight', flat: 'minus' }

// Valor arredondado ao real: na variação os centavos só pesam
const wholeSigned = (v: number) => new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero', maximumFractionDigits: 0 }).format(Math.round(v))

// O valor com sinal e a porcentagem não quebram por dentro ("-" sozinho numa linha, no celular);
// quando falta espaço, a porcentagem desce inteira para a linha seguinte
const NOWRAP = { whiteSpace: 'nowrap' } as const

export function DeltaChip({ d, className = 'ft-delta' }: { d: Delta; className?: string }) {
  return (
    <span className={`${className} ${className}--${d.tone}`} style={{ color: DELTA_COLOR[d.tone], flexWrap: 'wrap' }}>
      <Icon name={DELTA_ICON[d.dir]} size={12} strokeWidth={2.25} />
      {d.amount !== undefined && Math.round(d.amount) !== 0
        ? <><span className="ft-hideable" style={NOWRAP}>{wholeSigned(d.amount)}</span> <span style={NOWRAP}>({d.text})</span></>
        : <span style={NOWRAP}>{d.text}</span>}
    </span>
  )
}

// `foot` aparece quando não há comparação; `extra` aparece sempre, no fim da linha
export function KpiTile({ label, value, delta, foot, extra, negative }: { label: string; value: string; delta?: Delta | null; foot?: ReactNode; extra?: ReactNode; negative?: boolean }) {
  return (
    <Card className="ft-kpi">
      <span className="ft-kpi__label">{label}</span>
      <span className="ft-kpi__value" style={negative ? { color: 'var(--red)' } : undefined}>{value}</span>
      <span className="ft-kpi__foot">
        {delta && <DeltaChip d={delta} className="ft-kpi__delta ft-num" />}
        {delta && <span className="ft-kpi__ref">{delta.ref}</span>}
        {!delta && foot}
        {extra && <span className="ft-kpi__extra">{extra}</span>}
      </span>
    </Card>
  )
}

// ── Resumo do mês (IA) ────────────────────────────────────
export function InsightCard({ insight, loading, error, onRefresh, stale }: { insight: InsightResponse | null; loading: boolean; error: boolean; onRefresh: () => void; stale?: boolean }) {
  const { t } = useTranslation()
  // Parágrafos e listas na ordem em que vieram (itens seguidos viram uma lista)
  const groups: { kind: 'p' | 'h' | 'ul'; texts: string[] }[] = []
  for (const b of insight ? insightBlocks(insight.text) : []) {
    const last = groups[groups.length - 1]
    if (b.kind === 'li' && last?.kind === 'ul') last.texts.push(b.text)
    else groups.push({ kind: b.kind === 'li' ? 'ul' : b.kind, texts: [b.text] })
  }
  const render = (text: string) => splitHighlights(text).map((p, i) => p.strong ? <strong key={i} className="ft-num">{p.text}</strong> : <span key={i}>{p.text}</span>)
  // Quem escreveu o texto: na demonstração é um exemplo montado no navegador; sem chave da Anthropic,
  // a API devolve um texto pronto ("template"); só o "ai" é do Claude
  const isDemo = useAuthStore(s => s.isDemo)
  const meta = isDemo || insight?.source === 'sample' ? t('dashboard.insight.sample')
    : !insight || loading ? t('dashboard.insight.byAi')
    : t(insight.source === 'template' ? 'dashboard.insight.template' : 'dashboard.insight.generated', { when: formatRelative(insight.generated_at) })

  return (
    <Card className="ft-dash-insight" aria-busy={loading || undefined}>
      <CardHeader
        title={t('dashboard.insight.title')}
        subtitle={
          <span className="ft-insight__meta">
            {meta}
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
          {/* Resumo guardado com números que já mudaram (ex.: importou um extrato depois) */}
          {stale && !loading && (
            <p className="ft-insight__stale">
              <Icon name="info" size={14} />{t('dashboard.insight.stale')}
              <button type="button" className="ft-insight__stale-btn" onClick={onRefresh}>{t('dashboard.insight.staleAction')}</button>
            </p>
          )}
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
  // Mudança em 30 dias: verde ou vermelho só a partir de ±5% do saldo de hoje; saldo final negativo é sempre vermelho
  const changeTone: VariationTone = end < 0 ? 'bad' : start !== 0 ? variationTone((change / Math.abs(start)) * 100, true) : 'neutral'

  return (
    <Card className="ft-dash-cashflow">
      <CardHeader title={t('dashboard.cashflow.title')} subtitle={t('dashboard.cashflow.subtitle')}
        action={cashflow.has_negative_days ? <Badge variant="red" icon="alert">{t('dashboard.cashflow.negative')}</Badge> : undefined} />
      {events.length > 0 && <dl className="ft-cash-stats">
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.today')}</dt>
          <dd><Money value={start} className="ft-cash-stat__value" style={tone(start)} /></dd>
        </div>
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.lowest')}</dt>
          <dd>
            <Money value={low?.balance ?? start} className="ft-cash-stat__value" style={tone(low?.balance ?? start)} />
            <span className="ft-cash-stat__sub">{lowWhen}</span>
          </dd>
        </div>
        <div className="ft-cash-stat">
          <dt>{t('dashboard.cashflow.in30')}</dt>
          <dd>
            <Money value={end} className="ft-cash-stat__value" style={tone(end)} />
            {change !== 0 && <Money value={change} signed className="ft-cash-stat__sub" style={{ color: DELTA_COLOR[changeTone] }} />}
          </dd>
        </div>
      </dl>}
      {events.length === 0 ? (
        <EmptyState compact title={t('dashboard.cashflow.emptyTitle')} description={t('dashboard.cashflow.emptyText')} />
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
                  <Money value={e.amount} signed className="ft-upcoming__amount" style={{ color: e.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }} />
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
  // Mesma regra das variações do hero: cor de estado só a partir de ±5%
  const nwPct = first && first.net_worth !== 0 ? (change / Math.abs(first.net_worth)) * 100 : 0
  const nwTone: VariationTone = nw.net_worth < 0 ? 'bad' : variationTone(nwPct, true)
  const nwDir = first && first.net_worth !== 0 ? variationDir(nwPct) : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const total = Math.max(0, nw.total_accounts) + Math.max(0, nw.total_investments)
  const accPct = total ? (Math.max(0, nw.total_accounts) / total) * 100 : 0
  const invPct = total ? 100 - accPct : 0
  const parts = [
    { key: 'accounts', label: t('dashboard.netWorth.accounts'), value: nw.total_accounts, pct: accPct, color: 'var(--chart-neutral)' },
    { key: 'investments', label: t('dashboard.netWorth.investments'), value: nw.total_investments, pct: invPct, color: 'var(--accent)' },
  ]

  return (
    <Card className="ft-dash-networth">
      <CardHeader title={t('dashboard.netWorth.title')} action={<CardLink to="/investments">{t('dashboard.netWorth.link')}</CardLink>} />
      {/* No computador vira uma faixa: valor | evolução | divisão entre contas e investimentos */}
      <div className="ft-nw__body">
        <div className="ft-nw__summary">
          <Money value={nw.net_worth} size="kpi" className="ft-nw__value" style={{ color: nw.net_worth < 0 ? 'var(--red)' : undefined }} />
          {first && snaps.length > 1 && (
            <div className="ft-nw__change ft-num" style={{ color: DELTA_COLOR[nwTone] }}>
              <Icon name={nwDir === 'up' ? 'arrowUpRight' : nwDir === 'down' ? 'arrowDownRight' : 'minus'} size={13} strokeWidth={2} />
              <Money value={change} signed />
              {first.net_worth > 0 && <span> ({formatPercent(nwPct, 1)})</span>}
              <span className="ft-nw__since">{t('dashboard.netWorth.since', { count: snaps.length })}</span>
            </div>
          )}
        </div>
        {snaps.length > 1 && (
          <div className="ft-nw__chart">
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
                <Money value={p.value} className="ft-nw__amount" />
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="ft-dash-note" style={{ marginTop: '0.75rem' }}>{t('dashboard.netWorth.note')}</p>
    </Card>
  )
}

// ── Alertas ───────────────────────────────────────────────
// Agrupados por assunto e sempre com o que fazer: "2 orçamentos acima do ritmo: Lazer e
// Transporte → Ver orçamentos". O estado vem da mesma regra das barras (lib/pace.ts).
const ALERT_ICON: Record<Alert['type'], { icon: IconName; color: string }> = {
  danger: { icon: 'alertCircle', color: 'var(--red)' },
  warning: { icon: 'alert', color: 'var(--amber)' },
  info: { icon: 'info', color: 'var(--blue)' },
}

type AlertItem = { key: string; type: Alert['type']; text: ReactNode; action?: { to: string; label: string } }

function groupAlerts(alerts: Alert[], t: (k: string, o?: Record<string, unknown>) => string): AlertItem[] {
  const list = (names: string[]) => new Intl.ListFormat(currentLocale(), { type: 'conjunction' }).format(names)
  const names = (as: Alert[]) => as.map(a => a.subject).filter((n): n is string => !!n)
  const items: AlertItem[] = []
  const budgets = { to: '/goals?aba=orcamentos', label: t('dashboard.alerts.action.budgets') }
  for (const [type, key] of [['danger', 'budgetOverGroup'], ['warning', 'budgetWarnGroup']] as const) {
    const group = alerts.filter(a => a.category === 'budget' && a.type === type)
    if (group.length === 1) items.push({ key: `budget-${type}`, type, text: group[0].message, action: budgets })
    else if (group.length > 1) items.push({ key: `budget-${type}`, type, text: t(`dashboard.alerts.${key}`, { count: group.length, names: list(names(group)) }), action: budgets })
  }
  alerts.forEach((a, i) => {
    if (a.category === 'goal') items.push({ key: `goal-${i}`, type: a.type, text: a.message, action: { to: '/goals', label: t('dashboard.alerts.action.goals') } })
    if (a.category === 'account') items.push({ key: `acc-${i}`, type: a.type, text: a.message, action: { to: '/profile?tab=accounts', label: t('dashboard.alerts.action.accounts') } })
    if (a.category === 'uncategorized') items.push({ key: 'uncat', type: a.type, text: a.message, action: { to: alertHref(a) ?? '/transactions', label: t('dashboard.alerts.action.categorize') } })
  })
  // Recorrentes: uma linha só; cada nome leva ao histórico dela
  const recurring = alerts.filter(a => a.category === 'recurring')
  if (recurring.length === 1) {
    items.push({ key: 'rec', type: 'info', text: recurring[0].message, action: { to: alertHref(recurring[0]) ?? '/transactions', label: t('dashboard.alerts.action.history') } })
  } else if (recurring.length > 1) {
    const links = recurring.map((a, i) => (
      <span key={i}>{i > 0 && (i === recurring.length - 1 ? ` ${t('dashboard.alerts.and')} ` : ', ')}
        {a.subject ? <Link to={alertHref(a) ?? '/transactions'} className="ft-alert__name">{a.subject}</Link> : a.message}
      </span>
    ))
    items.push({ key: 'rec', type: 'info', text: <>{t('dashboard.alerts.recurringLead', { count: recurring.length })} {links}</> })
  }
  const order = { danger: 0, warning: 1, info: 2 }
  return items.sort((a, b) => order[a.type] - order[b.type])
}

export function AlertsCard({ alerts, loading, error, onRetry }: { alerts: Alert[]; loading: boolean; error?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const sorted = groupAlerts(alerts, t)
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
            {onRetry && <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry} style={{ marginTop: '0.5rem' }}>{t('nav.retry')}</Button>}
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
            {visible.map(a => {
              const look = ALERT_ICON[a.type] ?? ALERT_ICON.info
              return (
                <li key={a.key} className="ft-alert">
                  <Icon name={look.icon} size={16} style={{ color: look.color, marginTop: '0.1875rem', flexShrink: 0 }} />
                  <div className="ft-alert__body">
                    <span className="ft-alert__text">{a.text}</span>
                    {a.action && <Link to={a.action.to} className="ft-alert__action">{a.action.label}<Icon name="chevronRight" size={13} /></Link>}
                  </div>
                </li>
              )
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
export function BudgetsCard({ budgets, categories, loading, previousMonth, monthKey, now }: { budgets: Budget[]; categories: Category[]; loading: boolean; previousMonth: Transaction[] | null; monthKey: string; now: Date }) {
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
  const { dim, day } = monthDays(monthKey, now)
  const bills = billsByCategory(previousMonth ?? [])
  // As 4 que mais pedem atenção: estouradas, acima do ritmo, no ritmo e, por último, as fixas já pagas
  const rank: Record<BudgetStatus, number> = { over: 0, warn: 1, ok: 2, paid: 3 }
  const withPace = budgets.map(b => ({ b, ...budgetState(b.spent, b.limit_amount, bills.get(b.category_id) ?? [], day, dim) }))
    .sort((x, y) => rank[x.status] - rank[y.status] || x.diff - y.diff)
  const sorted = withPace.slice(0, 4)
  const spent = budgets.reduce((s, b) => s + b.spent, 0)
  const limit = budgets.reduce((s, b) => s + b.limit_amount, 0)
  const catById = new Map(categories.map(c => [c.id, c]))

  return (
    <Card className="ft-dash-budgets">
      <CardHeader title={t('dashboard.budgets.title')}
        subtitle={budgets.length ? <span className="ft-num">{t('dashboard.budgets.total', { spent: formatCurrency(spent), limit: formatCurrency(limit) })}</span> : undefined}
        action={budgets.length ? <CardLink to={manage}>{t('dashboard.budgets.manage')}</CardLink> : undefined} />
      {budgets.length === 0 ? (
        <EmptyState compact title={t('dashboard.budgets.emptyTitle')} description={t('dashboard.budgets.emptyText')}
          action={<Link to={manage} className="ft-btn ft-btn--secondary ft-btn--sm">{t('dashboard.budgets.emptyAction')}</Link>} />
      ) : (
        <ul className="ft-budget-list">
          {sorted.map(state => {
            const { b, expected, status, left } = state
            const cat = catById.get(b.category_id)
            const name = categoryLabel(cat ?? (b.category_name ? { name: b.category_name } : null), t('dashboard.recent.uncategorized'))
            const statusText = budgetStatusText(state, t, formatCurrency)
            return (
              <li key={b.id}>
                <div className="ft-budget__top">
                  <span className="ft-budget__name"><span className="ft-dot" style={{ background: cat ? categoryColor(cat) : b.category_color || 'var(--chart-neutral)' }} />{name}</span>
                  <span className={`ft-budget__status ft-budget__status--${status}`}>{statusText}</span>
                </div>
                <ProgressBar value={b.percent} label={`${name}: ${statusText}`} color={BUDGET_COLOR[status]} pace={status !== 'paid' && b.limit_amount > 0 ? (expected / b.limit_amount) * 100 : undefined} />
                <div className="ft-budget__bottom ft-num">
                  <span>{t('dashboard.budgets.of', { spent: formatCurrency(b.spent), limit: formatCurrency(b.limit_amount) })}</span>
                  {left >= 0 && <span>{t('dashboard.budgets.left', { value: formatCurrency(left) })}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {budgets.length > sorted.length && <p className="ft-dash-note"><Link to="/goals?aba=orcamentos" className="ft-dash-link">{t('dashboard.budgets.more', { count: budgets.length - sorted.length })}</Link></p>}
    </Card>
  )
}

// ── Últimas transações ────────────────────────────────────
export function RecentCard({ transactions, categories, accounts }: { transactions: Transaction[]; categories: Category[]; accounts: Account[] }) {
  const { t } = useTranslation()
  const accById = new Map(accounts.map(a => [a.id, a]))
  return (
    <Card className="ft-dash-recent">
      <CardHeader title={t('dashboard.recent.title')} action={transactions.length ? <CardLink to="/transactions">{t('dashboard.recent.viewAll')}</CardLink> : undefined} />
      {transactions.length === 0 ? (
        <EmptyState compact title={t('dashboard.recent.emptyTitle')} description={t('dashboard.recent.emptyText')}
          action={<Link to="/transactions?acao=importar" className="ft-btn ft-btn--secondary ft-btn--sm"><Icon name="upload" size={14} />{t('dashboard.recent.emptyAction')}</Link>} />
      ) : (
        <ul className="ft-recent-list">
          {transactions.map(tx => {
            // Como na lista de Transações: o "Outros" que a IA deu por falta de opção aparece sem categoria
            const cat = shownCategory(tx, categories)
            const transfer = tx.type === 'transfer'
            const label = transfer ? t('dashboard.recent.transfer') : categoryLabel(cat, t('dashboard.recent.uncategorized'))
            const acc = accById.get(tx.account_id)
            return (
              <li key={tx.id} className="ft-row">
                <span className="ft-recent__icon" style={{ '--cat': transfer || !cat ? 'var(--chart-neutral)' : categoryColor(cat) } as React.CSSProperties}>
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
                    <span className={`ft-catpill${!cat && !transfer ? ' ft-catpill--none' : ''}`} style={{ '--c': transfer || !cat ? 'var(--chart-neutral)' : categoryColor(cat) } as React.CSSProperties}>{label}</span>
                    <span>{dayMonth(tx.transaction_date)}</span>
                    {acc && <span className="ft-recent__acc"><span aria-hidden className="ft-recent__sep">·</span>{acc.name}</span>}
                  </div>
                </div>
                <Money value={tx.amount} signed className="ft-recent__amount" style={{ color: transfer ? 'var(--text-muted)' : tx.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Começo guiado (conta nova) ────────────────────────────
// Silhueta do fluxo do hero, esmaecida: antecipa o primeiro bloco do painel sem inventar números
const SIL = { W: 320, H: 160, GAP: 7, NX: 312 }
const SIL_BANDS = (() => {
  const nodes = [46, 22, 14, 10, 34]
  const total = nodes.reduce((s, v) => s + v, 0)
  const usable = SIL.H - SIL.GAP * (nodes.length - 1)
  const out: { ly: number; lh: number; ry: number; h: number }[] = []
  // À esquerda a barra do que entrou fica mais curta e centrada: as faixas se abrem em leque, como no hero
  const LEFT_H = SIL.H * 0.62
  let ry = 0, ly = (SIL.H - LEFT_H) / 2
  for (const v of nodes) {
    const h = (v / total) * usable, lh = (v / total) * LEFT_H
    out.push({ ly, lh, ry, h })
    ry += h + SIL.GAP; ly += lh
  }
  return out
})()
const silRibbon = ({ ly, lh, ry, h }: typeof SIL_BANDS[number]) => {
  const mid = (6 + SIL.NX) / 2
  return `M6,${ly} C${mid},${ly} ${mid},${ry} ${SIL.NX},${ry} L${SIL.NX},${ry + h} C${mid},${ry + h} ${mid},${ly + lh} 6,${ly + lh} Z`
}
function FlowSilhouette() {
  const { W, H, NX } = SIL
  return (
    <svg className="ft-preview__sil" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <rect x={0} y={H * 0.19} width={6} height={H * 0.62} rx={3} className="ft-preview__sil-node" />
      {SIL_BANDS.map((b, i) => (
        <g key={i}>
          <path d={silRibbon(b)} className="ft-preview__sil-band" />
          <rect x={NX} y={b.ry} width={6} height={b.h} rx={3} className="ft-preview__sil-node" />
        </g>
      ))}
    </svg>
  )
}

export function Onboarding({ hasAccount, hasTransactions, hasBudget }: { hasAccount: boolean; hasTransactions: boolean; hasBudget: boolean }) {
  const { t } = useTranslation()
  const steps = [
    { key: 'account', done: hasAccount, to: '/profile?tab=accounts', icon: 'bank' as IconName },
    { key: 'import', done: hasTransactions, to: '/transactions?acao=importar', icon: 'upload' as IconName },
    { key: 'budget', done: hasBudget, to: '/goals?aba=orcamentos', icon: 'target' as IconName },
  ]
  const doneCount = steps.filter(s => s.done).length
  const next = steps.findIndex(s => !s.done)
  // O que o painel preenchido mostra, na ordem da tela (sem ícones: a silhueta do fluxo já ilustra)
  const previews = ['flow', 'pace', 'cashflow']
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
        <div className="ft-preview__body">
          <FlowSilhouette />
          <ul className="ft-preview__list">
            {previews.map(key => (
              <li key={key} className="ft-preview__item">
                <div className="ft-preview__name">{t(`dashboard.onboarding.previews.${key}.title`)}</div>
                <p className="ft-preview__text">{t(`dashboard.onboarding.previews.${key}.text`)}</p>
              </li>
            ))}
          </ul>
        </div>
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
  // Mesma grade da tela pronta (hero com saldo e fluxo, duas colunas), para o carregamento antecipar o layout
  return (
    <div className="ft-dash-grid" aria-busy="true">
      <section className="flow ft-dash-skel" aria-hidden>
        <div className="flow__head">
          <Skeleton height={14} width="45%" />
          <div className="ft-dash-skel__balance"><Skeleton height={12} width="35%" /><Skeleton height={44} width="80%" /><Skeleton height={12} width="40%" /></div>
          {[0, 1, 2].map(i => <div key={i} className="ft-dash-skel__stat"><Skeleton height={12} width="30%" /><Skeleton height={18} width="38%" /></div>)}
        </div>
        <Skeleton height={300} radius="var(--radius-md)" />
      </section>
      <div className="ft-dash-col ft-dash-col--main">
        <SkeletonCard className="ft-dash-pace" chart={180} />
        <SkeletonCard className="ft-dash-recent" lines={5} />
      </div>
      <div className="ft-dash-col ft-dash-col--side">
        <SkeletonCard className="ft-dash-alerts" lines={2} />
        <SkeletonCard className="ft-dash-budgets" lines={4} />
        <SkeletonCard className="ft-dash-insight" lines={5} />
      </div>
    </div>
  )
}
