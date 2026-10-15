// Lista agrupada por dia: linhas com colunas no computador, cartões no celular
import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, Money, Skeleton, Spinner } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoryLabel, currentLocale, formatCurrency, formatPercent } from '../../utils'
import { REVIEW_CONFIDENCE, shownCategory } from '../../lib/review'
import type { Account, Category, Transaction } from '../../types'
import { CategoryGlyph } from './CategoryGlyph'
import { categoryColor } from '../../lib/categoryColor'
import { dayHeading, groupByDay, groupInstallments, isFlow, PAGE_SIZE, transferPeer, useIsMobile } from './shared'

interface ListProps {
  items: Transaction[]
  dayTotalsFrom: Transaction[] | null
  accounts: Account[]
  categories: Category[]
  page: number
  totalPages: number
  total: number
  busy: boolean
  // Modo revisão: confirma a categoria sugerida. Em parcelas agrupadas, group traz todas as parcelas da linha
  onConfirm?: (txn: Transaction, group?: Transaction[]) => Promise<void>
  onPage: (p: number) => void
  onEdit: (t: Transaction) => void
  onDelete: (t: Transaction) => void
  onCategory: (t: Transaction, categoryId: string, group?: Transaction[]) => Promise<void>
  offer?: { id: string; content: ReactNode }   // oferta "Aplicar sempre", logo abaixo da linha que mudou
}

// Cliques em controles dentro da linha não abrem a edição
const fromControl = (e: MouseEvent) => !!(e.target as HTMLElement).closest('button, select, a, input')

