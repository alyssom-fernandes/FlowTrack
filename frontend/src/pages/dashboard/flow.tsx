// ── Fluxo do mês ──────────────────────────────────────────
// O que entrou no mês, à esquerda, se divide nas categorias de gasto e no que sobrou,
// à direita. É o primeiro bloco do painel: responde "para onde foi o dinheiro".
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/icons'
import { Money } from '../../components/ui'
import type { Category, Transaction } from '../../types'
import { currentLocale, formatCurrency, formatPercent } from '../../utils'

const HIDE_KEY = 'ft-hide-values'
import { CategoryIcon } from './CategoryIcon'
import type { FlowData, Node } from './flowData'
import { buildFlow } from './flowData'
import { DeltaChip } from './cards'
import { makeDelta, type Delta } from './data'
import './flow.css'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Conta do zero até o valor na primeira vez que aparece (uma vez só)
function useCountUp(target: number, ms = 750): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0))
  const done = useRef(reducedMotion())
  useEffect(() => {
    if (done.current) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms)
      setValue(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
      else done.current = true
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

// ── Geometria ─────────────────────────────────────────────
const NODE_W = 6
const LEAD_W = 22    // espaço do fio entre o nó e o rótulo
const GAP = 9       // espaço entre os destinos (as faixas não viram uma barra empilhada esticada)
const LABEL_H = 38   // altura reservada para cada rótulo à direita
const MIN_H = 3

function layout(nodes: Node[], height: number) {
  const total = nodes.reduce((s, n) => s + n.value, 0) || 1
  const usable = height - GAP * (nodes.length - 1)
  const hs = nodes.map(n => Math.max(MIN_H, (n.value / total) * usable))
  const scale = usable / hs.reduce((s, h) => s + h, 0)
  const heights = hs.map(h => h * scale)
  let y = 0
  const right = heights.map(h => { const r = { y, h }; y += h + GAP; return r })
  // À esquerda a barra é contínua (sem vãos) e centrada
  const stack = heights.reduce((s, h) => s + h, 0)
  let ly = (height - stack) / 2
  const left = heights.map(h => { const r = { y: ly, h }; ly += h; return r })
  // Rótulos: no centro do nó, empurrados para não se encostarem
  const centers = right.map(r => r.y + r.h / 2)
  const labels = centers.map(c => c - LABEL_H / 2)
  for (let i = 1; i < labels.length; i++) labels[i] = Math.max(labels[i], labels[i - 1] + LABEL_H)
  const overflow = labels.length ? labels[labels.length - 1] + LABEL_H - height : 0
  if (overflow > 0) {
    labels[labels.length - 1] -= overflow
    for (let i = labels.length - 2; i >= 0; i--) labels[i] = Math.min(labels[i], labels[i + 1] - LABEL_H)
  }
  return { left, right, labels: labels.map(l => Math.max(0, l)) }
}

// No desenho do fluxo as categorias perdem um pouco de saturação (a cor delas continua nos rótulos):
// o nó de Moradia, o maior, competia com o vinho da Sobra, que é o que o bloco quer mostrar.
// A paleta validada (--cat-*) não muda.
const bandColor = (n: Node) => (n.kind === 'category' ? `color-mix(in oklab, ${n.color} 58%, var(--chart-neutral))` : n.color)

function ribbon(x0: number, a: { y: number; h: number }, x1: number, b: { y: number; h: number }) {
  const mid = (x0 + x1) / 2
  return `M${x0},${a.y} C${mid},${a.y} ${mid},${b.y} ${x1},${b.y} L${x1},${b.y + b.h} C${mid},${b.y + b.h} ${mid},${a.y + a.h} ${x0},${a.y + a.h} Z`
}

// ── Diagrama (Dashboard e aba Fluxo de Relatórios) ────────
// Computador: faixas da barra do que entrou até cada destino, com os rótulos à direita (e as fontes
// de renda à esquerda quando há mais de uma). Estreito: uma barra de 100% e a lista.
const SOURCES_W = 168

export function FlowDiagram({ data, minHeight = 0, plotLabel, emptyText, showSources = false }: {
  data: FlowData; minHeight?: number; plotLabel: string; emptyText: string; showSources?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { income, expense, nodes, deficit, sources } = data
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [active, setActive] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const narrow = width > 0 && width < 520
  // No celular: as 3 maiores e o que sobrou; o resto atrás de "ver as outras"
  const byValue = nodes.filter(n => n.kind !== 'left').sort((a, b) => (a.kind === 'others' ? 1 : 0) - (b.kind === 'others' ? 1 : 0) || b.value - a.value)
  const topKeys = new Set(byValue.slice(0, 3).map(n => n.key))
  const listed = showAll ? [...byValue, ...nodes.filter(n => n.kind === 'left')] : [...byValue.filter(n => topKeys.has(n.key)), ...nodes.filter(n => n.kind === 'left')]
  // Conta categorias, não linhas: "Outras 6" escondida são 6 categorias
  const hiddenCount = byValue.filter(n => !topKeys.has(n.key)).reduce((s, n) => s + (n.kind === 'others' ? n.count ?? 1 : 1), 0)
  const height = Math.max(220, nodes.length * LABEL_H, minHeight)
  // De onde veio o dinheiro: rótulo e valor à esquerda da barra, também com uma fonte só
  // (sem ele a origem era uma barra branca sem nome). Coluna mais estreita no hero do Dashboard.
  const withSources = showSources && sources.length > 0 && width >= 600
  const leftW = withSources ? (width >= 760 ? SOURCES_W : 132) : 0
  const labelsW = Math.min(250, Math.max(190, width * 0.34))
  const plotW = Math.max(0, width - labelsW - leftW)
  const geo = useMemo(() => layout(nodes, height), [nodes, height])
  const total = income + deficit
  const pctOf = (v: number) => (income > 0 ? formatPercent((v / income) * 100, 0, false) : '')

  // Barra da esquerda: as fontes de renda empilhadas (e o que saiu do saldo, se faltou)
  const top = geo.left[0]?.y ?? 0
  const full = geo.left.reduce((s, r) => s + r.h, 0)
  const incomeH = total > 0 ? (income / total) * full : full
  const srcs = withSources ? sources : [{ key: 'all', label: '', value: income }]
  const srcGeo = srcs.reduce<(typeof srcs[number] & { y: number; h: number; shade: number })[]>((acc, src, i) => {
    const prev = acc[acc.length - 1]
    const h = income > 0 ? (src.value / income) * incomeH : 0
    return [...acc, { ...src, y: prev ? prev.y + prev.h : top, h, shade: 0.88 - i * 0.22 }]
  }, [])
  // Rótulos das fontes no centro de cada pedaço, afastados para não se encostarem
  // Nome e valor em duas linhas (~40 px) + 12 px de folga entre uma origem e a seguinte
  const SRC_LABEL_H = 52
  const srcLabelY = srcGeo.reduce<number[]>((acc, src) => [...acc, Math.max(src.y + src.h / 2, (acc[acc.length - 1] ?? -Infinity) + SRC_LABEL_H)], [])
  const srcOverflow = (srcLabelY[srcLabelY.length - 1] ?? 0) + SRC_LABEL_H / 2 - height
  if (srcOverflow > 0) for (let i = srcLabelY.length - 1; i >= 0; i--) srcLabelY[i] = Math.min(srcLabelY[i] - (i === srcLabelY.length - 1 ? srcOverflow : 0), i < srcLabelY.length - 1 ? srcLabelY[i + 1] - SRC_LABEL_H : Infinity)

  return (
    <div className="flow__body" ref={wrap}>
      {expense === 0 && income === 0 ? (
        <p className="flow__empty">{emptyText}</p>
      ) : narrow ? (
        <>
          <div className="flow__bar" role="img" aria-label={plotLabel}>
            {nodes.map((n, i) => (
              <span key={n.key} className={`flow__seg${n.kind === 'none' ? ' flow__seg--none' : ''}`}
                style={{ flexGrow: n.value, background: bandColor(n), '--i': i } as CSSProperties} />
            ))}
          </div>
          <ol className="flow__list">
            {listed.map((n, i) => <FlowLabel key={n.key} node={n} pct={pctOf(n.value)} index={i} active={active} setActive={setActive} />)}
          </ol>
          {hiddenCount > 0 && (
            <button type="button" className="flow__more" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
              {showAll ? t('dashboard.flow.showLess') : t('dashboard.flow.showMore', { count: hiddenCount })}
              <Icon name={showAll ? 'chevronUp' : 'chevronDown'} size={14} />
            </button>
          )}
        </>
      ) : width > 0 && (
        <div className="flow__plot" style={{ height }}>
          {withSources && (
            <ol className="flow__sources" style={{ width: leftW }} aria-label={t('dashboard.flow.sources')}>
              {srcGeo.map((src, i) => (
                <li key={src.key} className="flow-source" style={{ top: srcLabelY[i] }}>
                  <span className="flow-source__name">{src.label}</span>
                  <Money value={src.value} className="flow-source__value" />
                </li>
              ))}
            </ol>
          )}
          <svg width={plotW} height={height} className="flow__svg" style={{ left: leftW }} aria-hidden onMouseLeave={() => setActive(null)}>
            <defs>
              <pattern id="flow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--bg-card)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-hint)" strokeWidth="3" />
              </pattern>
            </defs>
            <g className="flow__source">
              {srcGeo.map(src => <rect key={src.key} x={0} y={src.y} width={NODE_W} height={Math.max(0, src.h - (withSources ? 2 : 0))} rx={3} fill="var(--text-primary)" opacity={src.shade} />)}
              {deficit > 0 && <rect x={0} y={top + incomeH} width={NODE_W} height={full - incomeH} rx={3} fill="url(#flow-hatch)" />}
            </g>
            {nodes.map((n, i) => {
              const dim = active && active !== n.key
              const href = n.href
              const nx = plotW - NODE_W - LEAD_W
              const cy = geo.right[i].y + geo.right[i].h / 2
              const fill = n.kind === 'none' ? 'url(#flow-hatch)' : bandColor(n)
              return (
                <g key={n.key} className="flow__link" style={{ opacity: dim ? 0.16 : 1, cursor: href ? 'pointer' : 'default' }}
                  onMouseEnter={() => setActive(n.key)} onClick={() => href && navigate(href)}>
                  <path d={ribbon(NODE_W, geo.left[i], nx, geo.right[i])} className="flow__ribbon"
                    style={{ fill, opacity: active === n.key ? 0.85 : n.kind === 'left' ? 0.72 : 'var(--flow-band-opacity)' }} />
                  <rect x={nx} y={geo.right[i].y} width={NODE_W} height={geo.right[i].h} rx={Math.min(3, geo.right[i].h / 2)} style={{ fill }} />
                  {/* Fio do nó até o rótulo (o rótulo pode ter sido empurrado para não encostar no vizinho) */}
                  <path d={`M${nx + NODE_W + 3},${cy} C${plotW - 8},${cy} ${plotW - 10},${geo.labels[i] + LABEL_H / 2} ${plotW - 2},${geo.labels[i] + LABEL_H / 2}`}
                    fill="none" stroke="var(--border-strong)" strokeWidth={1} />
                </g>
              )
            })}
          </svg>
          <ol className="flow__labels" style={{ width: labelsW }}>
            {nodes.map((n, i) => (
              <FlowLabel key={n.key} node={n} pct={pctOf(n.value)} index={i} active={active} setActive={setActive}
                style={{ top: geo.labels[i], height: LABEL_H }} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ── Primeiro bloco do Dashboard ───────────────────────────
export interface FlowHeroProps {
  transactions: Transaction[]
  categories: Category[]
  balance: number
  balanceDelta: Delta | null
  accountsCount: number
  prev: { income: number; expense: number } | null
  now: Date
}

export function FlowHero({ transactions, categories, balance, balanceDelta, accountsCount, prev, now }: FlowHeroProps) {
  const { t } = useTranslation()
  const flow = useMemo(() => buildFlow(transactions, categories, t), [transactions, categories, t])
  const { income, expense } = flow
  const net = income - expense
  const rate = income > 0 ? (net / income) * 100 : null

  // Altura da coluna do saldo quando as duas colunas ficam lado a lado: o fluxo ocupa a mesma altura
  // (antes ficava com ~230 px num cartão de ~460 e sobrava um vão embaixo)
  const section = useRef<HTMLElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const [sideH, setSideH] = useState(0)
  useLayoutEffect(() => {
    const sec = section.current, hd = head.current
    if (!sec || !hd) return
    const measure = () => {
      const body = sec.querySelector<HTMLElement>('.flow__body')
      setSideH(body && Math.abs(hd.offsetTop - body.offsetTop) < 4 ? Math.round(hd.getBoundingClientRect().height) : 0)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(sec)
    ro.observe(hd)
    return () => ro.disconnect()
  }, [])

  const balanceShown = useCountUp(balance)
  const [hidden, setHidden] = useState(() => document.documentElement.dataset.hideValues === 'true')
  const toggleHidden = () => {
    const next = !hidden
    setHidden(next)
    document.documentElement.dataset.hideValues = String(next)
    try { localStorage.setItem(HIDE_KEY, String(next)) } catch { /* ignora */ }
  }

  const monthName = new Intl.DateTimeFormat(currentLocale(), { month: 'long' }).format(now)
  const prevName = new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(new Date(now.getFullYear(), now.getMonth() - 1, 1)).replace('.', '')
  const day = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const sameDays = t('dashboard.flow.vsSameDays', { day, month: prevName, count: day })

  const stats = [
    { key: 'in', label: t('dashboard.flow.in'), value: income, d: makeDelta(income, prev?.income, true) },
    { key: 'out', label: t('dashboard.flow.out'), value: expense, d: makeDelta(expense, prev?.expense, false) },
    { key: 'net', label: net >= 0 ? t('dashboard.flow.left') : t('dashboard.flow.short'), value: Math.abs(net), d: makeDelta(net, prev ? prev.income - prev.expense : undefined, true), accent: false },
  ]

  const deltaChip = (d: Delta | null) => d && <DeltaChip d={d} className="flow-delta" />

  return (
    <section className="flow" aria-labelledby="flow-title" ref={section}>
      <div className="flow__head" ref={head}>
        <div>
          {/* Título simples (o traço de progresso embaixo parecia uma aba sozinha); o "dia X de Y" lembra
              que os números ainda vão crescer */}
          <h2 id="flow-title" className="flow__title">{t('dashboard.flow.title', { month: monthName, day })}
            <span className="flow__days ft-num">{t('dashboard.flow.ofDays', { count: daysInMonth })}</span></h2>
        </div>
        <div className="flow__balance">
          <span className="flow__balance-label">
            {t('dashboard.kpi.balance')}
            <button type="button" className="flow__eye" aria-pressed={hidden} onClick={toggleHidden}
              aria-label={hidden ? t('dashboard.flow.showValues') : t('dashboard.flow.hideValues')} title={hidden ? t('dashboard.flow.showValues') : t('dashboard.flow.hideValues')}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </span>
          <Money value={balanceShown} size="hero" className="flow__balance-value" style={balance < 0 ? { color: 'var(--red)' } : undefined} />
          <span className="flow__balance-foot">
            {balanceDelta ? <>{deltaChip(balanceDelta)}<span>{balanceDelta.ref}</span></> : <span>{t('dashboard.kpi.accounts', { count: accountsCount })}</span>}
          </span>
        </div>
        <dl className="flow__stats">
          {stats.map(s => (
            <div key={s.key} className={`flow__stat${s.accent ? ' flow__stat--accent' : ''}`}>
              <dt>{s.label}</dt>
              <dd><Money value={s.value} /></dd>
              <dd className="flow__stat-foot">
                {s.d && deltaChip(s.d)}
                {s.key === 'net' && rate !== null && rate >= 0 && <span>{t('dashboard.flow.rate', { pct: formatPercent(rate, 0, false) })}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {prev && <p className="flow__ref">{t('dashboard.flow.compared', { range: sameDays })}</p>}
      </div>

      <FlowDiagram data={flow} minHeight={sideH} showSources plotLabel={t('dashboard.flow.plotLabel')} emptyText={t('dashboard.flow.empty')} />
    </section>
  )
}

function FlowLabel({ node: n, pct, index, active, setActive, style }: {
  node: Node; pct: string; index: number; active: string | null; setActive: (k: string | null) => void; style?: CSSProperties
}) {
  const { t } = useTranslation()
  const dim = active && active !== n.key
  const content = (
    <>
      <span className={`flow-label__mark${n.kind === 'none' ? ' flow-label__mark--none' : ''}`} style={{ '--c': n.color } as CSSProperties}>
        {n.kind === 'category' ? <CategoryIcon name={n.icon} size={13} />
          : n.kind === 'left' ? <Icon name="piggy" size={13} />
          : n.kind === 'others' ? <Icon name="layers" size={13} /> : null}
      </span>
      <span className="flow-label__name">{n.label}</span>
      <Money value={n.value} className="flow-label__value" />
      {pct && <span className="flow-label__pct">{pct}</span>}
    </>
  )
  const common = {
    className: `flow-label${n.kind === 'left' ? ' flow-label--left' : ''}`,
    style: { ...style, opacity: dim ? 0.35 : 1, '--i': index } as CSSProperties,
    onMouseEnter: () => setActive(n.key), onMouseLeave: () => setActive(null),
    onFocus: () => setActive(n.key), onBlur: () => setActive(null),
  }
  return (
    <li {...common}>
      {n.href
        ? <Link to={n.href} className="flow-label__link" aria-label={t('dashboard.flow.see', { name: n.label, value: formatCurrency(n.value), pct })}>{content}</Link>
        : <div className="flow-label__link">{content}</div>}
    </li>
  )
}
