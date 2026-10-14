// ── Relatórios: gráficos (SVG feito à mão) ────────────────
// Cada gráfico é desenhado no tamanho real do contêiner (ResizeObserver),
// então o texto nunca distorce. Na impressão a largura vira a da folha A4.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/icons'
import { Money } from '../../components/ui'
import { formatPercent, formatMonth, currentLocale } from '../../utils'
import type { ProjectionData } from '../../types'
import { axisMoney, niceTicks, type Bucket, type Slice, type TopRow } from './dados'

// Largura útil de um gráfico numa folha A4 (186 mm de área menos o respiro do cartão)
const PRINT_WIDTH = 672

function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const print = window.matchMedia('print')
    const onMedia = () => flushSync(() => (print.matches ? setWidth(PRINT_WIDTH) : measure()))
    const before = () => flushSync(() => setWidth(PRINT_WIDTH))
    print.addEventListener('change', onMedia)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', measure)
    return () => {
      ro.disconnect()
      print.removeEventListener('change', onMedia)
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', measure)
    }
  }, [])
  return [ref, width] as const
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

// Barra com ponta arredondada (4px) e base reta
function barPath(x: number, top: number, w: number, h: number) {
  if (h <= 0.5 || w <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`
}

// ── Peças comuns ──────────────────────────────────────────
export function Delta({ value, goodWhenUp, kind = 'percent', compact }: { value: number | null; goodWhenUp: boolean; kind?: 'percent' | 'pp'; compact?: boolean }) {
  const { t } = useTranslation()
  if (value === null || !Number.isFinite(value)) return null
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  const tone = flat ? 'flat' : up === goodWhenUp ? 'good' : 'bad'
  const text = kind === 'pp' ? t('reports.kpi.pp', { value: formatPercent(Math.abs(value), 1, false).replace(/\s?%/, '') }) : formatPercent(Math.abs(value), Math.abs(value) >= 100 ? 0 : 1, false)
  const label = flat ? t('reports.delta.same') : t(up ? 'reports.delta.up' : 'reports.delta.down', { value: text })
  return (
    <span className={`rp-delta rp-delta--${tone}${compact ? ' rp-delta--compact' : ''}`} title={label} aria-label={label}>
      {!flat && <Icon name={up ? 'arrowUpRight' : 'arrowDownRight'} size={compact ? 12 : 14} strokeWidth={2} />}
      <span aria-hidden>{flat ? '0%' : text}</span>
    </span>
  )
}

export function Legend({ items }: { items: { label: string; color: string; faded?: boolean; line?: 'solid' | 'dashed' | 'band' }[] }) {
  return (
    <ul className="rp-legend">
      {items.map(i => (
        <li key={i.label}>
          {i.line
            ? <span className={`rp-legend__line rp-legend__line--${i.line}`} style={{ color: i.color }} aria-hidden />
            : <span className="rp-legend__swatch" style={{ background: i.color, opacity: i.faded ? 0.35 : 1 }} aria-hidden />}
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export function TipRow({ color, label, value, faded, strong }: { color?: string; label: string; value: number; faded?: boolean; strong?: boolean }) {
  return (
    <div className="rp-tip__row">
      {color ? <span className="rp-tip__key" style={{ background: color, opacity: faded ? 0.4 : 1 }} /> : <span className="rp-tip__key rp-tip__key--none" />}
      <span className="rp-tip__label">{label}</span>
      <Money value={value} className={`rp-tip__value${strong ? ' rp-tip__value--strong' : ''}`} />
    </div>
  )
}

// Dica posicionada ao lado do ponto ativo, sem sair do gráfico
function Tip({ x, top, width, gap, children, tipWidth = 208 }: { x: number; top: number; width: number; gap: number; children: ReactNode; tipWidth?: number }) {
  let left: number
  if (x + gap + tipWidth <= width) left = x + gap
  else if (x - gap - tipWidth >= 0) left = x - gap - tipWidth
  else left = clamp(x - tipWidth / 2, 0, Math.max(0, width - tipWidth))
  return <div className="rp-tip" style={{ left, top, width: tipWidth }} role="presentation">{children}</div>
}

// ── Receitas × gastos por mês/semana ──────────────────────
export function FlowBars({ buckets, prev, ariaLabel }: { buckets: Bucket[]; prev?: Bucket[]; ariaLabel: string }) {
  const { t } = useTranslation()
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const compact = width > 0 && width < 560
  const H = compact ? 210 : 248
  const n = buckets.length
  const values = [...buckets.flatMap(b => [b.income, b.expense]), ...(prev ?? []).flatMap(b => [b.income, b.expense])]
  const ticks = niceTicks(Math.max(0, ...values))
  const yMax = ticks[ticks.length - 1] || 1
  const tickLabels = ticks.map(axisMoney)
  const hasYear = buckets.some(b => b.yearMark)
  const m = { top: 10, right: 2, bottom: hasYear ? 40 : 26, left: Math.max(...tickLabels.map(l => l.length)) * 6.2 + 12 }
  const plotW = Math.max(0, width - m.left - m.right)
  const plotH = H - m.top - m.bottom
  const band = plotW / Math.max(n, 1)
  const per = prev ? 4 : 2
  const gap = 2
  const pairGap = prev ? 5 : 0
  const barW = clamp((band * (compact ? 0.78 : 0.7) - gap * (per - 1) - pairGap) / per, 2, prev ? 16 : 24)
  const groupW = barW * per + gap * (per - 1) + pairGap
  const y = (v: number) => m.top + plotH - (v / yMax) * plotH
  const labelW = buckets[0]?.key.length === 10 ? 44 : 30
  const every = Math.max(1, Math.ceil(labelW / Math.max(band, 1)))

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - m.left) / band)
    setActive(i >= 0 && i < n ? i : null)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive(a => clamp((a ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1))
    } else if (e.key === 'Escape') setActive(null)
  }

  const bars: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const b = buckets[i], p = prev?.[i]
    const items: { v: number; color: string; faded?: boolean }[] = prev
      ? [{ v: p?.income ?? 0, color: 'var(--chart-income)', faded: true }, { v: b.income, color: 'var(--chart-income)' }, { v: p?.expense ?? 0, color: 'var(--chart-spend)', faded: true }, { v: b.expense, color: 'var(--chart-spend)' }]
      : [{ v: b.income, color: 'var(--chart-income)' }, { v: b.expense, color: 'var(--chart-spend)' }]
    for (let j = 0, x = m.left + i * band + (band - groupW) / 2; j < items.length; j++) {
      const it = items[j]
      const top = y(it.v)
      const d = barPath(x, top, barW, m.top + plotH - top)
      if (d) bars.push(<path key={`${i}-${j}`} d={d} fill={it.color} opacity={it.faded ? 0.35 : 1} />)
      x += barW + gap + (prev && j === 1 ? pairGap : 0)
    }
  }

  // No celular a leitura fica num painel abaixo do gráfico (padrão: último período já iniciado)
  const lastStarted = buckets.reduce((acc, b, i) => (b.future ? acc : i), n - 1)
  const shown = active ?? (compact ? lastStarted : null)
  const a = shown !== null ? buckets[shown] : null
  const ap = shown !== null ? prev?.[shown] : undefined
  const readout = a && (
    <>
      <div className="rp-tip__title">{a.longLabel}</div>
      <TipRow color="var(--chart-income)" label={t('reports.legend.income')} value={a.income} strong />
      <TipRow color="var(--chart-spend)" label={t('reports.legend.expense')} value={a.expense} strong />
      <TipRow label={t('reports.legend.balance')} value={a.income - a.expense} />
      {prev && (
        <>
          <div className="rp-tip__title rp-tip__title--sub">{ap ? ap.longLabel : t('reports.legend.previous')}</div>
          <TipRow color="var(--chart-income)" faded label={t('reports.legend.income')} value={ap?.income ?? 0} />
          <TipRow color="var(--chart-spend)" faded label={t('reports.legend.expense')} value={ap?.expense ?? 0} />
        </>
      )}
    </>
  )

  return (
    <>
      <div ref={ref} className="rp-chart" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel} tabIndex={0}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={e => { if (e.pointerType !== 'touch') setActive(null) }}
            onKeyDown={onKey} onBlur={() => setActive(null)} className="rp-svg">
            {ticks.map((tk, i) => (
              <g key={tk}>
                <line x1={m.left} x2={width - m.right} y1={y(tk)} y2={y(tk)} stroke={i === 0 ? 'var(--border-strong)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={m.left - 8} y={y(tk)} dy="0.32em" textAnchor="end" className="rp-axis">{tickLabels[i]}</text>
              </g>
            ))}
            {active !== null && <rect x={m.left + active * band + 1} y={m.top} width={band - 2} height={plotH} rx={4} fill="var(--chart-grid)" />}
            {bars}
            {buckets.map((b, i) => i % every === 0 ? (
              <g key={b.key}>
                <text x={m.left + (i + 0.5) * band} y={m.top + plotH + 16} textAnchor="middle" className={`rp-axis${shown === i ? ' rp-axis--active' : b.future ? ' rp-axis--future' : ''}`}>{b.label}</text>
                {b.yearMark && <text x={m.left + (i + 0.5) * band} y={m.top + plotH + 30} textAnchor="middle" className="rp-axis rp-axis--year">{b.yearMark}</text>}
              </g>
            ) : null)}
          </svg>
        )}
        {!compact && active !== null && readout && (
          <Tip x={m.left + (active + 0.5) * band} top={m.top} width={width} gap={groupW / 2 + 8} tipWidth={prev ? 220 : 200}>{readout}</Tip>
        )}
      </div>
      {compact && readout && <div className="rp-readout">{readout}</div>}
    </>
  )
}

// ── Gastos por categoria (rosca + legenda com valores) ────
export function CategoryDonut({ slices, total, compare, ariaLabel }: { slices: Slice[]; total: number; compare: boolean; ariaLabel: string }) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const cur = active !== null ? slices[active] : null

  return (
    <div className={`rp-donut${compare ? ' rp-donut--compare' : ''}`}>
      {/* Barra empilhada: comparar por comprimento é mais fácil que por ângulo (sem rosca) */}
      <div className="rp-stack">
        <div className="rp-stack__total" aria-hidden>
          <span className="rp-stack__label">{cur ? cur.name : t('reports.categories.total')}</span>
          <Money value={cur ? cur.value : total} compact className="rp-stack__value" />
          {cur && <span className="rp-stack__share ft-num">{formatPercent(cur.share, 1, false)}</span>}
        </div>
        <div className="rp-stack__bar" role="img" aria-label={ariaLabel}>
          {slices.map((sl, i) => (
            <span key={sl.key} className="rp-stack__seg" style={{ flexGrow: Math.max(sl.value, total * 0.004), background: sl.color, opacity: active !== null && active !== i ? 0.32 : 1 }}
              onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} />
          ))}
        </div>
      </div>
      <ul className="rp-cat-list">
        {slices.map((sl, i) => (
          <li key={sl.key}>
            {sl.children ? (
              <button type="button" className={`rp-cat-row rp-cat-row--btn${active === i ? ' is-active' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}
                onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
                <CatRowBody sl={sl} compare={compare} name={<>{sl.name}<Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} className="rp-cat-row__chev" /></>} />
              </button>
            ) : (
              <div className={`rp-cat-row${active === i ? ' is-active' : ''}`} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
                <CatRowBody sl={sl} compare={compare} name={sl.name} />
              </div>
            )}
            {sl.children && open && (
              <ul className="rp-cat-sub">
                {sl.children.map(c => (
                  <li key={c.id} className="rp-cat-row rp-cat-row--sub">
                    <CatRowBody sl={{ key: c.id, name: c.name, value: c.value, share: c.share, color: 'transparent', prev: c.prev, change: c.change }} compare={compare} name={c.name} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CatRowBody({ sl, compare, name }: { sl: Slice; compare: boolean; name: ReactNode }) {
  const { t } = useTranslation()
  return (
    <>
      <span className="rp-cat-row__swatch" style={{ background: sl.color }} aria-hidden />
      <span className="rp-cat-row__name">{name}</span>
      {compare && (
        <span className="rp-cat-row__delta">
          {sl.prev > 0 ? <Delta value={sl.change} goodWhenUp={false} compact /> : <span className="rp-cat-row__muted">{t('reports.categories.new')}</span>}
        </span>
      )}
      <span className="rp-cat-row__share ft-num">{formatPercent(sl.share, sl.share < 10 ? 1 : 0, false)}</span>
      <Money value={sl.value} className="rp-cat-row__value" />
    </>
  )
}

// ── Maiores gastos ────────────────────────────────────────
export function TopList({ rows }: { rows: TopRow[] }) {
  const { t } = useTranslation()
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <ol className="rp-top">
      {rows.map((r, i) => (
        <li key={r.key} className="rp-top__row">
          <span className="rp-top__rank ft-num" aria-hidden>{i + 1}</span>
          <div className="rp-top__main">
            <div className="rp-top__line">
              <span className="rp-top__desc" title={r.description}>{r.description}</span>
              <Money value={r.value} className="rp-top__value" />
            </div>
            <div className="rp-top__bar" aria-hidden><span style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
            <div className="rp-top__meta">
              <span>{r.category} · {t('reports.top.count', { count: r.count })}</span>
              <span className="ft-num">{t('reports.top.share', { value: formatPercent(r.share, 1, false) })}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Projeção (histórico sólido, projeção tracejada) ───────
export function ProjectionLines({ data, ariaLabel }: { data: ProjectionData; ariaLabel: string }) {
  const { t } = useTranslation()
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const pts = [...data.history, ...data.projections]
  const h = data.history.length
  const n = pts.length
  const compact = width > 0 && width < 560
  const H = compact ? 220 : 256

  // Faixa provável: oscilação típica (desvio padrão) do histórico, abrindo com a distância
  const sd = (arr: number[]) => {
    if (arr.length < 2) return (arr[0] ?? 0) * 0.15
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length
    return Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1))
  }
  const sdInc = sd(data.history.map(p => p.income)), sdExp = sd(data.history.map(p => p.expense))
  const band = (i: number, s: number) => (i < h ? 0 : s * Math.sqrt(i - h + 1))

  const top = Math.max(1, ...pts.map((p, i) => Math.max(p.income + band(i, sdInc), p.expense + band(i, sdExp))))
  const ticks = niceTicks(top)
  const yMax = ticks[ticks.length - 1] || 1
  const tickLabels = ticks.map(axisMoney)
  const yearOf = (k: string) => k.slice(0, 4)
  const multiYear = pts.length > 0 && yearOf(pts[0].month) !== yearOf(pts[n - 1].month)
  const m = { top: 22, right: compact ? 12 : 76, bottom: multiYear ? 40 : 26, left: Math.max(...tickLabels.map(l => l.length)) * 6.2 + 12 }
  const plotW = Math.max(0, width - m.left - m.right)
  const plotH = H - m.top - m.bottom
  const step = plotW / Math.max(n, 1)
  const x = (i: number) => m.left + (i + 0.5) * step
  const y = (v: number) => m.top + plotH - (Math.max(0, v) / yMax) * plotH
  const line = (key: 'income' | 'expense', from: number, to: number) => pts.slice(from, to + 1).map((p, j) => `${j ? 'L' : 'M'}${x(from + j)},${y(p[key])}`).join('')
  const area = (key: 'income' | 'expense', s: number) => {
    if (h === 0 || n === h) return ''
    const idx = Array.from({ length: n - h + 1 }, (_, j) => h - 1 + j)
    const up = idx.map(i => `${x(i)},${y(pts[i][key] + band(i, s))}`)
    const down = idx.slice().reverse().map(i => `${x(i)},${y(pts[i][key] - band(i, s))}`)
    return `M${up.join('L')}L${down.join('L')}Z`
  }
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase(currentLocale()) + s.slice(1)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - m.left) / step)
    setActive(i >= 0 && i < n ? i : null)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive(a => clamp((a ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1))
    } else if (e.key === 'Escape') setActive(null)
  }

  const last = pts[n - 1]
  const endInc = last ? y(last.income) : 0, endExp = last ? y(last.expense) : 0
  const endLabels = !compact && last && Math.abs(endInc - endExp) >= 14
  const shown = active ?? (compact && n ? (n > h ? h : n - 1) : null)
  const ap = shown !== null ? pts[shown] : null
  const every = Math.max(1, Math.ceil(30 / Math.max(step, 1)))
  const zoneX = h > 0 && n > h ? m.left + h * step : null

  const readout = ap && (
    <>
      <div className="rp-tip__title">{cap(formatMonth(ap.month, 'long'))}{ap.is_projection && <span className="rp-tip__tag">{t('reports.projection.projected')}</span>}</div>
      <TipRow color="var(--chart-income)" label={t('reports.legend.income')} value={ap.income} strong />
      <TipRow color="var(--chart-spend)" label={t('reports.legend.expense')} value={ap.expense} strong />
      <TipRow label={t('reports.legend.balance')} value={ap.income - ap.expense} />
    </>
  )

  return (
    <>
      <div ref={ref} className="rp-chart" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel} tabIndex={0} className="rp-svg"
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={e => { if (e.pointerType !== 'touch') setActive(null) }} onKeyDown={onKey} onBlur={() => setActive(null)}>
            {zoneX !== null && (
              <g>
                <rect x={zoneX} y={m.top - 14} width={width - m.right - zoneX + (compact ? m.right : 0)} height={plotH + 14} fill="var(--bg-subtle)" rx={6} />
                <text x={zoneX + 8} y={m.top - 3} className="rp-axis rp-axis--zone">{t('reports.projection.zone')}</text>
              </g>
            )}
            {ticks.map((tk, i) => (
              <g key={tk}>
                <line x1={m.left} x2={width - m.right} y1={y(tk)} y2={y(tk)} stroke={i === 0 ? 'var(--border-strong)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={m.left - 8} y={y(tk)} dy="0.32em" textAnchor="end" className="rp-axis">{tickLabels[i]}</text>
              </g>
            ))}
            <path d={area('income', sdInc)} fill="var(--chart-income)" opacity={0.12} />
            <path d={area('expense', sdExp)} fill="var(--chart-spend)" opacity={0.12} />
            {active !== null && <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + plotH} stroke="var(--border-strong)" strokeWidth={1} />}
            {(['income', 'expense'] as const).map(k => {
              const color = k === 'income' ? 'var(--chart-income)' : 'var(--chart-spend)'
              return (
                <g key={k}>
                  {h > 0 && <path d={line(k, 0, h - 1)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                  {n > h && <path d={line(k, Math.max(0, h - 1), n - 1)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
                  {h > 0 && <circle cx={x(h - 1)} cy={y(pts[h - 1][k])} r={4} fill={color} stroke="var(--bg-card)" strokeWidth={2} />}
                  {active !== null && <circle cx={x(active)} cy={y(pts[active][k])} r={4.5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />}
                </g>
              )
            })}
            {endLabels && (
              <>
                <text x={x(n - 1) + 10} y={endInc} dy="0.32em" className="rp-end-label">{t('reports.legend.income')}</text>
                <text x={x(n - 1) + 10} y={endExp} dy="0.32em" className="rp-end-label">{t('reports.legend.expense')}</text>
              </>
            )}
            {pts.map((p, i) => (i % every === 0 ? (
              <g key={p.month}>
                <text x={x(i)} y={m.top + plotH + 16} textAnchor="middle" className={`rp-axis${shown === i ? ' rp-axis--active' : ''}`}>{cap(formatMonth(p.month, 'short'))}</text>
                {multiYear && (i === 0 || p.month.endsWith('-01')) && <text x={x(i)} y={m.top + plotH + 30} textAnchor="middle" className="rp-axis rp-axis--year">{yearOf(p.month)}</text>}
              </g>
            ) : null))}
          </svg>
        )}
        {!compact && active !== null && ap && (
          <Tip x={x(active)} top={m.top} width={width} gap={12} tipWidth={212}>{readout}</Tip>
        )}
      </div>
      {compact && readout && <div className="rp-readout">{readout}</div>}
    </>
  )
}

// ── Tabela (vira lista no celular) ────────────────────────
export interface Column<T> { key: string; header: string; align?: 'left' | 'right'; render: (row: T) => ReactNode; primary?: boolean; title?: boolean; hideMobile?: boolean }

const cellClass = <T,>(c: Column<T>) => [c.align === 'right' ? 'is-right' : '', c.primary ? 'is-primary' : '', c.title ? 'is-title' : '', c.hideMobile ? 'is-hide-mobile' : ''].filter(Boolean).join(' ') || undefined

// listBelow: abaixo dessa largura (px) do cartão a tabela vira lista
export function ReportTable<T>({ columns, rows, rowKey, totals, caption, listBelow = 520 }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; totals?: ReactNode[]; caption: string; listBelow?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [list, setList] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setList(el.clientWidth < listBelow)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [listBelow])
  return (
    <div ref={ref} className={`rp-table-wrap${list ? ' rp-table-wrap--list' : ''}`}>
      <table className="rp-table">
        <caption className="rp-sr">{caption}</caption>
        <thead>
          <tr>{columns.map(c => <th key={c.key} scope="col" className={cellClass(c)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)}>
              {columns.map(c => (
                <td key={c.key} data-label={c.header} className={cellClass(c)}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>{totals.map((v, i) => <td key={columns[i].key} data-label={columns[i].header} className={cellClass(columns[i])}>{v}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
