import { useState, useEffect, useCallback } from 'react'
import { PageFooter } from '../components/layout'
import { Card, Spinner } from '../components/ui'
import { transactionsService, supabase } from '../services'
import { formatCurrency, formatCurrencyCompact, toISODate } from '../utils'
import type { Transaction, Category } from '../types'

// ── Period helpers ─────────────────────────────────────────
type PeriodKey = 'mes' | '3meses' | '6meses' | 'ano'

interface Period { label: string; start: string; end: string }

function buildPeriod(key: PeriodKey): Period {
  const now = new Date()
  const end = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const labels: Record<PeriodKey, string> = {
    mes: 'Este mês', '3meses': 'Últimos 3 meses', '6meses': 'Últimos 6 meses', ano: 'Este ano',
  }
  let start: string
  if (key === 'mes')    start = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  else if (key === '3meses') start = toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 1))
  else if (key === '6meses') start = toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1))
  else                  start = toISODate(new Date(now.getFullYear(), 0, 1))
  return { label: labels[key], start, end }
}

// ── Aggregation helpers ────────────────────────────────────
function monthKey(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}${y !== String(new Date().getFullYear()) ? `/${y.slice(2)}` : ''}`
}

// ── PeriodSelector ─────────────────────────────────────────
const PERIODS: PeriodKey[] = ['mes', '3meses', '6meses', 'ano']
const PERIOD_LABELS: Record<PeriodKey, string> = {
  mes: 'Mês', '3meses': '3 meses', '6meses': '6 meses', ano: 'Ano',
}

function PeriodSelector({ active, onChange }: { active: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.375rem' }}>
      {PERIODS.map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '0.3125rem 0.75rem', borderRadius: 'var(--radius-md)',
            border: active === k ? '1px solid var(--accent)' : '0.5px solid var(--border)',
            background: active === k ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: active === k ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 'var(--font-size-sm)', fontWeight: active === k ? '600' : '400',
            cursor: 'pointer', transition: 'all var(--transition)',
          }}
        >{PERIOD_LABELS[k]}</button>
      ))}
    </div>
  )
}

// ── SummaryCard ────────────────────────────────────────────
function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card hover style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
        {formatCurrencyCompact(value)}
      </span>
    </Card>
  )
}

// ── BarChart ───────────────────────────────────────────────
function BarChart({ months }: { months: { key: string; income: number; expense: number }[] }) {
  const W = 320; const H = 120; const barW = 10; const gap = 4
  const allVals = months.flatMap(m => [m.income, m.expense])
  const max = Math.max(...allVals, 1)
  const groupW = barW * 2 + gap + 8
  const totalW = months.length * groupW
  const offsetX = Math.max(0, (W - totalW) / 2)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', minWidth: `${Math.max(W, totalW + 20)}px`, height: `${H + 20}px` }}>
        {months.map((m, i) => {
          const x = offsetX + i * groupW
          const incH = (m.income / max) * H
          const expH = (m.expense / max) * H
          return (
            <g key={m.key}>
              {/* income bar */}
              <rect x={x} y={H - incH} width={barW} height={incH} rx="2" fill="var(--green)" opacity="0.85" />
              {/* expense bar */}
              <rect x={x + barW + gap} y={H - expH} width={barW} height={expH} rx="2" fill="var(--accent)" opacity="0.85" />
              {/* month label */}
              <text x={x + barW + gap / 2} y={H + 14} textAnchor="middle" fontSize="8" fill="var(--text-hint)">{monthLabel(m.key)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── DonutChart ─────────────────────────────────────────────
interface Slice { label: string; value: number; color: string; icon?: string }

function DonutChart({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--text-hint)', padding: '2rem', fontSize: 'var(--font-size-sm)' }}>Sem gastos no período</div>

  const R = 52; const cx = 68; const cy = 68; const strokeW = 22
  let cumAngle = -Math.PI / 2

  const arcs = slices.map(sl => {
    const angle = (sl.value / total) * 2 * Math.PI
    const x1 = cx + R * Math.cos(cumAngle)
    const y1 = cy + R * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + R * Math.cos(cumAngle)
    const y2 = cy + R * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return { sl, x1, y1, x2, y2, large, angle }
  })

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 136 136" style={{ width: '8.5rem', height: '8.5rem', flexShrink: 0 }}>
        {arcs.map(({ sl, x1, y1, x2, y2, large, angle }, i) => (
          angle > 0.01 ? (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={sl.color}
              strokeWidth={strokeW}
              opacity="0.9"
            />
          ) : null
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">Total</text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--text-primary)">
          {formatCurrencyCompact(total)}
        </text>
      </svg>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem', minWidth: 0 }}>
        {slices.slice(0, 8).map((sl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CategoryIconSvg icon={sl.icon} color={sl.color} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sl.label}
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', flexShrink: 0 }}>
              {((sl.value / total) * 100).toFixed(0)}%
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', fontWeight: '500', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
              {formatCurrencyCompact(sl.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── TopExpenses ────────────────────────────────────────────
function TopExpenses({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const byDesc: Record<string, number> = {}
  transactions.filter(t => t.amount < 0).forEach(t => {
    byDesc[t.description] = (byDesc[t.description] || 0) + Math.abs(t.amount)
  })
  const top = Object.entries(byDesc).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const expenses = transactions.filter(t => t.amount < 0)
  const total = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {top.map(([desc, val], i) => {
        const pct = total > 0 ? (val / total) * 100 : 0
        const txn = transactions.find(t => t.description === desc && t.amount < 0)
        const cat = txn?.category_id ? catMap[txn.category_id] : null
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', overflow: 'hidden', maxWidth: '60%' }}>
                {cat?.icon && <CategoryIconSvg icon={cat.icon} color={cat.color || 'var(--accent)'} />}
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {desc}
                </span>
              </div>
              <span style={{ fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: '500' }}>
                {formatCurrency(val)}
              </span>
            </div>
            <div style={{ height: '3px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: cat?.color || 'var(--accent)', borderRadius: '2px', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PALETTE ────────────────────────────────────────────────
const PALETTE = [
  '#9D2449','#3B82F6','#10B981','#F59E0B','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#6366F1','#84CC16',
]

// ── Category SVG icons (Feather icon names → inline SVG) ───
function CategoryIconSvg({ icon, color, size = 13 }: { icon?: string; color: string; size?: number }) {
  if (!icon) return null
  const s = { fill: 'none' as const, stroke: color, strokeWidth: '1.5', strokeLinecap: 'square' as const, strokeLinejoin: 'round' as const }
  const shapes: Record<string, React.ReactNode> = {
    'utensils':        <><path {...s} d="M3 2v7c0 1.1.9 2 2 2s2-.9 2-2V2M5 11v11M9 2v5c0 2.2 1.8 4 4 4v11"/></>,
    'car':             <><path {...s} d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2"/><circle {...s} cx="7" cy="17" r="2"/><circle {...s} cx="17" cy="17" r="2"/></>,
    'home':            <><path {...s} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline {...s} points="9 22 9 12 15 12 15 22"/></>,
    'heart':           <path {...s} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>,
    'book':            <><path {...s} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path {...s} d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    'music':           <><path {...s} d="M9 18V5l12-2v13"/><circle {...s} cx="6" cy="18" r="3"/><circle {...s} cx="18" cy="16" r="3"/></>,
    'shirt':           <path {...s} d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>,
    'repeat':          <><polyline {...s} points="17 1 21 5 17 9"/><path {...s} d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline {...s} points="7 23 3 19 7 15"/><path {...s} d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    'trending-up':     <><polyline {...s} points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline {...s} points="17 6 23 6 23 12"/></>,
    'dollar-sign':     <><line {...s} x1="12" y1="1" x2="12" y2="23"/><path {...s} d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    'arrow-right':     <><line {...s} x1="5" y1="12" x2="19" y2="12"/><polyline {...s} points="12 5 19 12 12 19"/></>,
    'more-horizontal': <><circle {...s} cx="12" cy="12" r="1"/><circle {...s} cx="19" cy="12" r="1"/><circle {...s} cx="5" cy="12" r="1"/></>,
  }
  const shape = shapes[icon]
  if (!shape) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      {shape}
    </svg>
  )
}

// ── Reports ───────────────────────────────────────────────
export function Reports() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('mes')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const period = buildPeriod(periodKey)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, catRes] = await Promise.all([
        transactionsService.list({ start_date: period.start, end_date: period.end, page_size: 500 }),
        supabase.from('categories').select('*').order('name'),
      ])
      setTransactions(txRes.transactions ?? [])
      setCategories((catRes.data as Category[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [period.start, period.end])

  useEffect(() => { load() }, [load])

  // ── aggregations ───────────────────────────────────────
  const expenses = transactions.filter(t => t.amount < 0)
  const income   = transactions.filter(t => t.amount > 0)
  const totalExp = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalInc = income.reduce((s, t) => s + t.amount, 0)
  const balance  = totalInc - totalExp

  // monthly bar data
  const monthMap: Record<string, { income: number; expense: number }> = {}
  transactions.forEach(t => {
    const k = monthKey(t.transaction_date)
    if (!monthMap[k]) monthMap[k] = { income: 0, expense: 0 }
    if (t.amount > 0) monthMap[k].income += t.amount
    else monthMap[k].expense += Math.abs(t.amount)
  })
  const monthBars = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => ({ key, ...v }))

  // category donut data
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const catTotals: Record<string, number> = {}
  expenses.forEach(t => {
    const k = t.category_id || '__sem__'
    catTotals[k] = (catTotals[k] || 0) + Math.abs(t.amount)
  })
  const slices: Slice[] = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([id, val], i) => {
      const cat = catMap[id]
      return {
        label: cat?.name || 'Sem categoria',
        value: val,
        color: cat?.color || PALETTE[i % PALETTE.length],
        icon: cat?.icon,
      }
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Relatórios</h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Análise das suas finanças</p>
          </div>
          <PeriodSelector active={periodKey} onChange={setPeriodKey} />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner /></div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <SummaryCard label="Receitas" value={totalInc} color="var(--green)" />
              <SummaryCard label="Gastos" value={totalExp} color="var(--accent)" />
              <SummaryCard label="Saldo" value={balance} color={balance >= 0 ? 'var(--green)' : 'var(--accent)'} />
            </div>

            {/* Bar chart */}
            {monthBars.length > 0 && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)' }}>Receitas × Gastos</span>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--green)', display: 'inline-block' }} />Receitas
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent)', display: 'inline-block' }} />Gastos
                    </span>
                  </div>
                </div>
                <BarChart months={monthBars} />
              </Card>
            )}

            {/* Donut chart */}
            <Card>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
                Gastos por categoria
              </span>
              <DonutChart slices={slices} />
            </Card>

            {/* Top expenses */}
            {expenses.length > 0 && (
              <Card>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
                  Maiores gastos
                </span>
                <TopExpenses transactions={transactions} categories={categories} />
              </Card>
            )}

            {/* Empty state */}
            {transactions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-hint)', fontSize: 'var(--font-size-sm)' }}>
                Nenhuma transação no período selecionado.
              </div>
            )}
          </>
        )}
      </div>

      <PageFooter />
    </div>
  )
}
