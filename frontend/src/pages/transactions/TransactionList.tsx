// Lista agrupada por dia: linhas com colunas no computador, cartões no celular
import { useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, Money, Skeleton, Spinner } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoryLabel, formatPercent } from '../../utils'
import type { Account, Category, Transaction } from '../../types'
import { CategoryGlyph } from './CategoryGlyph'
import { categoryColor } from '../../lib/categoryColor'
import { dayHeading, groupByDay, isFlow, PAGE_SIZE, useIsMobile } from './shared'

interface ListProps {
  items: Transaction[]
  dayTotalsFrom: Transaction[] | null
  accounts: Account[]
  categories: Category[]
  page: number
  totalPages: number
  total: number
  busy: boolean
  onPage: (p: number) => void
  onEdit: (t: Transaction) => void
  onDelete: (t: Transaction) => void
  onCategory: (t: Transaction, categoryId: string) => Promise<void>
}

// Cliques em controles dentro da linha não abrem a edição
const fromControl = (e: MouseEvent) => !!(e.target as HTMLElement).closest('button, select, a, input')

// ── Categoria: chip com seletor nativo por cima (abre direto no clique) ──
function CategoryCell({ txn, categories, onChange }: { txn: Transaction; categories: Category[]; onChange: (id: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const cat = categories.find(c => c.id === txn.category_id)
  const sorted = useMemo(() => [...categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [categories])
  const conf = txn.confidence_score ?? 0
  const pct = formatPercent(conf * 100, 0, false)
  const isAi = !!cat && txn.categorized_by === 'ai'
  const low = isAi && conf < 0.75
  const why = !cat ? t('transactions.row.by.none')
    : isAi ? t(low ? 'transactions.row.by.aiLow' : 'transactions.row.by.ai', { pct })
    : t(`transactions.row.by.${txn.categorized_by === 'cache' || txn.categorized_by === 'rule' ? txn.categorized_by : 'manual'}`)

  const change = async (id: string) => {
    if (!id || id === txn.category_id) return
    setSaving(true)
    try { await onChange(id) } finally { setSaving(false) }
  }

  return (
    <span className="tx-cat">
      <span className={`tx-cat__chip${cat ? '' : ' tx-cat__chip--none'}`} style={cat ? { '--c': categoryColor(cat) } as React.CSSProperties : undefined}>
        {saving ? <Spinner size={10} /> : cat ? <span className="tx-cat__dot" /> : <Icon name="plus" size={12} />}
        <span className="tx-cat__name">{cat ? categoryLabel(cat) : t('transactions.row.uncategorized')}</span>
        <Icon name="chevronDown" size={12} className="tx-cat__chev" />
        <select className="tx-cat__select" value={txn.category_id || ''} disabled={saving}
          aria-label={t('transactions.row.categoryAria', { name: txn.description })} title={`${why} ${t('transactions.row.change')}`}
          onChange={e => change(e.target.value)}>
          {!cat && <option value="" disabled>{t('transactions.row.chooseCategory')}</option>}
          {sorted.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
        </select>
      </span>
      {isAi && <span className={`tx-ai${low ? ' tx-ai--low' : ''}`} title={why}>{t('transactions.row.aiBadge', { pct })}</span>}
    </span>
  )
}

// Selos da linha: parcela, transferência, tags e notas
function RowMeta({ txn }: { txn: Transaction }) {
  const { t } = useTranslation()
  const inst = txn.installment_current && txn.installment_total && txn.installment_total > 1
  const tags = txn.tags || []
  if (!inst && txn.type !== 'transfer' && !tags.length && !txn.notes) return null
  return (
    <div className="tx-meta">
      {inst && <span className="tx-pill ft-num" title={t('transactions.row.installment', { current: txn.installment_current, total: txn.installment_total })}>{txn.installment_current}/{txn.installment_total}</span>}
      {txn.type === 'transfer' && <span className="tx-pill" title={t('transactions.row.transferHint')}><Icon name="transfer" size={11} />{t('transactions.row.transfer')}</span>}
      {tags.map(tag => <span key={tag} className="tx-tag">#{tag}</span>)}
      {txn.notes && <span className="tx-note" title={txn.notes}>{txn.notes}</span>}
    </div>
  )
}

function Amount({ txn }: { txn: Transaction }) {
  if (!isFlow(txn)) return <Money value={txn.amount} signed className="tx-amount" style={{ color: 'var(--text-secondary)' }} />
  return <Money value={txn.amount} signed className="tx-amount" style={{ color: txn.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }} />
}

function Description({ txn, onEdit }: { txn: Transaction; onEdit: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="tx-desc-line">
      <button type="button" className="tx-desc" onClick={onEdit} title={txn.description}>{txn.description}</button>
      {txn.is_recurring && <span className="tx-recurring" title={t('transactions.row.recurring')}><Icon name="repeat" size={13} title={t('transactions.row.recurring')} /></span>}
    </span>
  )
}

function DesktopRow({ txn, account, category, categories, onEdit, onDelete, onCategory }: {
  txn: Transaction; account?: Account; category?: Category; categories: Category[]
  onEdit: () => void; onDelete: () => void; onCategory: (id: string) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <li className="tx-row tx-cols" onClick={e => { if (!fromControl(e)) onEdit() }}>
      <CategoryGlyph category={category} transfer={txn.type === 'transfer'} />
      <div style={{ minWidth: 0 }}>
        <Description txn={txn} onEdit={onEdit} />
        <RowMeta txn={txn} />
      </div>
      <CategoryCell txn={txn} categories={categories} onChange={onCategory} />
      <span className="tx-acc" title={account?.bank_name}>{account?.name ?? '—'}</span>
      <span className="tx-amount-cell"><Amount txn={txn} /></span>
      <span className="tx-row__actions">
        <IconButton icon="edit" label={t('transactions.list.editAria', { name: txn.description })} onClick={onEdit} />
        <IconButton icon="trash" label={t('transactions.list.deleteAria', { name: txn.description })} onClick={onDelete} className="tx-del" />
      </span>
    </li>
  )
}

function MobileCard({ txn, account, category, categories, onEdit, onCategory }: {
  txn: Transaction; account?: Account; category?: Category; categories: Category[]
  onEdit: () => void; onCategory: (id: string) => Promise<void>
}) {
  return (
    <li className="tx-card" onClick={e => { if (!fromControl(e)) onEdit() }}>
      <CategoryGlyph category={category} transfer={txn.type === 'transfer'} size={38} />
      <div className="tx-card__body">
        <div className="tx-card__top">
          <Description txn={txn} onEdit={onEdit} />
          <Amount txn={txn} />
        </div>
        <div className="tx-card__sub">
          <CategoryCell txn={txn} categories={categories} onChange={onCategory} />
          {account && <span className="tx-acc">{account.name}</span>}
        </div>
        <RowMeta txn={txn} />
      </div>
    </li>
  )
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  const mobile = useIsMobile()
  return (
    <div aria-hidden>
      {!mobile && <div className="tx-head tx-cols"><span /><Skeleton width={80} height={10} /><Skeleton width={70} height={10} /><Skeleton width={50} height={10} /><Skeleton width={50} height={10} style={{ marginLeft: 'auto' }} /><span /></div>}
      <div className="tx-day__head"><Skeleton width={160} height={12} /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={mobile ? 'tx-card' : 'tx-row tx-cols'} style={{ cursor: 'default' }}>
          <Skeleton width={36} height={36} radius="var(--radius-md)" />
          {mobile ? (
            <div className="tx-card__body"><Skeleton width={`${55 + (i * 17) % 30}%`} height={13} /><Skeleton width="40%" height={11} /></div>
          ) : (
            <>
              <Skeleton width={`${45 + (i * 23) % 35}%`} height={13} />
              <Skeleton width={96} height={12} />
              <Skeleton width={72} height={12} />
              <Skeleton width={80} height={13} style={{ marginLeft: 'auto' }} />
              <span />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function TransactionList({ items, dayTotalsFrom, accounts, categories, page, totalPages, total, busy, onPage, onEdit, onDelete, onCategory }: ListProps) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  const groups = useMemo(() => groupByDay(items), [items])
  // Resultado do dia com todas as transações do filtro (o dia pode cruzar páginas)
  const dayNet = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of dayTotalsFrom ?? items) if (isFlow(tx)) map.set(tx.transaction_date, (map.get(tx.transaction_date) ?? 0) + tx.amount)
    return map
  }, [dayTotalsFrom, items])
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const labels = { today: t('transactions.list.today'), yesterday: t('transactions.list.yesterday') }
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className={`tx-list${busy ? ' tx-list--busy' : ''}`} aria-busy={busy || undefined} aria-label={t('transactions.list.label')} role="region">
      {!mobile && (
        <div className="tx-head tx-cols" aria-hidden>
          <span />
          <span>{t('transactions.list.colDescription')}</span>
          <span>{t('transactions.list.colCategory')}</span>
          <span>{t('transactions.list.colAccount')}</span>
          <span style={{ textAlign: 'right' }}>{t('transactions.list.colAmount')}</span>
          <span />
        </div>
      )}
      {groups.map(g => {
        const net = Math.round((dayNet.get(g.date) ?? 0) * 100) / 100
        const heading = dayHeading(g.date, labels, mobile)
        return (
          <section key={g.date} aria-label={heading}>
            <div className={`tx-day__head${mobile ? '' : ' tx-cols'}`}>
              <span className="tx-day__title">{heading}</span>
              <span className="tx-day__total" title={t('transactions.list.dayTotal')}>{net !== 0 && <Money value={net} signed />}</span>
            </div>
            <ul className="tx-ul">
              {g.items.map(txn => {
                const common = {
                  txn, account: accById.get(txn.account_id), category: txn.category_id ? catById.get(txn.category_id) : undefined, categories,
                  onEdit: () => onEdit(txn), onCategory: (id: string) => onCategory(txn, id),
                }
                return mobile
                  ? <MobileCard key={txn.id} {...common} />
                  : <DesktopRow key={txn.id} {...common} onDelete={() => onDelete(txn)} />
              })}
            </ul>
          </section>
        )
      })}
      {total > PAGE_SIZE && (
        <nav className="tx-pager" aria-label={t('transactions.list.page', { page, pages: totalPages })}>
          <span className="tx-pager__info ft-num">{t('transactions.list.showing', { from, to, total })}</span>
          <span className="tx-pager__nav">
            <span className="tx-pager__page ft-num">{t('transactions.list.page', { page, pages: totalPages })}</span>
            <IconButton icon="chevronLeft" variant="secondary" size={mobile ? 'md' : 'sm'} label={t('transactions.list.prev')} disabled={page <= 1} onClick={() => onPage(page - 1)} />
            <IconButton icon="chevronRight" variant="secondary" size={mobile ? 'md' : 'sm'} label={t('transactions.list.next')} disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
          </span>
        </nav>
      )}
    </div>
  )
}

