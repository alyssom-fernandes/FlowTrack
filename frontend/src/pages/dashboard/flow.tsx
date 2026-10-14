// ── Fluxo do mês ──────────────────────────────────────────
// O que entrou no mês, à esquerda, se divide nas categorias de gasto e no que sobrou,
// à direita. É o primeiro bloco do painel: responde "para onde foi o dinheiro".
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../../components/icons'
import { Money } from '../../components/ui'
import type { Category, Transaction } from '../../types'
import { categoryColor, categoryRank } from '../../lib/categoryColor'
import { categoryLabel, currentLocale, formatCurrency, formatPercent } from '../../utils'

const HIDE_KEY = 'ft-hide-values'
import { CategoryIcon } from './CategoryIcon'
import type { Delta } from './cards'

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

// ── Dados ─────────────────────────────────────────────────
type Node = { key: string; label: string; value: number; color: string; icon?: string; href?: string; kind: 'category' | 'none' | 'others' | 'left' }

const MAX_NODES = 8

function buildNodes(transactions: Transaction[], categories: Category[], t: (k: string, o?: Record<string, unknown>) => string) {
  const flows = transactions.filter(tx => tx.type !== 'transfer')
  const income = flows.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0)
  const byCat = new Map<string, number>()
  for (const tx of flows) if (tx.amount < 0) byCat.set(tx.category_id || 'none', (byCat.get(tx.category_id || 'none') || 0) - tx.amount)
  const expense = [...byCat.values()].reduce((s, v) => s + v, 0)

  let nodes: Node[] = [...byCat.entries()].map(([id, value]) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return { key: 'none', label: t('dashboard.flow.uncategorized'), value, color: 'var(--text-hint)', kind: 'none' as const, href: '/transactions?category_id=none&period=this_month' }
    return { key: cat.id, label: categoryLabel(cat), value, color: categoryColor(cat), icon: cat.icon, kind: 'category' as const, href: `/transactions?category_id=${cat.id}&period=this_month` }
  })
  // Fiapos não ajudam: categorias com menos de 3% do total (e a "Outros") viram um nó só, em cinza.
  // Com muitas categorias, as menores também entram nele.
  const base = Math.max(income, expense) || 1
  const isOutros = (n: Node) => n.kind === 'category' && categories.find(c => c.id === n.key)?.name === 'Outros'
  const small = (n: Node) => n.kind === 'category' && (n.value / base < 0.03 || isOutros(n))
  let rest = nodes.filter(small)
  let keep = nodes.filter(n => !small(n))
  if (keep.length > MAX_NODES - 1) {
    const sorted = [...keep].sort((a, b) => b.value - a.value)
    rest = [...rest, ...sorted.slice(MAX_NODES - 1)]
    keep = sorted.slice(0, MAX_NODES - 1)
  }
  if (rest.length === 1) keep.push(rest[0])
  else if (rest.length > 1) keep.push({ key: 'others', label: t('dashboard.flow.others', { count: rest.length }), value: rest.reduce((s, n) => s + n.value, 0), color: 'var(--cat-other)', kind: 'others' })
  nodes = keep
  // Ordem fixa (a das cores validadas), sem categoria e "Outras" no fim
  const rank = (n: Node) => n.kind === 'none' ? 2000 : n.kind === 'others' ? 1500 : categoryRank(categories.find(c => c.id === n.key))
  nodes.sort((a, b) => rank(a) - rank(b))

  const left = income - expense
  if (left > 0) nodes.push({ key: 'left', label: t('dashboard.flow.left'), value: left, color: 'var(--accent)', kind: 'left' })
  return { income, expense, nodes, deficit: Math.max(0, -left) }
}

// ── Geometria ─────────────────────────────────────────────
const NODE_W = 6
const LEAD_W = 22    // espaço do fio entre o nó e o rótulo
const GAP = 4
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

function ribbon(x0: number, a: { y: number; h: number }, x1: number, b: { y: number; h: number }) {
  const mid = (x0 + x1) / 2
  return `M${x0},${a.y} C${mid},${a.y} ${mid},${b.y} ${x1},${b.y} L${x1},${b.y + b.h} C${mid},${b.y + b.h} ${mid},${a.y + a.h} ${x0},${a.y + a.h} Z`
}

