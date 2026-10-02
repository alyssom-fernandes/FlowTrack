// Gráficos do painel: SVG desenhado no tamanho real do contêiner
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency, formatSignedCurrency } from '../../utils'
import { useActiveIndex, useWidth } from './hooks'
import { axisMoney, dayMonth, monthLong, monthShort, niceTicks, weekdayDayMonth, type MonthTotals, type ProjectionPoint } from './data'

const AXIS_FONT = 11

// Coluna com topo arredondado (4px) e base reta
function barPath(x: number, y: number, w: number, base: number): string {
  const h = base - y
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`
}

function gutterFor(labels: string[]): number {
  return Math.ceil(Math.max(...labels.map(l => l.length)) * 6.1) + 10
}

// Dica ao lado do ponto, sempre dentro do gráfico. Com `above`, fica centrada acima do ponto (y).
function Tip({ x, width, top = 8, above, y = 0, compact, children }: { x: number; width: number; top?: number; above?: boolean; y?: number; compact?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setSize(prev => (prev.w === el.offsetWidth && prev.h === el.offsetHeight ? prev : { w: el.offsetWidth, h: el.offsetHeight }))
  }, [x, width, y])
  const { w, h } = size
  let left = above ? x - w / 2 : x + 12
  if (!above && left + w > width) left = x - 12 - w
  left = Math.max(0, Math.min(left, width - w))
  const style = { left, top: above ? y - h - 12 : top, maxWidth: width }
  return (
    <div ref={ref} className={`ft-chart-tip${compact ? ' ft-chart-tip--compact' : ''}`} aria-live="polite" style={style}>
      {children}
    </div>
  )
}

function TipRow({ color, label, value, strong }: { color?: string; label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`ft-chart-tip__row${strong ? ' ft-chart-tip__row--total' : ''}`}>
      <span className="ft-chart-tip__label">{color && <span className="ft-chart-tip__key" style={{ background: color }} />}{label}</span>
      <span className="ft-chart-tip__value ft-num">{value}</span>
    </div>
  )
}

// ── Receitas × gastos por mês (colunas agrupadas) ─────────
export function MonthlyChart({ data, currentMonth }: { data: MonthTotals[]; currentMonth: string }) {
  const { t } = useTranslation()
  const [boxRef, width] = useWidth<HTMLDivElement>()
  const { active, setActive, ref, onKeyDown } = useActiveIndex(data.length)

  const compact = width > 0 && width < 480
  const plotH = compact ? 168 : 208
  const axisH = 26
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]))
  const ticks = niceTicks(0, max, compact ? 3 : 4)
  const top = ticks[ticks.length - 1]
  const tickLabels = ticks.map(axisMoney)
  const padL = gutterFor(tickLabels)
  const padT = 8
  const plotW = Math.max(0, width - padL)
  const band = data.length ? plotW / data.length : 0
  const barW = Math.max(6, Math.min(24, (band * 0.58 - 2) / 2))
  const y = (v: number) => padT + (plotH - padT) * (1 - v / top)
  const cx = (i: number) => padL + band * (i + 0.5)

  const pick = (clientX: number, el: HTMLElement) => {
    const x = clientX - el.getBoundingClientRect().left - padL
    if (band <= 0) return
    setActive(Math.max(0, Math.min(data.length - 1, Math.floor(x / band))))
  }

  const summary = data.map(d => t('dashboard.monthly.a11yMonth', { month: monthLong(d.month), income: formatCurrency(d.income), expense: formatCurrency(d.expense) })).join('; ')
  const a = active !== null ? data[active] : null

  return (
    <div ref={ref} className="ft-chart" tabIndex={0} role="group" aria-label={t('dashboard.monthly.keyboardHint')} onKeyDown={onKeyDown}
      onFocus={() => { if (active === null) setActive(data.length - 1) }} onBlur={() => setActive(null)}>
      <div ref={boxRef} className="ft-chart__box" style={{ height: plotH + axisH }} data-chart="mensal"
        onPointerMove={e => pick(e.clientX, e.currentTarget)}
        onPointerDown={e => pick(e.clientX, e.currentTarget)}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
        {width > 0 && (
          <svg width={width} height={plotH + axisH} role="img" aria-label={`${t('dashboard.monthly.title')}. ${summary}.`}>
            {ticks.map((v, i) => (
              <g key={v}>
                <line x1={padL} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--border-strong)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize={AXIS_FONT} fill="var(--chart-axis)" className="ft-num">{tickLabels[i]}</text>
              </g>
            ))}
            {active !== null && <rect x={padL + band * active + 2} y={padT - 4} width={band - 4} height={plotH - padT + 4} rx={6} fill="var(--bg-subtle)" />}
            {data.map((d, i) => {
              const dim = active !== null && active !== i ? 0.4 : 1
              const x0 = cx(i) - 1 - barW
              return (
                <g key={d.month} opacity={dim} style={{ transition: 'opacity 0.15s ease' }}>
                  <path d={barPath(x0, y(d.income), barW, y(0))} fill="var(--chart-income)" />
                  <path d={barPath(cx(i) + 1, y(d.expense), barW, y(0))} fill="var(--chart-expense)" />
                </g>
              )
            })}
            {data.map((d, i) => (
              <text key={d.month} x={cx(i)} y={plotH + 18} textAnchor="middle" fontSize={AXIS_FONT}
                fill={d.month === currentMonth || active === i ? 'var(--text-secondary)' : 'var(--chart-axis)'} fontWeight={d.month === currentMonth ? 600 : 400}>
                {monthShort(d.month)}
              </text>
            ))}
          </svg>
        )}
        {a && active !== null && (
          <Tip x={cx(active)} width={width}>
            <div className="ft-chart-tip__title">{monthLong(a.month)}</div>
            <TipRow color="var(--chart-income)" label={t('dashboard.monthly.income')} value={formatCurrency(a.income)} />
            <TipRow color="var(--chart-expense)" label={t('dashboard.monthly.expenses')} value={formatCurrency(a.expense)} />
            <TipRow strong label={t('dashboard.monthly.net')} value={<span style={{ color: a.income - a.expense < 0 ? 'var(--red)' : undefined }}>{formatSignedCurrency(a.income - a.expense)}</span>} />
          </Tip>
        )}
      </div>
    </div>
  )
}

// ── Saldo previsto para 30 dias (linha em degraus) ────────
export function CashflowChart({ points }: { points: ProjectionPoint[] }) {
  const { t } = useTranslation()
  const [boxRef, width] = useWidth<HTMLDivElement>()
  const { active, setActive, ref, onKeyDown } = useActiveIndex(points.length)

  const compact = width > 0 && width < 480
  const plotH = compact ? 150 : 176
  const axisH = 26
  const padT = 12
  const balances = points.map(p => p.balance)
  const minB = Math.min(...balances)
  const maxB = Math.max(...balances)
  const spread = maxB - minB || Math.max(Math.abs(maxB) * 0.1, 100)
  let lo = minB - spread * 0.35
  const hi = maxB + spread * 0.2
  if (minB >= 0 && lo < 0) lo = 0
  const ticks = niceTicks(lo, hi, 3)
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const tickLabels = ticks.map(axisMoney)
  const padL = gutterFor(tickLabels)
  const padR = 6
  const plotW = Math.max(0, width - padL - padR)
  const n = points.length - 1
  const x = (i: number) => padL + (n ? (plotW * i) / n : 0)
  const y = (v: number) => padT + (plotH - padT) * (1 - (v - yMin) / (yMax - yMin || 1))

  let line = `M${x(0)},${y(points[0]?.balance ?? 0)}`
  for (let i = 1; i < points.length; i++) line += `H${x(i)}V${y(points[i].balance)}`
  // Com saldo negativo no período, a área parte do zero e o trecho abaixo dele fica vermelho
  const zeroY = yMin < 0 ? y(0) : plotH
  const area = `${line}V${zeroY}H${x(0)}Z`
  const clip = 'ft-cf' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

  const minIndex = balances.indexOf(minB)
  const showMin = minIndex > 0 && minB < balances[0]
  const negative = minB < 0
  const lineColor = 'var(--chart-1)'

  const pick = (clientX: number, el: HTMLElement) => {
    if (!n || plotW <= 0) return
    const rel = (clientX - el.getBoundingClientRect().left - padL) / plotW
    setActive(Math.max(0, Math.min(n, Math.round(rel * n))))
  }

  const tickIdx = compact ? [0, 15, 30] : [0, 10, 20, 30]
  const a = active !== null ? points[active] : null
  // O valor do menor saldo já aparece acima do gráfico; aqui só a marca. Vira para a esquerda se não couber.
  const minLabel = t('dashboard.cashflow.lowest')
  const minLabelRight = x(minIndex) + 8 + minLabel.length * 6.4 > width - padR

  return (
    <div ref={ref} className="ft-chart" tabIndex={0} role="group" aria-label={t('dashboard.cashflow.keyboardHint')} onKeyDown={onKeyDown}
      onFocus={() => { if (active === null) setActive(0) }} onBlur={() => setActive(null)}>
      <div ref={boxRef} className="ft-chart__box" style={{ height: plotH + axisH }} data-chart="projecao"
        onPointerMove={e => pick(e.clientX, e.currentTarget)}
        onPointerDown={e => pick(e.clientX, e.currentTarget)}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
        {width > 0 && points.length > 1 && (
          <svg width={width} height={plotH + axisH} role="img"
            aria-label={t('dashboard.cashflow.a11y', { start: formatCurrency(points[0].balance), end: formatCurrency(points[n].balance), min: formatCurrency(minB), minDate: dayMonth(points[minIndex].date) })}>
            {ticks.map((v, i) => (
              <g key={v}>
                <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={v === 0 && negative ? 'var(--border-strong)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize={AXIS_FONT} fill="var(--chart-axis)" className="ft-num">{tickLabels[i]}</text>
              </g>
            ))}
            <defs>
              <clipPath id={`${clip}-pos`}><rect x={0} y={0} width={width} height={zeroY} /></clipPath>
              <clipPath id={`${clip}-neg`}><rect x={0} y={zeroY} width={width} height={Math.max(0, plotH - zeroY + 4)} /></clipPath>
            </defs>
            {[{ c: lineColor, id: 'pos' }, { c: 'var(--red)', id: 'neg' }].map(part => (
              <g key={part.id} clipPath={`url(#${clip}-${part.id})`}>
                <path d={area} fill={part.c} fillOpacity={0.09} />
                <path d={line} fill="none" stroke={part.c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={padT - 6} y2={plotH} stroke="var(--border-strong)" strokeWidth={1} shapeRendering="crispEdges" />
            )}
            <circle cx={x(0)} cy={y(points[0].balance)} r={4} fill={lineColor} stroke="var(--bg-card)" strokeWidth={2} />
            {showMin && (
              <>
                <circle cx={x(minIndex)} cy={y(minB)} r={4.5} fill={negative ? 'var(--red)' : 'var(--bg-card)'} stroke={negative ? 'var(--bg-card)' : lineColor} strokeWidth={2} />
                <text x={x(minIndex) + (minLabelRight ? -8 : 8)} y={Math.min(plotH - 6, y(minB) + 18)} textAnchor={minLabelRight ? 'end' : 'start'}
                  fontSize={AXIS_FONT} fill="var(--text-secondary)" fontWeight={500} stroke="var(--bg-card)" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">{minLabel}</text>
              </>
            )}
            <circle cx={x(n)} cy={y(points[n].balance)} r={4} fill={lineColor} stroke="var(--bg-card)" strokeWidth={2} />
            {active !== null && <circle cx={x(active)} cy={y(points[active].balance)} r={4.5} fill={lineColor} stroke="var(--bg-card)" strokeWidth={2} />}
            {tickIdx.map((i, k) => (
              <text key={i} x={x(i)} y={plotH + 18} fontSize={AXIS_FONT} fill={i === 0 ? 'var(--text-secondary)' : 'var(--chart-axis)'}
                textAnchor={k === 0 ? 'start' : k === tickIdx.length - 1 ? 'end' : 'middle'}>
                {i === 0 ? t('dashboard.cashflow.today') : dayMonth(points[i].date)}
              </text>
            ))}
          </svg>
        )}
        {a && active !== null && (
          <Tip x={x(active)} width={width}>
            <div className="ft-chart-tip__title">{active === 0 ? t('dashboard.cashflow.today') : weekdayDayMonth(a.date)}</div>
            <TipRow strong label={t('dashboard.cashflow.balance')} value={<span style={{ color: a.balance < 0 ? 'var(--red)' : undefined }}>{formatCurrency(a.balance)}</span>} />
            {a.events.slice(0, 3).map((e, i) => (
              <TipRow key={i} label={e.description} value={<span style={{ color: e.amount > 0 ? 'var(--green)' : 'var(--text-secondary)' }}>{formatSignedCurrency(e.amount)}</span>} />
            ))}
            {a.events.length > 3 && <div className="ft-chart-tip__more">{t('dashboard.cashflow.moreEvents', { count: a.events.length - 3 })}</div>}
          </Tip>
        )}
      </div>
    </div>
  )
}

