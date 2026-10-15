// Cartão principal de Investimentos: valor atual grande, resultado sobre o investido,
// evolução mês a mês (área) e períodos em pílula. Substitui os 3 cartões iguais.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Money } from '../../components/ui'
import { Icon } from '../../components/icons'
import { netWorthService } from '../../services'
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../utils'
import { monthShort } from '../dashboard/data'
import type { NetWorthSnapshot } from '../../types'

type Range = '3m' | '6m' | '1y' | 'all'
const RANGES: Range[] = ['3m', '6m', '1y', 'all']
const H = 96

// top: a maior posição pelo valor atual (nome e fatia da carteira, 0–100)
export function HoldingsHero({ invested, current, top }: { invested: number; current: number; top: { name: string; share: number } | null }) {
  const { t } = useTranslation()
  const [snaps, setSnaps] = useState<NetWorthSnapshot[] | null>(null)
  const [range, setRange] = useState<Range>('1y')
  useEffect(() => {
    let alive = true
    netWorthService.get().then(r => { if (alive) setSnaps(r.snapshots || []) }).catch(() => { if (alive) setSnaps([]) })
    return () => { alive = false }
  }, [])

  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [snaps])

  const series = useMemo(() => {
    const all = (snaps ?? []).map(s => ({ date: s.date, value: s.total_investments }))
    if (all.length) all[all.length - 1] = { ...all[all.length - 1], value: current }
    const n = range === '3m' ? 3 : range === '6m' ? 6 : range === '1y' ? 12 : all.length
    return all.slice(-n)
  }, [snaps, range, current])

  const profit = current - invested
  const pct = invested > 0 ? (profit / invested) * 100 : 0
  const first = series[0]?.value
  const periodChange = first ? current - first : null
  const tone = profit >= 0 ? 'good' : 'bad'

  const w = width
  let line = '', area = ''
  if (series.length > 1 && w > 0) {
    const vals = series.map(s => s.value)
    const lo = Math.min(...vals) * 0.98, hi = Math.max(...vals) * 1.02 || 1
    const x = (i: number) => (i / (series.length - 1)) * w
    const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12)
    line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ')
    area = `${line} L${w},${H} L0,${H} Z`
  }
  // Mesmo rótulo do eixo do Patrimônio no Dashboard: "Nov 2025 … Out 2026"
  const monthOf = (iso: string) => `${monthShort(iso.slice(0, 7))} ${iso.slice(0, 4)}`

  return (
    <Card className="inv-hero ft-card--hero">
      <div className="inv-hero__head">
        <div>
          <span className="inv-kpi__label">{t('investments.kpi.current')}</span>
          <Money value={current} size="hero" className="inv-hero__value" />
          <span className={`inv-hero__delta inv-hero__delta--${tone}`}>
            <Icon name={profit >= 0 ? 'arrowUpRight' : 'arrowDownRight'} size={14} strokeWidth={2.25} />
            {t('investments.hero.result', { value: formatSignedCurrency(profit), pct: formatPercent(pct, 1, true) })}
          </span>
        </div>
        <dl className="inv-hero__facts">
          <div><dt>{t('investments.kpi.invested')}</dt><dd><Money value={invested} /></dd></div>
          {top && (
            <div className="inv-hero__top">
              <dt>{t('investments.hero.top')}</dt>
              <dd><span className="inv-hero__top-name" title={top.name}>{top.name}</span><span className="inv-hero__top-share ft-num">{formatPercent(top.share, 1, false)}</span></dd>
            </div>
          )}
        </dl>
      </div>
      {series.length > 1 && (
        <>
          <div className="inv-hero__chart" ref={wrap}>
            {w > 0 && (
              <svg width={w} height={H} role="img" aria-label={t('investments.hero.a11y', { from: formatCurrency(series[0].value), to: formatCurrency(current), count: series.length })}>
                <path d={area} fill="var(--accent-ink)" fillOpacity={0.1} />
                <path d={line} fill="none" stroke="var(--accent-ink)" strokeWidth={2} strokeLinejoin="round" pathLength={1} className="inv-hero__line" />
              </svg>
            )}
          </div>
          <div className="inv-hero__axis ft-num" aria-hidden>
            <span>{monthOf(series[0].date)}</span>
            <span>{monthOf(series[series.length - 1].date)}</span>
          </div>
          {/* Frase do período à esquerda e chips à direita; no celular os chips vêm antes, em largura total */}
          <div className="inv-hero__foot">
            {periodChange !== null && <span className="inv-hero__period ft-num">{t('investments.hero.inPeriod', { value: formatSignedCurrency(periodChange) })}</span>}
            <div className="inv-hero__ranges" role="group" aria-label={t('investments.hero.range')}>
              {RANGES.map(r => (
                <button key={r} type="button" className="inv-hero__range" aria-pressed={range === r} onClick={() => setRange(r)}>{t(`investments.hero.ranges.${r}`)}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
