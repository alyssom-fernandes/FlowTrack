// Busca e filtros: em linha no computador, recolhíveis no celular
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, IconButton, Input, Select } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoryLabel } from '../../utils'
import type { Account, Category } from '../../types'
import { activeFilterCount, hasAnyFilter, NO_CATEGORY, periodRange, PERIODS, useIsMobile, type Filters, type Period } from './shared'

const PERIOD_KEY: Record<Period, string> = {
  '': 'allTime', this_month: 'thisMonth', last_month: 'lastMonth', last_3: 'last3', this_year: 'thisYear', custom: 'custom',
}

function SearchBox({ value, onChange, showLabel, placeholder }: { value: string; onChange: (v: string) => void; showLabel?: boolean; placeholder: string }) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const latest = useRef(onChange)
  const sent = useRef(value)
  useEffect(() => { latest.current = onChange }, [onChange])
  // Valor vindo de fora (ex.: "Limpar filtros")
  useEffect(() => {
    if (value !== sent.current) { sent.current = value; setText(value) }
  }, [value])
  useEffect(() => {
    if (text === sent.current) return
    const id = setTimeout(() => { sent.current = text; latest.current(text) }, 300)
    return () => clearTimeout(id)
  }, [text])
  const clear = () => { setText(''); sent.current = ''; latest.current('') }
  return (
    <Input type="search" label={showLabel ? t('transactions.filters.search') : undefined} aria-label={showLabel ? undefined : t('transactions.filters.search')}
      placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} className="tx-search" enterKeyHint="search"
      leading={<Icon name="search" size={16} />}
      trailing={text ? <IconButton icon="close" label={t('transactions.filters.clearSearch')} onClick={clear} /> : undefined} />
  )
}

export function FilterBar({ filters, onChange, onClear, accounts, categories, tags }: {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onClear: () => void
  accounts: Account[]
  categories: Category[]
  tags: string[]
}) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const count = activeFilterCount(filters)
  const set = onChange
  const sortedCats = useMemo(() => [...categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [categories])

  const setPeriod = (period: Period) => {
    if (period === 'custom') {
      // Começa no intervalo que estava valendo (ou no mês atual)
      const current = periodRange({ ...filters, period: filters.period || 'this_month' })
      set({ period, start_date: filters.start_date || current.start || '', end_date: filters.end_date || current.end || '' })
    } else set({ period, start_date: '', end_date: '' })
  }

  const selects = (
    <>
      <Select label={t('transactions.filters.period')} value={filters.period} onChange={e => setPeriod(e.target.value as Period)}>
        {PERIODS.map(p => <option key={p} value={p}>{t(`transactions.filters.${PERIOD_KEY[p]}`)}</option>)}
      </Select>
      <Select label={t('transactions.filters.account')} value={filters.account_id} onChange={e => set({ account_id: e.target.value })}>
        <option value="">{t('transactions.filters.allAccounts')}</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
      <Select label={t('transactions.filters.category')} value={filters.category_id} onChange={e => set({ category_id: e.target.value })}>
        <option value="">{t('transactions.filters.allCategories')}</option>
        <option value={NO_CATEGORY}>{t('transactions.filters.uncategorized')}</option>
        {sortedCats.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
      </Select>
      <Select label={t('transactions.filters.type')} value={filters.type} onChange={e => set({ type: e.target.value })}>
        <option value="">{t('transactions.filters.allTypes')}</option>
        <option value="debit">{t('transactions.filters.debit')}</option>
        <option value="credit">{t('transactions.filters.credit')}</option>
        <option value="transfer">{t('transactions.filters.transfer')}</option>
      </Select>
      {tags.length > 0 && (
        <Select label={t('transactions.filters.tag')} value={filters.tag} onChange={e => set({ tag: e.target.value })}>
          <option value="">{t('transactions.filters.allTags')}</option>
          {tags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}
        </Select>
      )}
    </>
  )

  const range = filters.period === 'custom' && (
    <div className="tx-filters__range">
      <Input type="date" label={t('transactions.filters.from')} value={filters.start_date} max={filters.end_date || undefined} onChange={e => set({ start_date: e.target.value })} />
      <Input type="date" label={t('transactions.filters.to')} value={filters.end_date} min={filters.start_date || undefined} onChange={e => set({ end_date: e.target.value })} />
    </div>
  )

  if (mobile) {
    return (
      <div className="tx-filters-m">
        <div className="tx-filters-m__bar">
          <SearchBox value={filters.search} onChange={search => set({ search })} placeholder={t('transactions.filters.search')} />
          <Button variant="secondary" icon="filter" className="tx-filters-m__toggle" aria-expanded={open} aria-controls="tx-filtros" onClick={() => setOpen(v => !v)}>
            {t('transactions.filters.label')}
            {count > 0 && <span className="tx-count ft-num">{count}</span>}
          </Button>
        </div>
        {open && (
          <Card padding="sm" id="tx-filtros" className="tx-filters-m__panel">
            <div className="tx-filters-m__grid">{selects}</div>
            {range}
            {hasAnyFilter(filters) && <Button variant="ghost" icon="close" block onClick={onClear}>{t('transactions.filters.clear')}</Button>}
          </Card>
        )}
      </div>
    )
  }

  const active = count + (filters.search.trim() ? 1 : 0)
  const columns = `minmax(12rem, 1.5fr) minmax(9.5rem, 1.1fr) repeat(${tags.length ? 4 : 3}, minmax(0, 1fr))`
  return (
    <Card padding="none" className="tx-filters" role="search">
      <div className="tx-filters__grid" style={{ gridTemplateColumns: columns }}>
        <SearchBox showLabel value={filters.search} onChange={search => set({ search })} placeholder={t('transactions.filters.searchPlaceholder')} />
        {selects}
      </div>
      {range}
      {active > 0 && (
        <div className="tx-filters__foot">
          <span className="tx-filters__count"><Icon name="filter" size={13} />{t('transactions.filters.active', { count: active })}</span>
          <Button variant="ghost" size="sm" icon="close" onClick={onClear}>{t('transactions.filters.clear')}</Button>
        </div>
      )}
    </Card>
  )
}
