import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Card, Spinner } from '../components/ui'
import { transactionsService, accountsService, goalsService, categoriesService, summaryService, insightsService, cashflowService } from '../services'
import { formatCurrency, formatCurrencyCompact, formatDateShort, getCurrentMonthRange } from '../utils'
import type { Transaction, Account, Goal, Category, CashflowProjection } from '../types'

// ── Metric Card ───────────────────────────────────────────
function MetricCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <Card hover style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-3xl)', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 'var(--font-size-sm)', color: subColor || 'var(--text-muted)' }}>{sub}</span>}
    </Card>
  )
}

// ── Mini Chart (SVG sparkline) ────────────────────────────
function SparklineChart({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 300; const h = 60
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 8) - 4
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '3.75rem' }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="square" points={points} />
    </svg>
  )
}

// ── Chart Card ────────────────────────────────────────────
type MonthlySummary = { month: string; income: number; expense: number }

function ChartCard({ summary }: { summary: MonthlySummary[] }) {
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const labels = summary.map(s => monthNames[parseInt(s.month.split('-')[1], 10) - 1])
  const incomeData = summary.map(s => s.income)
  const expenseData = summary.map(s => s.expense)

  return (
    <Card style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)' }}>Evolução mensal</span>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            <span style={{ width: '1.5rem', height: '1.5px', background: 'var(--green)', display: 'inline-block' }} />Receitas
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            <span style={{ width: '1.5rem', height: '1.5px', background: 'var(--accent)', display: 'inline-block' }} />Gastos
          </span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <SparklineChart data={incomeData} color="var(--green)" />
        </div>
        <SparklineChart data={expenseData} color="#9D2449" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
        {labels.map((l) => (
          <span key={l} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', flex: 1, textAlign: 'center' }}>{l}</span>
        ))}
      </div>
    </Card>
  )
}