// ── Minigráfico do patrimônio (12 meses) ──────────────────
export function Sparkline({ values, dates, label }: { values: number[]; dates: string[]; label: string }) {
  const { t } = useTranslation()
  const [boxRef, width] = useWidth<HTMLDivElement>()
  const { active, setActive, ref, onKeyDown } = useActiveIndex(values.length)
  const H = 64, padT = 6, padB = 6, padX = 5
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const n = values.length - 1
  const x = (i: number) => padX + (n ? ((width - padX * 2) * i) / n : 0)
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / range)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')
  const area = `${line}L${x(n)},${H}L${x(0)},${H}Z`

  const pick = (clientX: number, el: HTMLElement) => {
    if (!n || width <= 0) return
    const rel = (clientX - el.getBoundingClientRect().left - padX) / (width - padX * 2)
    setActive(Math.max(0, Math.min(n, Math.round(rel * n))))
  }
  const monthOf = (iso: string) => `${monthShort(iso.slice(0, 7))} ${iso.slice(0, 4)}`

  return (
    <div ref={ref} className="ft-chart" tabIndex={0} role="group" aria-label={t('dashboard.netWorth.keyboardHint')} onKeyDown={onKeyDown}
      onFocus={() => { if (active === null) setActive(n) }} onBlur={() => setActive(null)}>
      <div ref={boxRef} className="ft-chart__box" style={{ height: H }} data-chart="patrimonio"
        onPointerMove={e => pick(e.clientX, e.currentTarget)}
        onPointerDown={e => pick(e.clientX, e.currentTarget)}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
        {width > 0 && values.length > 1 && (
          <svg width={width} height={H} role="img" aria-label={label}>
            <path d={area} fill="var(--chart-neutral)" fillOpacity={0.1} />
            <path d={line} fill="none" stroke="var(--chart-neutral)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={H} stroke="var(--border-strong)" strokeWidth={1} shapeRendering="crispEdges" />}
            <circle cx={x(active ?? n)} cy={y(values[active ?? n])} r={4} fill="var(--chart-1)" stroke="var(--bg-card)" strokeWidth={2} />
          </svg>
        )}
        {active !== null && (
          <Tip x={x(active)} y={y(values[active])} width={width} above compact>
            <TipRow label={monthOf(dates[active])} value={formatCurrency(values[active])} />
          </Tip>
        )}
      </div>
      {dates.length > 1 && (
        <div className="ft-spark-axis" aria-hidden>
          <span>{monthOf(dates[0])}</span>
          <span>{monthOf(dates[dates.length - 1])}</span>
        </div>
      )}
    </div>
  )
}
