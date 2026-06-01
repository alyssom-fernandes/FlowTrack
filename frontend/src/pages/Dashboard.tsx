import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Card, Spinner } from '../components/ui'
import { transactionsService, accountsService } from '../services'
import { formatCurrency, formatCurrencyCompact, formatDateShort, getCurrentMonthRange, toISODate } from '../utils'
import type { Transaction, Account } from '../types'

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
function ChartCard({ transactions }: { transactions: Transaction[] }) {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const now = new Date()

  // Last 6 months
  const labels: string[] = []
  const incomeData: number[] = []
  const expenseData: number[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    labels.push(months[d.getMonth()])
    const monthTxns = transactions.filter(t => {
      const td = new Date(t.transaction_date)
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth()
    })
    incomeData.push(monthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))
    expenseData.push(Math.abs(monthTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)))
  }

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

// ── Dashboard ─────────────────────────────────────────────
export function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date()
        const { end_date } = getCurrentMonthRange()
        // Fetch 6 months for the sparkline chart
        const chartStart = toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1))
        const [txnRes, accRes] = await Promise.all([
          transactionsService.list({ start_date: chartStart, end_date, page_size: 500 }),
          accountsService.list(),
        ])
        setTransactions(txnRes.transactions || [])
        setAccounts(accRes.accounts || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Current month range for metrics
  const { start_date: monthStart } = getCurrentMonthRange()
  const currentMonth = transactions.filter(t => t.transaction_date >= monthStart)

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const income = currentMonth.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = Math.abs(currentMonth.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
  const recentTxns = [...currentMonth].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()).slice(0, 5)

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
        <ChartCard transactions={transactions} />

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

          {/* Alerts + Insight */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Card>
              <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Alertas</span>
              {expenses > income && income > 0
                ? <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 0 3px var(--red-soft)', flexShrink: 0, marginTop: '0.25rem' }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Gastos superam receitas este mês</span>
                  </div>
                : currentMonth.length > 0
                  ? <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Finanças equilibradas este mês.</p>
                  : <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Nenhuma transação este mês.</p>
              }
            </Card>

            <Card accent>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '0.375rem' }}>IA · Insight</span>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {currentMonth.length === 0
                  ? 'Adicione transações para receber insights personalizados.'
                  : `Você registrou ${currentMonth.length} transaç${currentMonth.length > 1 ? 'ões' : 'ão'} este mês. ${expenses > 0 ? `Gastos em ${formatCurrencyCompact(expenses)}.` : ''} ${income > 0 ? `Receitas em ${formatCurrencyCompact(income)}.` : ''}`
                }
              </p>
            </Card>
          </div>
        </div>
      </div>
      <PageFooter />
    </div>
  )
}
