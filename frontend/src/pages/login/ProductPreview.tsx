import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Money } from '../../components/ui'
import { Icon } from '../../components/icons'
import { CategoryIcon } from '../dashboard/CategoryIcon'
import { categoryColor } from '../../lib/categoryColor'
import { categoryLabel, formatPercent } from '../../utils'

// Prévia viva: o extrato chega, a IA categoriza duas linhas (a categoria sai da linha até a borda
// do cartão) e a encenação termina no resultado: o fluxo do mês, do que entrou até o que sobrou.
// Toca uma vez ao abrir (cerca de 2 s) e para. Com "menos movimento", já aparece pronta.
// Dados fixos da vitrine: não lê a demonstração nem o painel.
const ROWS = [
  { desc: 'Hortifruti Rio Branco', amount: -92.4, cat: 'Alimentação', icon: 'utensils', conf: 91 },
  { desc: '99 Táxi', amount: -24.1, cat: 'Transporte', icon: 'car', conf: 94 },
]
const INCOME = 6200
// Para onde foi: as categorias na ordem do painel e, por último, o que sobrou (em vinho)
const OUT = [
  { key: 'Moradia', value: 2180 },
  { key: 'Alimentação', value: 1118.4 },
  { key: 'Transporte', value: 486.1 },
  { key: 'others', value: 215.05 },
]
const LEFT_OVER = INCOME - OUT.reduce((s, o) => s + o.value, 0)

const FIRST = 650   // ms até a primeira linha ser categorizada
const STEP = 380    // ms entre uma etapa e a seguinte (segunda linha, depois o fluxo)
const STEPS = ROWS.length + 1

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// ── Geometria do fluxo (altura fixa; a largura acompanha o cartão) ──
const H = 148        // altura do desenho
const GAP = 5        // vão entre os destinos
const NODE_W = 5
const LABEL_H = 26   // altura de cada rótulo à direita
const LEAD = 18      // fio do nó até o rótulo
const NODES = [...OUT.map(o => ({ ...o, left: false })), { key: 'left', value: LEFT_OVER, left: true }]
const GEO = (() => {
  const usable = H - GAP * (NODES.length - 1)
  const hs = NODES.map(n => Math.max(3, (n.value / INCOME) * usable))
  const k = usable / hs.reduce((s, h) => s + h, 0)
  let y = 0, ly = 0
  const right = hs.map(h => { const r = { y, h: h * k }; y += h * k + GAP; return r })
  const left = hs.map(h => { const r = { y: ly, h: h * k }; ly += h * k; return r })
  // Rótulo no centro do nó, empurrado para baixo quando encostaria no anterior
  const labels: number[] = []
  right.forEach((r, i) => labels.push(Math.max(r.y + r.h / 2 - LABEL_H / 2, i ? labels[i - 1] + LABEL_H : 0)))
  const over = labels[labels.length - 1] + LABEL_H - H
  if (over > 0) for (let i = labels.length - 1; i >= 0; i--) labels[i] = Math.min(labels[i] - (i === labels.length - 1 ? over : 0), i < labels.length - 1 ? labels[i + 1] - LABEL_H : Infinity)
  return { left, right, labels }
})()

function ribbon(x0: number, a: { y: number; h: number }, x1: number, b: { y: number; h: number }) {
  const m = (x0 + x1) / 2
  return `M${x0},${a.y} C${m},${a.y} ${m},${b.y} ${x1},${b.y} L${x1},${b.y + b.h} C${m},${b.y + b.h} ${m},${a.y + a.h} ${x0},${a.y + a.h} Z`
}

