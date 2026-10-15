// O controle de tempo da tela: mês em pílula com setas (‹ setembro · outubro · novembro ›).
// A própria pílula abre o menu dos outros períodos (todo o período, últimos 3 meses, este ano, personalizado).
// Fora de um mês inteiro, a pílula mostra o período ("1 – 10 de out.") com um "×" para voltar ao mês atual, sem setas.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/icons'
import { Input } from '../../components/ui'
import { toISODate } from '../../utils'
import { monthName, monthOf, periodRange, periodText, type Filters, type Period } from './shared'

export function MonthNav({ filters, onChange }: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const month = monthOf(filters)
  const now = new Date()

  // Fecha ao clicar fora ou com Esc (o foco volta para a pílula)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false); wrap.current?.querySelector<HTMLButtonElement>('.tx-month__current')?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('.tx-period__opt[aria-pressed="true"], .tx-period__opt')?.focus())
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const go = (delta: number) => {
    if (!month) return
    const target = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    const isCurrent = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth()
    const isLast = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() - 1
    if (isCurrent) onChange({ period: 'this_month', start_date: '', end_date: '' })
    else if (isLast) onChange({ period: 'last_month', start_date: '', end_date: '' })
    else onChange({ period: 'custom', start_date: toISODate(target), end_date: toISODate(new Date(target.getFullYear(), target.getMonth() + 1, 0)) })
  }

  const pick = (period: Period) => { onChange({ period, start_date: '', end_date: '' }); setCustom(false); setOpen(false) }
  const startCustom = () => {
    // Começa no intervalo que estava valendo (ou no mês atual)
    const current = periodRange({ ...filters, period: filters.period || 'this_month' })
    onChange({ period: 'custom', start_date: filters.start_date || current.start || '', end_date: filters.end_date || current.end || '' })
    setCustom(true)
  }
  const reset = () => { onChange({ period: 'this_month', start_date: '', end_date: '' }); setCustom(false) }

  const isCurrentMonth = filters.period === 'this_month'
  const ranged = !month   // período que não é um mês inteiro: sem setas, com "×"
  const { label } = periodText(filters, t)
  const showRange = custom || (filters.period === 'custom' && ranged)
  const options: { period: Period; key: string }[] = [
    { period: 'this_month', key: 'thisMonth' }, { period: 'last_3', key: 'last3' }, { period: 'this_year', key: 'thisYear' }, { period: '', key: 'allTime' },
  ]

  const prev = month && new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const next = month && new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const future = !!next && next > now

  return (
    <nav className={`tx-month${ranged ? ' is-ranged' : ''}`} aria-label={t('transactions.month.label')} ref={wrap}>
      {prev && (
        <>
          <button type="button" className="tx-month__arrow" onClick={() => go(-1)} aria-label={t('transactions.month.prev', { month: monthName(prev) })}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="tx-month__side" aria-hidden>{monthName(prev)}</span>
        </>
      )}
      <span className="tx-month__pill">
        <button type="button" className="tx-month__current" aria-haspopup="dialog" aria-expanded={open}
          aria-label={t('transactions.month.choose', { period: label })} onClick={() => { setCustom(filters.period === 'custom' && ranged); setOpen(v => !v) }}>
          <span aria-live="polite" className={month ? 'tx-month__name' : undefined}>{label}</span>
          {!ranged && <Icon name="chevronDown" size={14} className="tx-month__chev" />}
        </button>
        {ranged && (
          <button type="button" className="tx-month__clear" aria-label={t('transactions.month.reset')} onClick={reset}>
            <Icon name="close" size={13} />
          </button>
        )}
        {open && (
          <div className="tx-period" role="dialog" aria-label={t('transactions.filters.period')}>
            {options.filter(o => o.period !== 'this_month' || !isCurrentMonth).map(o => (
              <button key={o.key} type="button" className="tx-period__opt" aria-pressed={filters.period === o.period && !showRange} onClick={() => pick(o.period)}>
                {t(`transactions.filters.${o.key}`)}
                {filters.period === o.period && !showRange && <Icon name="check" size={14} />}
              </button>
            ))}
            <button type="button" className="tx-period__opt" aria-pressed={showRange} aria-expanded={showRange} onClick={startCustom}>
              {t('transactions.filters.custom')}
              {showRange && <Icon name="check" size={14} />}
            </button>
            {showRange && (
              <div className="tx-period__range">
                <Input type="date" label={t('transactions.filters.from')} value={filters.start_date} max={filters.end_date || undefined}
                  onChange={e => onChange({ period: 'custom', start_date: e.target.value })} />
                <Input type="date" label={t('transactions.filters.to')} value={filters.end_date} min={filters.start_date || undefined}
                  onChange={e => onChange({ period: 'custom', end_date: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </span>
      {next && (
        <>
          {/* O mês seguinte aparece sempre (mesmo no futuro, esmaecido): o seletor fica simétrico */}
          <span className={`tx-month__side${future ? ' is-future' : ''}`} aria-hidden>{monthName(next)}</span>
          <button type="button" className="tx-month__arrow" onClick={() => go(1)} disabled={future} aria-label={t('transactions.month.next', { month: monthName(next) })}>
            <Icon name="chevronRight" size={16} />
          </button>
        </>
      )}
    </nav>
  )
}
