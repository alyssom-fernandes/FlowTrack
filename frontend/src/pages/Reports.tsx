import { useState, useEffect, useCallback, useRef } from 'react'
import { PageFooter } from '../components/layout'
import { Button, Card, Spinner } from '../components/ui'
import { transactionsService, categoriesService, projectionsService } from '../services'
import { formatCurrency, formatCurrencyCompact, toISODate } from '../utils'
import type { Transaction, Category, ProjectionData } from '../types'

// ── Period helpers ─────────────────────────────────────────
type PeriodKey = 'mes' | '3meses' | '6meses' | 'ano' | 'custom'

interface Period { label: string; start: string; end: string }

function buildPeriod(key: PeriodKey, customStart?: string, customEnd?: string): Period {
  const now = new Date()
  const end = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const labels: Record<PeriodKey, string> = {
    mes: 'Este mês', '3meses': 'Últimos 3 meses', '6meses': 'Últimos 6 meses',
    ano: 'Este ano', custom: 'Personalizado',
  }
  if (key === 'custom') return { label: labels.custom, start: customStart || toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: customEnd || end }
  let start: string
  if (key === 'mes')    start = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  else if (key === '3meses') start = toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 1))
  else if (key === '6meses') start = toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1))
  else                  start = toISODate(new Date(now.getFullYear(), 0, 1))
  return { label: labels[key], start, end }
}

function prevPeriod(period: Period): Period {
  const startD = new Date(period.start + 'T00:00:00')
  const endD   = new Date(period.end + 'T00:00:00')
  const diffMs = endD.getTime() - startD.getTime()
  const prevEnd = new Date(startD.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - diffMs)
  return {
    label: 'Período anterior',
    start: toISODate(prevStart),
    end: toISODate(prevEnd),
  }
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
const PERIODS: PeriodKey[] = ['mes', '3meses', '6meses', 'ano', 'custom']
const PERIOD_LABELS: Record<PeriodKey, string> = {
  mes: 'Mês', '3meses': '3 meses', '6meses': '6 meses', ano: 'Ano', custom: 'Personalizado',
}

const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '0.3125rem 0.5rem',
  fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer',
}

function PeriodSelector({ active, onChange, customStart, customEnd, onCustomChange }: {
  active: PeriodKey
  onChange: (k: PeriodKey) => void
  customStart: string
  customEnd: string
  onCustomChange: (start: string, end: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
      {active === 'custom' && (
        <>
          <input type="date" value={customStart} onChange={e => onCustomChange(e.target.value, customEnd)}
            style={{ ...sel, height: '2rem' }} />
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>até</span>
          <input type="date" value={customEnd} onChange={e => onCustomChange(customStart, e.target.value)}
            style={{ ...sel, height: '2rem' }} />
        </>
      )}
    </div>
  )
}

// ── SummaryCard ────────────────────────────────────────────
function SummaryCard({ label, value, color, delta }: { label: string; value: number; color?: string; delta?: number }) {
  return (
    <Card hover style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
        {formatCurrencyCompact(value)}
      </span>
      {delta !== undefined && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs. período anterior
        </span>
      )}
    </Card>
  )
}