export function ProductPreview() {
  const { t } = useTranslation()
  const [step, setStep] = useState(() => (prefersReducedMotion() ? STEPS : 0))

  useEffect(() => {
    if (step >= STEPS) return
    const id = setTimeout(() => setStep(s => s + 1), step === 0 ? FIRST : STEP)
    return () => clearTimeout(id)
  }, [step])

  const pct = (v: number) => formatPercent((v / INCOME) * 100, 0, false)
  const summary = t('login.preview.aria', {
    first: ROWS[0].desc, firstCat: categoryLabel({ name: ROWS[0].cat }), firstPct: formatPercent(ROWS[0].conf, 0, false),
    second: ROWS[1].desc, secondCat: categoryLabel({ name: ROWS[1].cat }), secondPct: formatPercent(ROWS[1].conf, 0, false),
    pct: pct(LEFT_OVER),
  })

  return (
    <div className="ent-prev" role="img" aria-label={summary}>
      <div className="ent-prev__head">
        <div style={{ minWidth: 0 }}>
          <div className="ent-prev__title">{t('login.preview.title')}</div>
          <div className="ent-prev__meta">
            <span className="ent-prev__bank" style={{ background: '#820ad1' }} />
            <span>{t('login.preview.source', { n: 38 })}</span>
          </div>
        </div>
        <span className="ent-prev__file"><Icon name="fileText" size={12} />PDF</span>
      </div>

      {ROWS.map((row, i) => {
        const done = step > i
        const color = categoryColor({ name: row.cat, color: '', is_default: true })
        return (
          <div className="ent-prev__row" key={row.desc} style={{ '--i': i } as CSSProperties}>
            <span className={`ent-prev__glyph${done ? ' is-done' : ''}`} style={{ '--c': color } as CSSProperties}>
              {done ? <CategoryIcon name={row.icon} size={15} /> : <span className="ent-prev__q">?</span>}
            </span>
            <div className="ent-prev__main">
              <div className="ent-prev__desc">{row.desc}</div>
              <div className="ent-prev__tags">
                {done ? (
                  <>
                    {/* A categoria que a IA deu: com espaço, sai da linha e passa da borda do cartão */}
                    <span className={`ft-catpill ent-prev__chip ent-prev__in ent-prev__chip--${i}`} style={{ '--c': color } as CSSProperties}>
                      <CategoryIcon name={row.icon} size={13} />{categoryLabel({ name: row.cat })}
                    </span>
                    <span className="ent-prev__ai ent-prev__in">{t('login.preview.ai', { pct: formatPercent(row.conf, 0, false) })}</span>
                  </>
                ) : (
                  <span className="ent-prev__pending">{t('login.preview.categorizing')}</span>
                )}
              </div>
            </div>
            <Money value={row.amount} signed className="ent-prev__amount" />
          </div>
        )
      })}

      <MiniFlow shown={step >= STEPS} />
    </div>
  )
}

// Fluxo do mês em miniatura: o que entrou, à esquerda, se divide nas categorias e no que sobrou
function MiniFlow({ shown }: { shown: boolean }) {
  const { t } = useTranslation()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const nx = Math.max(NODE_W * 2, width - NODE_W - LEAD)
  const name = (key: string) =>
    key === 'left' ? t('login.preview.leftOver') : key === 'others' ? t('login.preview.others') : categoryLabel({ name: key })
  const color = (key: string) =>
    key === 'left' ? 'var(--accent)' : key === 'others' ? 'var(--cat-other)' : categoryColor({ name: key, color: '', is_default: true })

  return (
    <div className={`ent-flow${shown ? ' is-shown' : ''}`}>
      <div className="ent-flow__cap">{t('login.preview.flowTitle')}</div>
      <div className="ent-flow__grid">
        <div className="ent-flow__in">
          <span className="ent-flow__in-label">{t('login.preview.income')}</span>
          <Money value={INCOME} className="ent-flow__in-value" />
        </div>
        <div className="ent-flow__plot" ref={wrap} style={{ height: H }}>
          {width > 0 && (
            <svg width={width} height={H} className="ent-flow__svg" aria-hidden>
              <rect x={0} y={0} width={NODE_W} height={H} rx={2.5} fill="var(--text-primary)" opacity={0.88} />
              {NODES.map((n, i) => {
                const r = GEO.right[i]
                const cy = r.y + r.h / 2
                const ly = GEO.labels[i] + LABEL_H / 2
                return (
                  <g key={n.key}>
                    <path d={ribbon(NODE_W, GEO.left[i], nx, r)} fill={color(n.key)} style={{ opacity: n.left ? 0.78 : 'var(--flow-band-opacity)' }} />
                    <rect x={nx} y={r.y} width={NODE_W} height={r.h} rx={Math.min(2.5, r.h / 2)} fill={color(n.key)} />
                    <path d={`M${nx + NODE_W + 2},${cy} C${width - 6},${cy} ${width - 8},${ly} ${width},${ly}`} fill="none" stroke="var(--border-strong)" strokeWidth={1} />
                  </g>
                )
              })}
            </svg>
          )}
        </div>
        <ol className="ent-flow__labels" style={{ height: H }}>
          {NODES.map((n, i) => (
            <li key={n.key} className={`ent-flow__label${n.left ? ' ent-flow__label--left' : ''}`}
              style={{ top: GEO.labels[i], height: LABEL_H, '--i': i } as CSSProperties}>
              <span className="ent-flow__name">{name(n.key)}</span>
              <span className="ent-flow__pct ft-num">{formatPercent((n.value / INCOME) * 100, 0, false)}</span>
              <Money value={n.value} className="ent-flow__value" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
