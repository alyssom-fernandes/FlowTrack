import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Money, ProgressBar } from '../../components/ui'
import { Icon } from '../../components/icons'
import { CategoryIcon } from '../dashboard/CategoryIcon'
import { categoryColor } from '../../lib/categoryColor'
import { categoryLabel, formatCurrency, formatPercent } from '../../utils'

// Prévia viva: um extrato chegando, a IA categorizando linha a linha e o orçamento subindo.
// Toca uma vez ao abrir (cerca de 2 s) e para. Com "menos movimento", já aparece pronta.
const ROWS = [
  { desc: 'Hortifruti Rio Branco', amount: -92.4, cat: 'Alimentação', icon: 'utensils', conf: 91 },
  { desc: '99 Táxi', amount: -24.1, cat: 'Transporte', icon: 'car', conf: 94 },
  { desc: 'Spotify', amount: -21.9, cat: 'Assinaturas', icon: 'repeat', conf: 97 },
]
const LIMIT = 1300
const SPENT_BEFORE = 1025.6
const SPENT_AFTER = SPENT_BEFORE + 92.4
const FIRST = 650   // ms até a primeira linha ser categorizada
const STEP = 380    // ms entre uma linha e a seguinte

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function ProductPreview() {
  const { t } = useTranslation()
  const [step, setStep] = useState(() => (prefersReducedMotion() ? ROWS.length : 0))

  useEffect(() => {
    if (step >= ROWS.length) return
    const id = setTimeout(() => setStep(s => s + 1), step === 0 ? FIRST : STEP)
    return () => clearTimeout(id)
  }, [step])

  const spent = step >= 1 ? SPENT_AFTER : SPENT_BEFORE
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

      {ROWS.map((row, i) => {
        const done = step > i
        const color = categoryColor({ name: row.cat, color: '', is_default: true })
        return (
          <div className="ent-prev__row" key={row.desc} style={{ '--i': i } as CSSProperties}>
            <span className={`ent-prev__glyph${done ? ' is-done' : ''}`} style={{ '--c': color } as CSSProperties}>
              {done ? <CategoryIcon name={row.icon} size={15} /> : <span className="ent-prev__q">?</span>}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ent-prev__desc">{row.desc}</div>
              <div className="ent-prev__tags">
                {done ? (
                  <>
                    <span className="ft-catpill ent-prev__in" style={{ '--c': color } as CSSProperties}>{categoryLabel({ name: row.cat })}</span>
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

      <div className="ent-prev__budget">
        <div className="ent-prev__budget-top">
          <span>{t('login.preview.budget', { category: food })}</span>
          <span className="ent-prev__pct ft-num">{formatPercent(pct, 0, false)}</span>
        </div>
        <ProgressBar value={pct} color="var(--amber-fill)" />
        <span className="ent-prev__budget-sub ft-num">
          {t('login.preview.spent', { spent: formatCurrency(spent), limit: formatCurrency(LIMIT) })}
        </span>
      </div>
    </div>
  )
}

// Pílulas de categoria ao lado da prévia: as cores que a pessoa vai reencontrar no app.
// Paradas (sem loop), levemente inclinadas, sempre fora do cartão (no mínimo 24 px dele) e
// sem desfoque: desfocadas viravam borrões. Só aparecem quando há espaço ao lado (login.css).
const CHIPS = [
  { cat: 'Moradia', icon: 'home', style: { top: '2.25rem', '--dx': '0.25rem', rotate: '6deg' } },
  { cat: 'Saúde', icon: 'heart', style: { top: '9.75rem', '--dx': '1.5rem', rotate: '-5deg' } },
  { cat: 'Vestuário', icon: 'shirt', style: { top: '17rem', '--dx': '0.625rem', rotate: '4deg' } },
] as const

export function CategoryChips() {
  return (
    <div className="ent-chips" aria-hidden>
      {CHIPS.map(c => (
        <span key={c.cat} className="ent-chip"
          style={{ ...c.style, '--c': categoryColor({ name: c.cat, color: '', is_default: true }) } as unknown as CSSProperties}>
          <CategoryIcon name={c.icon} size={14} />{categoryLabel({ name: c.cat })}
        </span>
      ))}
    </div>
  )
}
