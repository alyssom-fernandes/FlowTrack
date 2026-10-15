// Busca e filtros: em linha no computador, recolhíveis no celular.
// O período não mora aqui: é a pílula do mês (MonthNav), o único controle de tempo da tela.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, IconButton, Input, Select } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoryLabel } from '../../utils'
import type { Account, Category } from '../../types'
import { activeFilterCount, NO_CATEGORY, useIsMobile, type Filters } from './shared'

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
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
    <Input type="search" aria-label={t('transactions.filters.search')}
      placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} className="tx-search" enterKeyHint="search"
      leading={<Icon name="search" size={16} />}
      trailing={text ? <IconButton icon="close" label={t('transactions.filters.clearSearch')} onClick={clear} /> : undefined} />
  )
}

// Filtro em chip (computador): o seletor nativo fica invisível por cima, então teclado, leitor de tela
// e o menu do sistema continuam funcionando. Ativo, o chip mostra o valor e ganha um "×".
function FilterChip({ label, value, display, active, onChange, onClear, children }: {
  label: string; value: string; display: string; active: boolean; onChange: (v: string) => void; onClear: () => void; children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <span className={`tx-chip${active ? ' is-active' : ''}`}>
      <span className="tx-chip__text">{active ? display : label}</span>
      <Icon name="chevronDown" size={13} className="tx-chip__chev" />
      <select className="tx-chip__select" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
      {active && (
        <button type="button" className="tx-chip__clear" aria-label={t('transactions.filters.clearOne', { name: label })} onClick={onClear}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
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

  const selects = (
    <>
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
            {(count > 0 || !!filters.search.trim()) && <Button variant="ghost" icon="close" block onClick={onClear}>{t('transactions.filters.clear')}</Button>}
          </Card>
        )}
      </div>
    )
  }

  // Computador: busca larga e chips; o mês fica no seletor em pílula logo abaixo
  const active = count + (filters.search.trim() ? 1 : 0)
  const accName = accounts.find(a => a.id === filters.account_id)?.name ?? ''
  const catName = filters.category_id === NO_CATEGORY ? t('transactions.filters.uncategorized')
    : categoryLabel(categories.find(c => c.id === filters.category_id)) || ''
  const typeName = filters.type ? t(`transactions.filters.${filters.type}`) : ''
  return (
    <Card padding="none" className="tx-filters" role="search">
      <div className="tx-filters__row">
        <SearchBox value={filters.search} onChange={search => set({ search })} placeholder={t('transactions.filters.searchPlaceholder')} />
        <div className="tx-chips" role="group" aria-label={t('transactions.filters.label')}>
          <FilterChip label={t('transactions.filters.account')} value={filters.account_id} display={accName} active={!!filters.account_id}
            onChange={v => set({ account_id: v })} onClear={() => set({ account_id: '' })}>
            <option value="">{t('transactions.filters.allAccounts')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </FilterChip>
          <FilterChip label={t('transactions.filters.category')} value={filters.category_id} display={catName} active={!!filters.category_id}
            onChange={v => set({ category_id: v })} onClear={() => set({ category_id: '' })}>
            <option value="">{t('transactions.filters.allCategories')}</option>
            <option value={NO_CATEGORY}>{t('transactions.filters.uncategorized')}</option>
            {sortedCats.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
          </FilterChip>
          <FilterChip label={t('transactions.filters.type')} value={filters.type} display={typeName} active={!!filters.type}
            onChange={v => set({ type: v })} onClear={() => set({ type: '' })}>
            <option value="">{t('transactions.filters.allTypes')}</option>
            <option value="debit">{t('transactions.filters.debit')}</option>
            <option value="credit">{t('transactions.filters.credit')}</option>
            <option value="transfer">{t('transactions.filters.transfer')}</option>
          </FilterChip>
          {tags.length > 0 && (
            <FilterChip label={t('transactions.filters.tag')} value={filters.tag} display={`#${filters.tag}`} active={!!filters.tag}
              onChange={v => set({ tag: v })} onClear={() => set({ tag: '' })}>
              <option value="">{t('transactions.filters.allTags')}</option>
              {tags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}
            </FilterChip>
          )}
        </div>
        {active > 0 && <Button variant="ghost" size="sm" icon="close" className="tx-filters__clear" onClick={onClear}>{t('transactions.filters.clearShort')}</Button>}
      </div>
    </Card>
  )
}