// ── Categoria: chip com seletor nativo por cima (abre direto no clique) ──
function CategoryCell({ txn, categories, onChange, onConfirm, confirmLabel }: { txn: Transaction; categories: Category[]; onChange: (id: string) => Promise<void>; onConfirm?: () => Promise<void>; confirmLabel?: string }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  // "Outros" dado pela IA conta como sem categoria (não é sugestão)
  const cat = shownCategory(txn, categories)
  const sorted = useMemo(() => [...categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [categories])
  const conf = txn.confidence_score ?? 0
  const pct = formatPercent(conf * 100, 0, false)
  const isAi = !!cat && txn.categorized_by === 'ai'
  const low = isAi && conf < REVIEW_CONFIDENCE
  // No modo revisão, a categoria da IA com pouca confiança é só uma sugestão: pílula tracejada + ✓
  const why = !cat ? t('transactions.row.by.none')
    : isAi ? t(low ? 'transactions.row.by.aiLow' : 'transactions.row.by.ai', { pct })
    : t(`transactions.row.by.${txn.categorized_by === 'cache' || txn.categorized_by === 'rule' ? txn.categorized_by : 'manual'}`)

  const change = async (id: string) => {
    if (!id || id === cat?.id) return
    setSaving(true)
    try { await onChange(id) } finally { setSaving(false) }
  }

  return (
    <span className="tx-cat">
      <span className={`tx-cat__chip${cat ? '' : ' tx-cat__chip--none'}${onConfirm && low ? ' tx-cat__chip--suggested' : ''}`} style={cat ? { '--c': categoryColor(cat) } as React.CSSProperties : undefined}>
        {saving ? <Spinner size={10} /> : cat ? <span className="tx-cat__dot" /> : <Icon name="plus" size={12} />}
        {/* No modo revisão, a sem categoria pede a escolha: "+ Escolher" */}
        <span className="tx-cat__name">{cat ? categoryLabel(cat) : t(onConfirm ? 'transactions.review.choose' : 'transactions.row.uncategorized')}</span>
        <Icon name="chevronDown" size={12} className="tx-cat__chev" />
        <select className="tx-cat__select" value={cat?.id || ''} disabled={saving}
          aria-label={t('transactions.row.categoryAria', { name: txn.description })} title={`${why} ${t('transactions.row.change')}`}
          onChange={e => change(e.target.value)}>
          {!cat && <option value="" disabled>{t('transactions.row.chooseCategory')}</option>}
          {sorted.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
        </select>
      </span>
      {isAi && <span className={`tx-ai${low ? ' tx-ai--low' : ''}`} title={why}>{t('transactions.row.aiBadge', { pct })}</span>}
      {/* Escolhida à mão nesta revisão: já está conferida, sem ✓ */}
      {onConfirm && cat && txn.categorized_by !== 'manual' && (
        <IconButton icon="check" variant="secondary" className="tx-confirm" label={confirmLabel ?? t('transactions.review.confirmOne', { name: txn.description, category: categoryLabel(cat) })}
          loading={saving} onClick={async () => { setSaving(true); try { await onConfirm() } finally { setSaving(false) } }} />
      )}
    </span>
  )
}

// Selos da linha: parcela, transferência, tags e notas
function RowMeta({ txn, parcels }: { txn: Transaction; parcels?: Transaction[] }) {
  const { t } = useTranslation()
  const inst = txn.installment_current && txn.installment_total && txn.installment_total > 1
  const tags = txn.tags || []
  if (!inst && txn.type !== 'transfer' && !tags.length && !txn.notes) return null
  // Parcelas agrupadas (modo revisão): "5 parcelas · jun.–out.", e quais são no título
  const list = parcels?.map(p => p.installment_current ?? 0).sort((a, b) => a - b).join(', ')
  const dates = parcels?.map(p => p.transaction_date).sort() ?? []
  const month = (d: string) => new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(new Date(`${d}T12:00:00`))
  const range = dates.length ? `${month(dates[0])}–${month(dates[dates.length - 1])}` : ''
  return (
    <div className="tx-meta">
      {inst && parcels ? (
        <span className="tx-pill ft-num" title={t('transactions.review.parcelsHint', { list, total: txn.installment_total, amount: formatCurrency(Math.abs(txn.amount)) })}>
          {t('transactions.review.parcelsRange', { count: parcels.length, range })}
        </span>
      ) : inst && <span className="tx-pill ft-num" title={t('transactions.row.installment', { current: txn.installment_current, total: txn.installment_total })}>{txn.installment_current}/{txn.installment_total}</span>}
      {txn.type === 'transfer' && <span className="tx-pill" title={t('transactions.row.transferHint')}><Icon name="transfer" size={11} />{t('transactions.row.transfer')}</span>}
      {tags.map(tag => <span key={tag} className="tx-tag">#{tag}</span>)}
      {txn.notes && <span className="tx-note" title={txn.notes}>{txn.notes}</span>}
    </div>
  )
}

// times: parcelas agrupadas na revisão ("5 × −R$ 389,90"), para o valor não parecer o total da compra
function Amount({ txn, times }: { txn: Transaction; times?: number }) {
  if (!isFlow(txn)) return <Money value={txn.amount} signed className="tx-amount" style={{ color: 'var(--text-secondary)' }} />
  const money = <Money value={txn.amount} signed className="tx-amount" style={{ color: txn.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }} />
  return times && times > 1 ? <span className="tx-amount-times"><span className="ft-num">{times} ×</span>{money}</span> : money
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

interface RowProps {
  txn: Transaction; account?: Account; category?: Category; categories: Category[]; parcels?: Transaction[]; confirmLabel?: string
  onEdit: () => void; onCategory: (id: string) => Promise<void>; onConfirm?: () => Promise<void>
}

function DesktopRow({ txn, account, category, categories, parcels, confirmLabel, onEdit, onDelete, onCategory, onConfirm }: RowProps & { onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <li className="tx-row tx-cols" onClick={e => { if (!fromControl(e)) onEdit() }}>
      <CategoryGlyph category={category} transfer={txn.type === 'transfer'} />
      {/* Descrição e selos numa linha só: toda linha tem a mesma altura (56px) */}
      <div className="tx-row__main">
        <Description txn={txn} onEdit={onEdit} />
        <RowMeta txn={txn} parcels={parcels} />
      </div>
      <CategoryCell txn={txn} categories={categories} onChange={onCategory} onConfirm={onConfirm} confirmLabel={confirmLabel} />
      <span className="tx-acc" title={account?.bank_name}>{account?.name ?? '—'}</span>
      <span className="tx-amount-cell"><Amount txn={txn} times={parcels?.length} /></span>
      <span className="tx-row__actions">
        <IconButton icon="edit" label={t('transactions.list.editAria', { name: txn.description })} onClick={onEdit} />
        <IconButton icon="trash" label={t('transactions.list.deleteAria', { name: txn.description })} onClick={onDelete} className="tx-del" />
      </span>
    </li>
  )
}

function MobileCard({ txn, account, category, categories, parcels, confirmLabel, onEdit, onCategory, onConfirm }: RowProps) {
  return (
    <li className="tx-card" onClick={e => { if (!fromControl(e)) onEdit() }}>
      <CategoryGlyph category={category} transfer={txn.type === 'transfer'} size={38} />
      <div className="tx-card__body">
        <div className="tx-card__top">
          <Description txn={txn} onEdit={onEdit} />
          <Amount txn={txn} times={parcels?.length} />
        </div>
        <div className="tx-card__sub">
          <CategoryCell txn={txn} categories={categories} onChange={onCategory} onConfirm={onConfirm} confirmLabel={confirmLabel} />
          {account && <span className="tx-acc">{account.name}</span>}
        </div>
        <RowMeta txn={txn} parcels={parcels} />
      </div>
    </li>
  )
}

// ── Transferência entre contas próprias: uma linha só ("Nubank → Sicredi Poupança"), valor neutro ──
// As duas pernas viram uma; sem pílula de categoria (não é receita nem gasto). Editar abre a perna de saída.
function TransferRow({ out, from, to, mobile, onEdit, onDelete }: { out: Transaction; from?: Account; to?: Account; mobile: boolean; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const label = t('transactions.row.transferRoute', { from: from?.name ?? '—', to: to?.name ?? '—' })
  const pill = <span className="tx-pill" title={t('transactions.row.transferHint')}><Icon name="transfer" size={11} />{t('transactions.row.transfer')}</span>
  const amount = <Money value={Math.abs(out.amount)} className="tx-amount" style={{ color: 'var(--text-secondary)' }} />
  const desc = <span className="tx-desc-line"><button type="button" className="tx-desc" onClick={onEdit} title={out.description}>{label}</button></span>
  const meta = out.notes || out.tags?.length ? <RowMeta txn={{ ...out, type: 'debit' }} /> : null
  if (mobile) {
    return (
      <li className="tx-card" onClick={e => { if (!fromControl(e)) onEdit() }}>
        <CategoryGlyph transfer size={38} />
        <div className="tx-card__body">
          <div className="tx-card__top">{desc}{amount}</div>
          <div className="tx-card__sub">{pill}</div>
          {meta}
        </div>
      </li>
    )
  }
  return (
    <li className="tx-row tx-cols" onClick={e => { if (!fromControl(e)) onEdit() }}>
      <CategoryGlyph transfer />
      <div className="tx-row__main">{desc}{meta}</div>
      <span className="tx-cat">{pill}</span>
      <span className="tx-acc" />
      <span className="tx-amount-cell">{amount}</span>
      <span className="tx-row__actions">
        <IconButton icon="edit" label={t('transactions.list.editAria', { name: label })} onClick={onEdit} />
        <IconButton icon="trash" label={t('transactions.list.deleteAria', { name: label })} onClick={onDelete} className="tx-del" />
      </span>
    </li>
  )
}

// ── Prévia do primeiro contato: três linhas de exemplo, com o mesmo desenho dos cartões da lista ──
// Categorias padrão (Alimentação, Receita, Transporte); só desenho, fica esmaecida pelo EmptyState
const SAMPLES = [
  { key: 'market', category: 'Alimentação', amount: -248.9 },
  { key: 'salary', category: 'Receita', amount: 6200 },
  { key: 'ride', category: 'Transporte', amount: -23.4 },
] as const

export function SampleRows({ categories }: { categories: Category[] }) {
  const { t } = useTranslation()
  return (
    <ul className="tx-ul tx-sample">
      {SAMPLES.map(s => {
        const cat = categories.find(c => c.name === s.category && c.is_default !== false)
        return (
          <li key={s.key} className="tx-card">
            <CategoryGlyph category={cat} size={36} />
            <div className="tx-card__body">
              <div className="tx-card__top">
                <span className="tx-desc">{t(`transactions.list.sample.${s.key}`)}</span>
                <Money value={s.amount} signed tone="auto" className="tx-amount" />
              </div>
              <div className="tx-card__sub">
                {cat && (
                  <span className="tx-cat__chip" style={{ '--c': categoryColor(cat) } as React.CSSProperties}>
                    <span className="tx-cat__dot" /><span className="tx-cat__name">{categoryLabel(cat)}</span>
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
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

export function TransactionList({ items, dayTotalsFrom, accounts, categories, page, totalPages, total, busy, onPage, onEdit, onDelete, onCategory, onConfirm, offer }: ListProps) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  // Modo revisão: as parcelas da mesma compra viram uma linha só, na data da mais recente
  const reviewing = !!onConfirm
  const { rows, parcels } = useMemo(() => {
    if (!reviewing) return { rows: items, parcels: new Map<string, Transaction[]>() }
    const g = groupInstallments(items)
    return { rows: g.items, parcels: g.parcels }
  }, [items, reviewing])
  const groups = useMemo(() => groupByDay(rows), [rows])
  // Resultado do dia com todas as transações do filtro (o dia pode cruzar páginas)
  const dayNet = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of dayTotalsFrom ?? items) if (isFlow(tx)) map.set(tx.transaction_date, (map.get(tx.transaction_date) ?? 0) + tx.amount)
    return map
  }, [dayTotalsFrom, items])
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const labels = { today: t('transactions.list.today'), yesterday: t('transactions.list.yesterday') }
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className={`tx-list${busy ? ' tx-list--busy' : ''}${onConfirm ? ' tx-list--review' : ''}`} aria-busy={busy || undefined} aria-label={t('transactions.list.label')} role="region">
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
                const peer = transferPeer(txn, g.items)
                if (peer) {
                  if (txn.amount > 0) return null  // a perna de entrada aparece junto da de saída
                  return <TransferRow key={txn.id} out={txn} from={accById.get(txn.account_id)} to={accById.get(peer.account_id)} mobile={mobile}
                    onEdit={() => onEdit(txn)} onDelete={() => onDelete(txn)} />
                }
                const group = parcels.get(txn.id)
                const category = shownCategory(txn, categories)
                const common = {
                  txn, account: accById.get(txn.account_id), category, categories, parcels: group,
                  confirmLabel: group && category ? t('transactions.review.confirmGroup', { count: group.length, name: txn.description, category: categoryLabel(category) }) : undefined,
                  onEdit: () => onEdit(txn), onCategory: (id: string) => onCategory(txn, id, group),
                  onConfirm: onConfirm ? () => onConfirm(txn, group) : undefined,
                }
                return (
                  <Fragment key={txn.id}>
                    {mobile ? <MobileCard {...common} /> : <DesktopRow {...common} onDelete={() => onDelete(txn)} />}
                    {offer?.id === txn.id && <li className="tx-offer">{offer.content}</li>}
                  </Fragment>
                )
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

