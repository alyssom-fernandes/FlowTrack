import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, Money } from '../../components/ui'
import { formatPercent } from '../../utils'
import { layoutBar, type Slice } from './model'

const BAR_H = 10
const GAP = 2

// Barra empilhada (parte do todo) desenhada na largura real do contêiner
export function AllocationCard({ slices }: { slices: Slice[] }) {
  const { t } = useTranslation()
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // No toque a dica fica até tocar fora do gráfico
  useEffect(() => {
    if (active === null) return
    const away = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setActive(null) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [active])

  const label = (s: Slice) => (s.key === 'outro' ? t('investments.otherFolded') : t(`investments.types.${s.key}`))

  const rects = layoutBar(slices.map(s => s.value), width, GAP)

  const summary = slices.map(s => `${label(s)} ${formatPercent(s.share, 1, false)}`).join(', ')
  const tip = active !== null ? slices[active] : null
  const tipX = active !== null ? rects[active].x + rects[active].w / 2 : 0

  return (
    <Card className="inv-alloc">
      <CardHeader title={t('investments.allocation.title')} subtitle={t('investments.allocation.subtitle')} />
      <div ref={boxRef} className="inv-alloc__box" onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
        {width > 0 && (
          <svg width={width} height={BAR_H} viewBox={`0 0 ${width} ${BAR_H}`} role="img" aria-label={t('investments.allocation.aria', { list: summary })}>
            <defs>
              <clipPath id="inv-alloc-clip"><rect x={0} y={0} width={width} height={BAR_H} rx={4} /></clipPath>
            </defs>
            <g clipPath="url(#inv-alloc-clip)">
              {slices.map((s, i) => rects[i].w > 0 && (
                <rect key={s.key} x={rects[i].x} y={0} width={rects[i].w} height={BAR_H} fill={s.color}
                  opacity={active === null || active === i ? 1 : 0.35} className="inv-alloc__seg"
                  onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              ))}
            </g>
          </svg>
        )}
        {tip && (
          <div className="inv-tip" role="presentation"
            style={{ left: Math.min(Math.max(tipX, 96), Math.max(96, width - 96)), bottom: BAR_H + 10 }}>
            <div className="inv-tip__title"><span className="inv-swatch" style={{ background: tip.color }} />{label(tip)}</div>
            <Money value={tip.value} className="inv-tip__value" />
            <div className="inv-tip__sub ft-num">{t('investments.allocation.share', { pct: formatPercent(tip.share, 1, false) })} · {t('investments.allocation.assets', { count: tip.count })}</div>
          </div>
        )}
      </div>

      {/* Lista em duas colunas (de cima para baixo): cor · nome · valor · %, como as categorias de Relatórios.
          Sem mini barra: a barra empilhada acima já mostra as proporções (as duas repetiam a mesma coisa). */}
      <ul className="inv-legend" aria-label={t('investments.allocation.legend')} style={{ '--inv-rows': Math.ceil(slices.length / 2) } as CSSProperties}>
        {slices.map((s, i) => (
          <li key={s.key} className={`inv-legend__item${active !== null && active !== i ? ' is-dim' : ''}${active === i ? ' is-active' : ''}`}
            onPointerEnter={e => { if (e.pointerType === 'mouse') setActive(i) }} onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
            <span className="inv-legend__name"><span className="inv-swatch" style={{ background: s.color }} aria-hidden />{label(s)}</span>
            <Money value={s.value} className="inv-legend__value" />
            <span className="inv-legend__share ft-num">{formatPercent(s.share, 1, false)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