// ── Componente ────────────────────────────────────────────
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
  const navigate = useNavigate()
  const { income, expense, nodes, deficit } = useMemo(() => buildNodes(transactions, categories, t), [transactions, categories, t])
  const net = income - expense
  const rate = income > 0 ? (net / income) * 100 : null

  const wrap = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // Altura da coluna do saldo quando as duas colunas ficam lado a lado: o fluxo ocupa a mesma altura
  // (antes ficava com ~230 px num cartão de ~460 e sobrava um vão embaixo)
  const [sideH, setSideH] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current, hd = head.current
    if (!el || !hd) return
    const measure = () => {
      setWidth(Math.round(el.getBoundingClientRect().width))
      setSideH(Math.abs(hd.offsetTop - el.offsetTop) < 4 ? Math.round(hd.getBoundingClientRect().height) : 0)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(hd)
    return () => ro.disconnect()
  }, [])

  const [active, setActive] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
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

  const delta = (cur: number, before: number | undefined, upIsGood: boolean) => {
    if (!before) return null
    const pct = ((cur - before) / Math.abs(before)) * 100
    const dir = Math.abs(pct) < 0.05 ? 'flat' : pct > 0 ? 'up' : 'down'
    const tone = dir === 'flat' ? 'neutral' : (dir === 'up') === upIsGood ? 'good' : 'bad'
    return { text: formatPercent(pct, 1), dir, tone } as const
  }
  const stats = [
    { key: 'in', label: t('dashboard.flow.in'), value: income, d: delta(income, prev?.income, true) },
    { key: 'out', label: t('dashboard.flow.out'), value: expense, d: delta(expense, prev?.expense, false) },
    { key: 'net', label: net >= 0 ? t('dashboard.flow.left') : t('dashboard.flow.short'), value: Math.abs(net), d: delta(net, prev ? prev.income - prev.expense : undefined, true), accent: false },
  ]

  const narrow = width > 0 && width < 520
  // No celular: as 3 maiores e o que sobrou; o resto atrás de "ver as outras"
  const byValue = nodes.filter(n => n.kind !== 'left').sort((a, b) => (a.kind === 'others' ? 1 : 0) - (b.kind === 'others' ? 1 : 0) || b.value - a.value)
  const topKeys = new Set(byValue.slice(0, 3).map(n => n.key))
  const listed = showAll ? [...byValue, ...nodes.filter(n => n.kind === 'left')] : [...byValue.filter(n => topKeys.has(n.key)), ...nodes.filter(n => n.kind === 'left')]
  const hiddenCount = byValue.length - Math.min(3, byValue.length)
  const height = Math.max(220, nodes.length * LABEL_H, sideH)
  const labelsW = Math.min(250, Math.max(190, width * 0.34))
  const plotW = Math.max(0, width - labelsW)
  const geo = useMemo(() => layout(nodes, height), [nodes, height])
  const total = income + deficit
  const pctOf = (v: number) => (income > 0 ? formatPercent((v / income) * 100, 0, false) : '')

  const deltaChip = (d: { text: string; dir: string; tone: string } | null) => d && (
    <span className={`flow-delta flow-delta--${d.tone}`}>
      <Icon name={(d.dir === 'up' ? 'arrowUpRight' : d.dir === 'down' ? 'arrowDownRight' : 'minus') as IconName} size={12} strokeWidth={2.25} />{d.text}
    </span>
  )

  return (
    <section className="flow" aria-labelledby="flow-title">
      <div className="flow__head" ref={head}>
        <div>
          <h2 id="flow-title" className="flow__title">{t('dashboard.flow.title', { month: monthName, day })}</h2>
          {/* Quanto do mês já passou: lembra que os números ainda vão crescer */}
          <div className="flow__month" aria-hidden><span style={{ width: `${(day / daysInMonth) * 100}%` }} /></div>
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

      <div className="flow__body" ref={wrap}>
        {expense === 0 && income === 0 ? (
          <p className="flow__empty">{t('dashboard.flow.empty')}</p>
        ) : narrow ? (
          // Celular: uma barra de 100% e a lista logo abaixo
          <>
            <div className="flow__bar" role="img" aria-label={t('dashboard.flow.plotLabel')}>
              {nodes.map((n, i) => (
                <span key={n.key} className={`flow__seg${n.kind === 'none' ? ' flow__seg--none' : ''}`}
                  style={{ flexGrow: n.value, background: n.color, '--i': i } as CSSProperties} />
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
            <svg width={plotW} height={height} className="flow__svg" aria-hidden onMouseLeave={() => setActive(null)}>
              <defs>
                <pattern id="flow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--bg-card)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-hint)" strokeWidth="3" />
                </pattern>
              </defs>
              {/* Barra da esquerda: o que entrou (e o que saiu do saldo, se faltou) */}
              {(() => {
                const top = geo.left[0]?.y ?? 0
                const full = geo.left.reduce((s, r) => s + r.h, 0)
                const incomeH = total > 0 ? (income / total) * full : full
                return (
                  <g className="flow__source">
                    <rect x={0} y={top} width={NODE_W} height={incomeH} rx={3} fill="var(--text-primary)" opacity={0.88} />
                    {deficit > 0 && <rect x={0} y={top + incomeH} width={NODE_W} height={full - incomeH} rx={3} fill="url(#flow-hatch)" />}
                  </g>
                )
              })()}
              {nodes.map((n, i) => {
                const dim = active && active !== n.key
                const href = n.href
                const nx = plotW - NODE_W - LEAD_W
                const cy = geo.right[i].y + geo.right[i].h / 2
                const fill = n.kind === 'none' ? 'url(#flow-hatch)' : n.color
                return (
                  <g key={n.key} className="flow__link" style={{ opacity: dim ? 0.16 : 1, cursor: href ? 'pointer' : 'default' }}
                    onMouseEnter={() => setActive(n.key)} onClick={() => href && navigate(href)}>
                    <path d={ribbon(NODE_W, geo.left[i], nx, geo.right[i])} fill={fill} className="flow__ribbon"
                      style={{ opacity: active === n.key ? 0.85 : n.kind === 'left' ? 0.72 : 'var(--flow-band-opacity)' }} />
                    <rect x={nx} y={geo.right[i].y} width={NODE_W} height={geo.right[i].h} rx={Math.min(3, geo.right[i].h / 2)} fill={fill} />
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
