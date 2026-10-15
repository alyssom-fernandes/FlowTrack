import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons'
import { Button, Card, EmptyState, Page, PageHeader } from '../components/ui'
import { useAlertsStore, useToastStore } from '../store'
import { transactionsService, accountsService, categoriesService, summaryService, insightsService, cashflowService, budgetsService, netWorthService } from '../services'
import { formatMonth, formatPercent, getCurrentMonthRange, toISODate } from '../utils'
import type { Transaction, Account, Category, CashflowProjection, Budget, NetWorth, InsightResponse } from '../types'
import { AlertsCard, BudgetsCard, CashflowCard, DashboardSkeleton, InsightCard, NetWorthCard, Onboarding, RecentCard, type Delta } from './dashboard/cards'
import { dailyProjection, monthKey, pctChange, type MonthTotals } from './dashboard/data'
import { FlowHero } from './dashboard/flow'
import { PaceCard } from './dashboard/pace'
import './dashboard/dashboard.css'

const isFlow = (tx: Transaction) => tx.type !== 'transfer'

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
  const [prevMonthTx, setPrevMonthTx] = useState<Transaction[] | null>(null)
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
    // Mês anterior inteiro: comparação "até o mesmo dia" e contas fixas para o ritmo
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    transactionsService.list({ start_date: toISODate(prevStart), end_date: toISODate(prevEnd), page_size: 500 })
      .then(r => { if (alive) setPrevMonthTx(r.transactions || []) })
      .catch(() => { if (alive) setPrevMonthTx([]) })
    return () => { alive = false }
  }, [attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mês anterior até o mesmo dia: o mês corrente ainda não acabou, então a comparação é justa
  const prevToDate = useMemo(() => {
    if (!prevMonthTx) return null
    const f = prevMonthTx.filter(tx => isFlow(tx) && Number(tx.transaction_date.slice(8, 10)) <= now.getDate())
    if (!f.length) return null
    return { income: f.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0), expense: -f.filter(tx => tx.amount < 0).reduce((s, tx) => s + tx.amount, 0) }
  }, [prevMonthTx, now])
  const hasHistory = summary.some(m => m.income || m.expense) || transactions.length > 0
  const isNew = status === 'ready' && !hasHistory

  const { toast } = useToastStore()
  const hadInsight = useRef(false)
  useEffect(() => { hadInsight.current = !!insight }, [insight])

  const loadInsight = useCallback(async (refresh = false) => {
    setInsightLoading(true)
    setInsightError(false)
    try {
      setInsight(await insightsService.generate(start_date, end_date, refresh))
    } catch {
      setInsightError(true)
      // Se já havia um resumo na tela, ele fica e o aviso vem num toast
      if (hadInsight.current) toast({ message: t('dashboard.insight.refreshError'), variant: 'error' })
    } finally {
      setInsightLoading(false)
    }
  }, [start_date, end_date, toast, t])

  const insightStale = useMemo(() => {
    if (!insight || insight.income == null || insight.expense == null) return false
    let income = 0, expense = 0
    for (const tx of transactions) {
      if (tx.type === 'transfer') continue
      if (tx.amount > 0) income += tx.amount
      else expense -= tx.amount
    }
    return Math.abs(income - insight.income) > 0.005 || Math.abs(expense - insight.expense) > 0.005
  }, [insight, transactions])

  useEffect(() => {
    if (status === 'ready' && hasHistory) loadInsight()
  }, [status, hasHistory, loadInsight])

  const points = useMemo(() => (cashflow ? dailyProjection(cashflow, now) : []), [cashflow, now])

  // ── Métricas do mês ─────────────────────────────────────
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
          <EmptyState tone="error" title={t('dashboard.error.title')} description={t('dashboard.error.text')}
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
        <div className="ft-dash-grid ft-rise">
          <FlowHero transactions={transactions} categories={categories} balance={balance} balanceDelta={balanceDelta}
            accountsCount={accounts.length} prev={prevToDate} now={now} />
          {/* Duas colunas que empilham por conta própria no computador (sem vão entre as linhas);
              no celular as caixas somem (display: contents) e vale a ordem de leitura da grade */}
          <div className="ft-dash-col ft-dash-col--main">
            <PaceCard transactions={transactions} previousMonth={prevMonthTx} budgets={budgets} monthKey={currentMonth} now={now} />
            <RecentCard transactions={recent} categories={categories} accounts={accounts} />
          </div>
          <div className="ft-dash-col ft-dash-col--side">
            <AlertsCard alerts={alerts} loading={alertsLoading} error={alertsError} onRetry={reloadAlerts} />
            <BudgetsCard budgets={budgets ?? []} categories={categories} loading={budgets === null} previousMonth={prevMonthTx} monthKey={currentMonth} now={now} />
            <InsightCard insight={insight} loading={insightLoading} error={insightError} onRefresh={() => loadInsight(true)} stale={insightStale} />
          </div>
          <CashflowCard cashflow={cashflow} points={points} />
          {netWorth !== false && <NetWorthCard nw={netWorth} />}
        </div>
      </div>
    </Page>
  )
}