// ── Cashflow Chart ────────────────────────────────────────
function CashflowCard({ cashflow }: { cashflow: CashflowProjection }) {
  if (cashflow.days.length === 0) return null

  const W = 320; const H = 80
  const balances = cashflow.days.map(d => d.projected_balance)
  const allVals = [cashflow.starting_balance, ...balances]
  const max = Math.max(...allVals)
  const min = Math.min(...allVals, 0)
  const range = max - min || 1

  const toY = (v: number) => H - ((v - min) / range) * (H - 8) - 4

  const pts = [
    `0,${toY(cashflow.starting_balance)}`,
    ...cashflow.days.map((d, i) => {
      const x = ((i + 1) / cashflow.days.length) * W
      return `${x},${toY(d.projected_balance)}`
    }),
  ].join(' ')

  const zeroY = toY(0)
  const negColor = 'var(--red)'
  const posColor = 'var(--green)'

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)' }}>Projeção — próximos 30 dias</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {cashflow.has_negative_days && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--red)', background: 'var(--red-soft)', padding: '0.125rem 0.4rem', borderRadius: 'var(--radius-sm)' }}>
              Saldo negativo previsto
            </span>
          )}
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            Projetado: <strong style={{ color: cashflow.projected_balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrencyCompact(cashflow.projected_balance)}</strong>
          </span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', height: `${H + 16}px`, minWidth: '16rem' }}>
          {/* Zero line */}
          {min < 0 && (
            <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" />
          )}
          {/* Projected balance line */}
          <polyline fill="none" stroke={cashflow.has_negative_days ? negColor : posColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
          {/* Starting balance dot */}
          <circle cx="0" cy={toY(cashflow.starting_balance)} r="3" fill="var(--text-muted)" />
          {/* End dot */}
          <circle cx={W} cy={toY(cashflow.projected_balance)} r="3" fill={cashflow.projected_balance >= 0 ? posColor : negColor} />
          {/* Date labels for first and last */}
          {cashflow.days.length > 0 && (
            <>
              <text x="4" y={H + 13} fontSize="8" fill="var(--text-hint)">{cashflow.days[0].date.slice(5)}</text>
              <text x={W - 4} y={H + 13} fontSize="8" fill="var(--text-hint)" textAnchor="end">{cashflow.days[cashflow.days.length - 1].date.slice(5)}</text>
            </>
          )}
        </svg>
      </div>
      {cashflow.days.some(d => d.events.length > 0) && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {cashflow.days.flatMap(d => d.events).slice(0, 4).map((e, i) => (
            <span key={i} style={{
              fontSize: 'var(--font-size-xs)', color: e.amount < 0 ? 'var(--accent)' : 'var(--green)',
              background: e.amount < 0 ? 'var(--accent-soft)' : 'var(--green-soft)',
              padding: '0.125rem 0.375rem', borderRadius: 'var(--radius-sm)',
            }}>
              {e.description.slice(0, 18)}{e.description.length > 18 ? '…' : ''} {formatCurrencyCompact(e.amount)}
            </span>
          ))}
          {cashflow.days.flatMap(d => d.events).length > 4 && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>+{cashflow.days.flatMap(d => d.events).length - 4} mais</span>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Transaction Row ───────────────────────────────────────
function TxnRow({ txn }: { txn: Transaction }) {
  const isPositive = txn.amount > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0', borderBottom: '0.5px solid var(--border)' }}>
      <div style={{ width: '1.875rem', height: '1.875rem', borderRadius: '0.4375rem', background: isPositive ? 'var(--green-soft)' : 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isPositive ? 'var(--green)' : 'var(--accent)'} strokeWidth="1.5" strokeLinecap="square">
          {isPositive ? <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> : <path d="M3 11l19-9-9 19-2-8-8-2z"/>}
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>{formatDateShort(txn.transaction_date)}</div>
      </div>
      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: '500', color: isPositive ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
        {isPositive ? '+' : ''}{formatCurrency(txn.amount)}
      </span>
    </div>
  )
}

// ── AI Insight Card ───────────────────────────────────────
function InsightCard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [cached, setCached] = useState(false)

  const load = async (force = false) => {
    setLoading(true)
    try {
      const res = await insightsService.generate(startDate, endDate)
      setText(res.text)
      setCached(res.cached && !force)
    } catch {
      setText('Não foi possível gerar o insight agora. Tente novamente mais tarde.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card accent>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Insight IA {cached && <span style={{ opacity: 0.6 }}>· cache</span>}
        </span>
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="Atualizar insight"
          aria-label="Atualizar insight"
          style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--accent)', opacity: loading ? 0.5 : 1, padding: '0.125rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
          <Spinner size={14} />
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Analisando seus dados...</span>
        </div>
      ) : (
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</p>
      )}
    </Card>
  )
}

// ── Dashboard ─────────────────────────────────────────────
export function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cashflow, setCashflow] = useState<CashflowProjection | null>(null)
  const [loading, setLoading] = useState(true)

  const { start_date, end_date } = getCurrentMonthRange()

  useEffect(() => {
    const load = async () => {
      try {
        const [txnRes, accRes, goalsRes, catRes, summary] = await Promise.all([
          transactionsService.list({ start_date, end_date, page_size: 200 }),
          accountsService.list(),
          goalsService.list(),
          categoriesService.list(),
          summaryService.monthly(6),
        ])
        setTransactions(txnRes.transactions || [])
        setAccounts(accRes.accounts || [])
        setGoals(goalsRes.goals || [])
        setCategories(catRes.categories || [])
        setMonthlySummary(summary)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Load cashflow projection separately (non-blocking)
    cashflowService.projection().then(setCashflow).catch(() => null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const income = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
  const recentTxns = [...transactions].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()).slice(0, 5)
  const currentMonth = transactions

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '60dvh' }}>
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style>{`.ft-dash-bottom{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}@media(max-width:640px){.ft-dash-bottom{grid-template-columns:1fr}}`}</style>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* Page header */}
        <div style={{ marginBottom: '0.25rem' }}>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Visão geral do mês atual</p>
        </div>

        {/* Metrics */}
        <div className="ft-metrics-grid">
          <MetricCard label="Saldo total" value={formatCurrencyCompact(totalBalance)} sub={accounts.length > 0 ? `${accounts.length} conta${accounts.length > 1 ? 's' : ''}` : 'Sem contas'} />
          <MetricCard label="Receitas" value={formatCurrencyCompact(income)} sub="↑ este mês" subColor="var(--green)" />
          <MetricCard label="Gastos" value={formatCurrencyCompact(expenses)} sub="↓ este mês" subColor="var(--red)" />
        </div>

        {/* Chart */}
        <ChartCard summary={monthlySummary} />

        {/* Cashflow projection */}
        {cashflow && <CashflowCard cashflow={cashflow} />}

        {/* Bottom grid — responsive via CSS class */}
        <div className="ft-dash-bottom">

          {/* Recent transactions */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)' }}>Últimas transações</span>
              <a href="/transactions" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--accent)', textDecoration: 'none' }}>ver todas →</a>
            </div>
            {recentTxns.length === 0
              ? <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', padding: '1rem 0' }}>Nenhuma transação este mês.</p>
              : recentTxns.map(t => <TxnRow key={t.id} txn={t} />)
            }
          </Card>

          {/* Alerts + AI Insight */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Alerts (computed locally from loaded data) */}
            <Card>
              <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Alertas</span>
              {(() => {
                const alerts: { color: string; bg: string; text: string }[] = []
                if (expenses > income && income > 0)
                  alerts.push({ color: 'var(--red)', bg: 'var(--red-soft)', text: 'Gastos superam receitas este mês' })
                accounts.filter(a => a.balance < 0).forEach(a =>
                  alerts.push({ color: 'var(--red)', bg: 'var(--red-soft)', text: `Saldo negativo: ${a.name}` }))
                goals.filter(g => g.type === 'spending_limit' && g.progress_percent >= 80 && g.progress_percent < 100).forEach(g => {
                  const cat = g.category_id ? categories.find(c => c.id === g.category_id) : null
                  const label = cat ? `"${g.name}" (${cat.name})` : `"${g.name}"`
                  alerts.push({ color: 'var(--accent)', bg: 'var(--accent-soft)', text: `Meta ${label} em ${g.progress_percent.toFixed(0)}% do limite` })
                })
                goals.filter(g => g.type === 'spending_limit' && g.progress_percent >= 100).forEach(g =>
                  alerts.push({ color: 'var(--red)', bg: 'var(--red-soft)', text: `Meta "${g.name}" excedida` }))
                const uncategorized = currentMonth.filter(t => !t.category_id).length
                if (uncategorized > 3)
                  alerts.push({ color: 'var(--text-muted)', bg: 'var(--bg-input)', text: `${uncategorized} transações sem categoria este mês` })
                if (cashflow?.has_negative_days)
                  alerts.push({ color: 'var(--accent)', bg: 'var(--accent-soft)', text: 'Saldo projetado negativo nos próximos 30 dias' })
                if (alerts.length === 0)
                  return <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>
                    {currentMonth.length > 0 ? 'Tudo em ordem este mês.' : 'Nenhuma transação este mês.'}
                  </p>
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {alerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.375rem 0.5rem', borderRadius: 'var(--radius-sm)', background: a.bg }}>
                        <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: a.color, flexShrink: 0, marginTop: '0.3rem' }} />
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{a.text}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Card>

            {/* AI Insight */}
            <InsightCard startDate={start_date} endDate={end_date} />
          </div>
        </div>
      </div>
      <PageFooter />
    </div>
  )
}
