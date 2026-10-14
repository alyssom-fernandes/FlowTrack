// Mês em pílula com setas: o recorte de tempo sempre à vista (‹ setembro · outubro · novembro ›).
// As setas trocam de mês; períodos que não são um mês inteiro aparecem como texto, sem setas.
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/icons'
import { currentLocale, toISODate } from '../../utils'
import { periodRange, type Filters } from './shared'

function monthOf(f: Filters): Date | null {
  const { start, end } = periodRange(f)
  if (!start || !end) return null
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  const last = new Date(s.getFullYear(), s.getMonth() + 1, 0)
  return s.getDate() === 1 && e.getTime() === last.getTime() ? s : null
}

export function MonthNav({ filters, onChange }: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  const { t } = useTranslation()
  const month = monthOf(filters)
  if (!month) return null
  const now = new Date()
  const fmt = (d: Date) => new Intl.DateTimeFormat(currentLocale(), { month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(d)
  const go = (delta: number) => {
    const target = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    const isCurrent = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth()
    const isLast = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() - 1
    if (isCurrent) onChange({ period: 'this_month', start_date: '', end_date: '' })
    else if (isLast) onChange({ period: 'last_month', start_date: '', end_date: '' })
    else onChange({ period: 'custom', start_date: toISODate(target), end_date: toISODate(new Date(target.getFullYear(), target.getMonth() + 1, 0)) })
  }
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const future = next > now
  return (
    <nav className="tx-month" aria-label={t('transactions.month.label')}>
      <button type="button" className="tx-month__arrow" onClick={() => go(-1)} aria-label={t('transactions.month.prev', { month: fmt(prev) })}>
        <Icon name="chevronLeft" size={16} />
      </button>
      <span className="tx-month__side" aria-hidden>{fmt(prev)}</span>
      <span className="tx-month__current" aria-live="polite">{fmt(month)}</span>
      {/* O mês seguinte aparece sempre (mesmo no futuro, esmaecido): o seletor fica simétrico */}
      <span className={`tx-month__side${future ? ' is-future' : ''}`} aria-hidden>{fmt(next)}</span>
      <button type="button" className="tx-month__arrow" onClick={() => go(1)} disabled={future} aria-label={t('transactions.month.next', { month: fmt(next) })}>
        <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  )
}