// ── BarChart ───────────────────────────────────────────────
function BarChart({ months, prevMonths }: {
  months: { key: string; income: number; expense: number }[]
  prevMonths?: { key: string; income: number; expense: number }[]
}) {
  const W = 320; const H = 120; const barW = prevMonths ? 7 : 10; const gap = 3
  const allVals = [
    ...months.flatMap(m => [m.income, m.expense]),
    ...(prevMonths || []).flatMap(m => [m.income, m.expense]),
  ]
  const max = Math.max(...allVals, 1)
  const groupW = prevMonths ? barW * 4 + gap * 3 + 8 : barW * 2 + gap + 8
  const totalW = months.length * groupW
  const offsetX = Math.max(0, (W - totalW) / 2)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', minWidth: `${Math.max(W, totalW + 20)}px`, height: `${H + 20}px` }}>
        {months.map((m, i) => {
          const x = offsetX + i * groupW
          const incH = (m.income / max) * H
          const expH = (m.expense / max) * H
          const prev = prevMonths?.[i]
          const prevIncH = prev ? (prev.income / max) * H : 0
          const prevExpH = prev ? (prev.expense / max) * H : 0
          return (
            <g key={m.key}>
              {prev && <rect x={x} y={H - prevIncH} width={barW} height={prevIncH} rx="2" fill="var(--green)" opacity="0.3" />}
              <rect x={x + (prev ? barW + gap : 0)} y={H - incH} width={barW} height={incH} rx="2" fill="var(--green)" opacity="0.85" />
              {prev && <rect x={x + barW * 2 + gap * 2} y={H - prevExpH} width={barW} height={prevExpH} rx="2" fill="var(--accent)" opacity="0.3" />}
              <rect x={x + (prev ? barW * 3 + gap * 3 : barW + gap)} y={H - expH} width={barW} height={expH} rx="2" fill="var(--accent)" opacity="0.85" />
              <text x={x + groupW / 2} y={H + 14} textAnchor="middle" fontSize="8" fill="var(--text-hint)">{monthLabel(m.key)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── DonutChart ─────────────────────────────────────────────
interface Slice { label: string; value: number; color: string; icon?: string; delta?: number }

function DonutChart({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--text-hint)', padding: '2rem', fontSize: 'var(--font-size-sm)' }}>Sem gastos no período</div>

  const R = 52; const cx = 68; const cy = 68; const strokeW = 22
  const START = -Math.PI / 2

  const arcs = slices.reduce<{ sl: Slice; x1: number; y1: number; x2: number; y2: number; large: number; angle: number; endAngle: number }[]>((acc, sl) => {
    const prevAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : START
    const angle = (sl.value / total) * 2 * Math.PI
    const endAngle = prevAngle + angle
    const x1 = cx + R * Math.cos(prevAngle)
    const y1 = cy + R * Math.sin(prevAngle)
    const x2 = cx + R * Math.cos(endAngle)
    const y2 = cy + R * Math.sin(endAngle)
    const large = angle > Math.PI ? 1 : 0
    return [...acc, { sl, x1, y1, x2, y2, large, angle, endAngle }]
  }, [])

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 136 136" style={{ width: '8.5rem', height: '8.5rem', flexShrink: 0 }}>
        {arcs.map(({ sl, x1, y1, x2, y2, large, angle }, i) => (
          angle > 0.01 ? (
            <path key={i} d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
              fill="none" stroke={sl.color} strokeWidth={strokeW} opacity="0.9" />
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
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: sl.color, flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sl.label}
            </span>
            {sl.delta !== undefined && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: sl.delta <= 0 ? 'var(--green)' : 'var(--red)', flexShrink: 0, fontWeight: '500' }}>
                {sl.delta > 0 ? '+' : ''}{sl.delta.toFixed(0)}%
              </span>
            )}
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
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{desc}</span>
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

// ── ProjectionChart ────────────────────────────────────────
function ProjectionChart({ data }: { data: ProjectionData }) {
  const all = [...data.history, ...data.projections]
  if (all.length === 0) return null
  const W = 320; const H = 100; const barW = 8; const gap = 3
  const maxVal = Math.max(...all.flatMap(m => [m.income, m.expense]), 1)
  const groupW = barW * 2 + gap + 10
  const totalW = all.length * groupW
  const offsetX = Math.max(0, (W - totalW) / 2)

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  const confidence = data.months_available >= 6 ? 'Alta' : data.months_available >= 3 ? 'Média' : 'Baixa'
  const confColor = data.months_available >= 6 ? 'var(--green)' : data.months_available >= 3 ? 'var(--accent)' : 'var(--red)'

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '500', color: 'var(--text-primary)', display: 'block' }}>Projeções financeiras (3 meses)</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>
            Baseado em {data.months_available} mes{data.months_available !== 1 ? 'es' : ''} de histórico.
            Confiança: <strong style={{ color: confColor }}>{confidence}</strong>
            {data.months_available < 6 && ' — recomendamos 6+ meses para maior precisão.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '6px', background: 'var(--green)', opacity: 0.85, borderRadius: '2px', display: 'inline-block' }} />Receitas
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '6px', background: 'var(--accent)', opacity: 0.85, borderRadius: '2px', display: 'inline-block' }} />Gastos
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '6px', background: 'var(--border)', opacity: 0.5, borderRadius: '2px', display: 'inline-block', border: '1px dashed var(--text-hint)' }} />Projeção
          </span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${Math.max(W, totalW + 20)} ${H + 20}`} style={{ width: '100%', minWidth: `${Math.max(W, totalW + 20)}px`, height: `${H + 20}px` }}>
          {/* Separator between history and projection */}
          {data.history.length > 0 && data.projections.length > 0 && (
            <line
              x1={offsetX + data.history.length * groupW - 4} y1="0"
              x2={offsetX + data.history.length * groupW - 4} y2={H}
              stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4"
            />
          )}
          {all.map((m, i) => {
            const x = offsetX + i * groupW
            const incH = (m.income / maxVal) * H
            const expH = (m.expense / maxVal) * H
            const isProj = m.is_projection
            const mo = m.month.split('-')
            const label = months[parseInt(mo[1]) - 1] + (isProj ? '*' : '')
            return (
              <g key={m.month}>
                <rect x={x} y={H - incH} width={barW} height={incH} rx="2" fill="var(--green)" opacity={isProj ? 0.35 : 0.85} />
                <rect x={x + barW + gap} y={H - expH} width={barW} height={expH} rx="2" fill="var(--accent)" opacity={isProj ? 0.35 : 0.85} />
                <text x={x + barW + gap / 2} y={H + 14} textAnchor="middle" fontSize="8" fill={isProj ? 'var(--text-hint)' : 'var(--text-muted)'}>{label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.625rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>
        Média histórica — Receitas: <strong>{formatCurrencyCompact(data.avg_income)}</strong>/mês · Gastos: <strong>{formatCurrencyCompact(data.avg_expense)}</strong>/mês
      </div>
    </Card>
  )
}

// ── Reports ───────────────────────────────────────────────
export function Reports() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [projections, setProjections] = useState<ProjectionData | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    projectionsService.get().then(setProjections).catch(() => null)
  }, [])

  const period = buildPeriod(periodKey, customStart, customEnd)
  const load = useCallback(async () => {
    if (periodKey === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    try {
      const currentPeriod = buildPeriod(periodKey, customStart, customEnd)
      const prev = comparing ? prevPeriod(currentPeriod) : null
      const [txRes, catRes, prevRes] = await Promise.all([
        transactionsService.list({ start_date: currentPeriod.start, end_date: currentPeriod.end, page_size: 500 }),
        categoriesService.list(),
        prev ? transactionsService.list({ start_date: prev.start, end_date: prev.end, page_size: 500 }) : Promise.resolve(null),
      ])
      setTransactions(txRes.transactions ?? [])
      setCategories(catRes.categories ?? [])
      setPrevTransactions(prevRes?.transactions ?? [])
    } finally {
      setLoading(false)
    }
  }, [periodKey, customStart, customEnd, comparing])

  useEffect(() => { load() }, [load])

  // ── aggregations ───────────────────────────────────────
  const expenses = transactions.filter(t => t.amount < 0)
  const income   = transactions.filter(t => t.amount > 0)
  const totalExp = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalInc = income.reduce((s, t) => s + t.amount, 0)
  const balance  = totalInc - totalExp
  // `period` is used for PDF export label and summary cards delta label

  const prevExpenses = prevTransactions.filter(t => t.amount < 0)
  const prevIncome   = prevTransactions.filter(t => t.amount > 0)
  const prevTotalExp = prevExpenses.reduce((s, t) => s + Math.abs(t.amount), 0)
  const prevTotalInc = prevIncome.reduce((s, t) => s + t.amount, 0)

  const pctDelta = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : undefined

  // monthly bar data
  const monthMap: Record<string, { income: number; expense: number }> = {}
  transactions.forEach(t => {
    const k = monthKey(t.transaction_date)
    if (!monthMap[k]) monthMap[k] = { income: 0, expense: 0 }
    if (t.amount > 0) monthMap[k].income += t.amount
    else monthMap[k].expense += Math.abs(t.amount)
  })
  const monthBars = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => ({ key, ...v }))

  const prevMonthMap: Record<string, { income: number; expense: number }> = {}
  prevTransactions.forEach(t => {
    const k = monthKey(t.transaction_date)
    if (!prevMonthMap[k]) prevMonthMap[k] = { income: 0, expense: 0 }
    if (t.amount > 0) prevMonthMap[k].income += t.amount
    else prevMonthMap[k].expense += Math.abs(t.amount)
  })
  const prevMonthBars = comparing ? Object.entries(prevMonthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => ({ key, ...v })) : undefined

  // category donut data
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const catTotals: Record<string, number> = {}
  expenses.forEach(t => {
    const k = t.category_id || '__sem__'
    catTotals[k] = (catTotals[k] || 0) + Math.abs(t.amount)
  })
  const prevCatTotals: Record<string, number> = {}
  prevExpenses.forEach(t => {
    const k = t.category_id || '__sem__'
    prevCatTotals[k] = (prevCatTotals[k] || 0) + Math.abs(t.amount)
  })
  const slices: Slice[] = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([id, val], i) => {
      const cat = catMap[id]
      const prevVal = prevCatTotals[id]
      const delta = comparing && prevVal !== undefined ? pctDelta(val, prevVal) : undefined
      return {
        label: cat?.name || 'Sem categoria',
        value: val,
        color: cat?.color || PALETTE[i % PALETTE.length],
        icon: cat?.icon,
        delta,
      }
    })

  // ── PDF Export ─────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!reportRef.current) return
    setExportingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = (canvas.height * pdfW) / canvas.width

      pdf.setFontSize(14)
      pdf.setTextColor(157, 36, 73)
      pdf.text('FlowTrack', 14, 12)
      pdf.setFontSize(10)
      pdf.setTextColor(100, 100, 100)
      pdf.text(`Relatório — ${period.label} (${period.start} a ${period.end})`, 14, 19)
      pdf.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 25)

      pdf.addImage(imgData, 'PNG', 0, 30, pdfW, Math.min(pdfH, 260))
      pdf.save(`flowtrack_relatorio_${period.start}_${period.end}.pdf`)
    } catch (e) {
      console.error('PDF export failed', e)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Relatórios</h1>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Análise das suas finanças</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Compare toggle */}
              <button
                onClick={() => setComparing(v => !v)}
                style={{
                  padding: '0.3125rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: comparing ? '1px solid var(--green)' : '0.5px solid var(--border)',
                  background: comparing ? 'var(--green-soft)' : 'var(--bg-card)',
                  color: comparing ? 'var(--green)' : 'var(--text-muted)',
                  fontSize: 'var(--font-size-sm)', fontWeight: comparing ? '600' : '400',
                  transition: 'all var(--transition)',
                }}
              >
                ⇄ Comparar período anterior
              </button>
              {/* PDF Export */}
              <Button size="sm" variant="secondary" loading={exportingPdf} onClick={handleExportPdf}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar PDF
              </Button>
            </div>
          </div>
          <PeriodSelector
            active={periodKey}
            onChange={setPeriodKey}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
          />
          {comparing && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', display: 'flex', gap: '1rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '0.75rem', height: '0.5rem', background: 'var(--accent)', opacity: 0.85, borderRadius: '2px', display: 'inline-block' }} />
                Período atual
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '0.75rem', height: '0.5rem', background: 'var(--accent)', opacity: 0.3, borderRadius: '2px', display: 'inline-block' }} />
                Período anterior
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner /></div>
        ) : (
          <div ref={reportRef}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <SummaryCard label="Receitas" value={totalInc} color="var(--green)"
                delta={comparing ? pctDelta(totalInc, prevTotalInc) : undefined} />
              <SummaryCard label="Gastos" value={totalExp} color="var(--accent)"
                delta={comparing ? pctDelta(totalExp, prevTotalExp) : undefined} />
              <SummaryCard label="Saldo" value={balance}
                color={balance >= 0 ? 'var(--green)' : 'var(--accent)'} />
            </div>

            {/* Bar chart */}
            {monthBars.length > 0 && (
              <Card style={{ marginBottom: '1rem' }}>
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
                <BarChart months={monthBars} prevMonths={prevMonthBars} />
              </Card>
            )}

            {/* Donut chart */}
            <Card style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
                Gastos por categoria{comparing ? ' (Δ% vs. período anterior)' : ''}
              </span>
              <DonutChart slices={slices} />
            </Card>

            {/* Top expenses */}
            {expenses.length > 0 && (
              <Card style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
                  Maiores gastos
                </span>
                <TopExpenses transactions={transactions} categories={categories} />
              </Card>
            )}

            {/* Projections */}
            {projections && projections.months_available > 0 && (
              <ProjectionChart data={projections} />
            )}

            {/* Empty state */}
            {transactions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-hint)', fontSize: 'var(--font-size-sm)' }}>
                Nenhuma transação no período selecionado.
              </div>
            )}
          </div>
        )}
      </div>

      <PageFooter />
    </div>
  )
}
