import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons'
import { Button, Card, EmptyState, Page, PageHeader } from '../components/ui'
import { useAlertsStore, useToastStore } from '../store'
import { transactionsService, accountsService, categoriesService, summaryService, insightsService, cashflowService, budgetsService, netWorthService } from '../services'
import { formatCurrency, formatCurrencyCompact, formatMonth, formatPercent, getCurrentMonthRange } from '../utils'
import type { Transaction, Account, Category, CashflowProjection, Budget, NetWorth, InsightResponse } from '../types'
import { AlertsCard, BudgetsCard, CashflowCard, DashboardSkeleton, InsightCard, KpiTile, MonthlyCard, NetWorthCard, Onboarding, RecentCard, type Delta } from './dashboard/cards'
import { dailyProjection, lastMonths, monthKey, pctChange, type MonthTotals } from './dashboard/data'
import './dashboard/dashboard.css'

const isFlow = (tx: Transaction) => tx.type !== 'transfer'

// Valores muito altos viram "R$ 1,2 mi" para caber no cartão
const kpiMoney = (v: number) => (Math.abs(v) >= 100_000 ? formatCurrencyCompact(v) : formatCurrency(v))

export function Dashboard() {
  const { t } = useTranslation()
  const [now] = useState(() => new Date())
  const { start_date, end_date } = getCurrentMonthRange()
  const currentMonth = monthKey(now)
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [summary, setSummary] = useState<MonthTotals[]>([])
  const [cashflow, setCashflow] = useState<CashflowProjection | null>(null)
  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [netWorth, setNetWorth] = useState<NetWorth | null | false>(null)
  const [insight, setInsight] = useState<InsightResponse | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState(false)
  const { alerts, loading: alertsLoading, error: alertsError, load: reloadAlerts } = useAlertsStore()

  useEffect(() => {
    let alive = true
    setStatus('loading')
    Promise.all([
      transactionsService.list({ start_date, end_date, page_size: 200 }),
      accountsService.list(),
      categoriesService.list(),
      summaryService.monthly(6),
    ]).then(([txRes, accRes, catRes, months]) => {
      if (!alive) return
      setTransactions(txRes.transactions || [])
      setAccounts(accRes.accounts || [])
      setCategories(catRes.categories || [])
      setSummary(months || [])
      setStatus('ready')
    }).catch(() => { if (alive) setStatus('error') })
    // Cartões secundários carregam em paralelo, cada um com seu esqueleto
    cashflowService.projection().then(r => { if (alive) setCashflow(r) }).catch(() => { if (alive) setCashflow({ days: [], starting_balance: 0, projected_balance: 0, has_negative_days: false }) })
    budgetsService.list(currentMonth).then(r => { if (alive) setBudgets(r.budgets || []) }).catch(() => { if (alive) setBudgets([]) })
    netWorthService.get().then(r => { if (alive) setNetWorth(r) }).catch(() => { if (alive) setNetWorth(false) })
    return () => { alive = false }
  }, [attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const months6 = useMemo(() => lastMonths(summary, 6, now), [summary, now])
  const hasHistory = summary.some(m => m.income || m.expense) || transactions.length > 0
  const isNew = status === 'ready' && !hasHistory

  const { toast } = useToastStore()
  const hadInsight = useRef(false)
  useEffect(() => { hadInsight.current = !!insight }, [insight])

  const loadInsight = useCallback(async () => {
    setInsightLoading(true)
    setInsightError(false)
    try {
      setInsight(await insightsService.generate(start_date, end_date))
    } catch {
      setInsightError(true)
      // Se já havia um resumo na tela, ele fica e o aviso vem num toast
      if (hadInsight.current) toast({ message: t('dashboard.insight.refreshError'), variant: 'error' })
    } finally {
      setInsightLoading(false)
    }
  }, [start_date, end_date, toast, t])

  useEffect(() => {
    if (status === 'ready' && hasHistory) loadInsight()
  }, [status, hasHistory, loadInsight])

  const points = useMemo(() => (cashflow ? dailyProjection(cashflow, now) : []), [cashflow, now])

  // ── Métricas do mês ─────────────────────────────────────
  const flows = transactions.filter(isFlow)
  const fromSummary = summary.find(m => m.month === currentMonth)
  const income = fromSummary ? fromSummary.income : flows.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0)
  const expenses = fromSummary ? fromSummary.expense : Math.abs(flows.filter(tx => tx.amount < 0).reduce((s, tx) => s + tx.amount, 0))
  const prev = months6[months6.length - 2]
  const net = income - expenses
  const rate = income > 0 ? (net / income) * 100 : null
  const balance = accounts.reduce((s, a) => s + a.balance, 0)
  const prevShort = formatMonth(prevMonth, 'short')
  const vsPrev = t('dashboard.kpi.vsMonth', { month: prevShort })

  const delta = (cur: number, before: number | undefined, upIsGood: boolean, ref = vsPrev): Delta | null => {
    if (before === undefined) return null
    const pct = pctChange(cur, before)
    if (pct === null) return null
    const dir = Math.abs(pct) < 0.05 ? 'flat' : pct > 0 ? 'up' : 'down'
    const tone = dir === 'flat' ? 'neutral' : (dir === 'up') === upIsGood ? 'good' : 'bad'
    return { text: formatPercent(pct, 1), dir, tone, ref }
  }
  const prevNet = prev && (prev.income || prev.expense) ? prev.income - prev.expense : undefined
  const netDelta = delta(net, prevNet, true)
  const prevSnap = netWorth ? netWorth.snapshots.find(s => s.date.startsWith(prevMonth)) : undefined
  const balanceDelta = prevSnap ? delta(balance, prevSnap.total_accounts, true, t('dashboard.kpi.sinceMonthEnd', { month: prevShort })) : null

  const recent = [...transactions]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 7)

  const actions = status === 'ready' && hasHistory ? (
    <>
      <Link to="/transactions?acao=importar" className="ft-btn ft-btn--secondary ft-btn--md ft-dash-head-btn"><Icon name="upload" size={16} />{t('dashboard.actions.import')}</Link>
      <Link to="/transactions?acao=nova" className="ft-btn ft-btn--primary ft-btn--md ft-dash-head-btn"><Icon name="plus" size={16} />{t('dashboard.actions.newTransaction')}</Link>
    </>
  ) : undefined
  const header = <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle', { month: formatMonth(currentMonth, 'long') })} actions={actions} />

  if (status === 'loading') {
    return <Page>{header}<div className="ft-dash"><DashboardSkeleton /></div></Page>
  }

  if (status === 'error') {
    return (
      <Page>
        {header}
        <Card>
          <EmptyState icon="alertCircle" title={t('dashboard.error.title')} description={t('dashboard.error.text')}
            action={<Button icon="refresh" onClick={() => setAttempt(a => a + 1)}>{t('dashboard.error.retry')}</Button>} />
        </Card>
      </Page>
    )
  }

  if (isNew) {
    return (
      <Page>
        {header}
        <div className="ft-dash">
          <Onboarding hasAccount={accounts.length > 0} hasTransactions={false} hasBudget={!!budgets?.length} />
        </div>
      </Page>
    )
  }

  return (
    <Page>
      {header}
      <div className="ft-dash">
        <div className="ft-dash-grid">
          <section className="ft-dash-kpis" aria-label={t('dashboard.kpi.label')}>
            <KpiTile label={t('dashboard.kpi.balance')} value={kpiMoney(balance)} negative={balance < 0} delta={balanceDelta}
              foot={<span className="ft-kpi__ref">{accounts.length ? t('dashboard.kpi.accounts', { count: accounts.length }) : t('dashboard.kpi.noAccounts')}</span>} />
            <KpiTile label={t('dashboard.kpi.income')} value={kpiMoney(income)} delta={delta(income, prev?.income || undefined, true)}
              foot={<span className="ft-kpi__ref">{t('dashboard.kpi.noComparison', { month: prevShort })}</span>} />
            <KpiTile label={t('dashboard.kpi.expenses')} value={kpiMoney(expenses)} delta={delta(expenses, prev?.expense || undefined, false)}
              foot={<span className="ft-kpi__ref">{t('dashboard.kpi.noComparison', { month: prevShort })}</span>} />
            <KpiTile label={t('dashboard.kpi.net')} value={kpiMoney(net)} negative={net < 0} delta={netDelta}
              foot={rate === null ? <span className="ft-kpi__ref">{t('dashboard.kpi.noIncome')}</span> : undefined}
              extra={rate !== null
                ? <span className="ft-kpi__ref">{t(netDelta ? 'dashboard.kpi.savedShort' : 'dashboard.kpi.savingsRate')} <strong className="ft-num" style={{ color: rate < 0 ? 'var(--red)' : 'var(--text-secondary)' }}>{formatPercent(rate, 0, false)}</strong></span>
                : undefined} />
          </section>

          <MonthlyCard data={months6} currentMonth={currentMonth} />
          {netWorth !== false && <NetWorthCard nw={netWorth} />}
          <CashflowCard cashflow={cashflow} points={points} />
          <div className="ft-dash-side">
            <InsightCard insight={insight} loading={insightLoading} error={insightError} onRefresh={loadInsight} />
            <AlertsCard alerts={alerts} loading={alertsLoading} error={alertsError} onRetry={reloadAlerts} />
          </div>
          <RecentCard transactions={recent} categories={categories} accounts={accounts} />
          <BudgetsCard budgets={budgets ?? []} categories={categories} loading={budgets === null} />
        </div>
      </div>
    </Page>
  )
}
