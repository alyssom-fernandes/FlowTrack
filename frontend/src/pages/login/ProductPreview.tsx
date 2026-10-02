import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Money, ProgressBar, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoryLabel, formatCurrency, formatPercent } from '../../utils'

// Prévia viva: um extrato chegando, a IA categorizando e o orçamento subindo
const ROWS = [
  { desc: 'Hortifruti Rio Branco', amount: -92.4, cat: 'Alimentação', color: '#e06c75', conf: 91 },
  { desc: '99 Táxi', amount: -24.1, cat: 'Transporte', color: '#e09c4c', conf: 94 },
]
const LIMIT = 1300
const SPENT_BEFORE = 1025.6
const SPENT_AFTER = SPENT_BEFORE + 92.4

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function ProductPreview() {
  const { t } = useTranslation()
  const [done, setDone] = useState(prefersReducedMotion)

  useEffect(() => {
    if (done) return
    const id = setTimeout(() => setDone(true), 1400)
    return () => clearTimeout(id)
  }, [done])

  const spent = done ? SPENT_AFTER : SPENT_BEFORE
  const pct = (spent / LIMIT) * 100
  const food = categoryLabel({ name: 'Alimentação' })
  const summary = t('login.preview.aria', {
    first: ROWS[0].desc, firstCat: categoryLabel({ name: ROWS[0].cat }), firstPct: formatPercent(ROWS[0].conf, 0, false),
    second: ROWS[1].desc, secondCat: categoryLabel({ name: ROWS[1].cat }), secondPct: formatPercent(ROWS[1].conf, 0, false),
    category: food, pct: formatPercent((SPENT_AFTER / LIMIT) * 100, 0, false),
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

      {ROWS.map((row, i) => (
        <div className="ent-prev__row" key={row.desc}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ent-prev__desc">{row.desc}</div>
            <div className="ent-prev__tags">
              {done ? (
                <>
                  <span className={`ent-prev__cat ent-prev__in${i ? ' ent-prev__in--2' : ''}`}>
                    <span className="ent-prev__dot" style={{ background: row.color }} />
                    {categoryLabel({ name: row.cat })}
                  </span>
                  <span className={`ent-prev__ai ent-prev__in${i ? ' ent-prev__in--2' : ''}`}>
                    {t('login.preview.ai', { pct: formatPercent(row.conf, 0, false) })}
                  </span>
                </>
              ) : (
                <span className="ent-prev__pending">
                  <Skeleton width={72} height={14} radius="999px" />
                  {t('login.preview.categorizing')}
                </span>
              )}
            </div>
          </div>
          <Money value={row.amount} signed tone="auto" className="ent-prev__amount" />
        </div>
      ))}

      <div className="ent-prev__budget">
        <div className="ent-prev__budget-top">
          <span>{t('login.preview.budget', { category: food })}</span>
          <span className="ent-prev__pct ft-num">{formatPercent(pct, 0, false)}</span>
        </div>
        <ProgressBar value={pct} tone="spending" />
        <span className="ent-prev__budget-sub ft-num">
          {t('login.preview.spent', { spent: formatCurrency(spent), limit: formatCurrency(LIMIT) })}
        </span>
      </div>
    </div>
  )
}
