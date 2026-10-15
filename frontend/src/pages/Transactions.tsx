import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, ConfirmDialog, EmptyState, Page, PageHeader, Skeleton } from '../components/ui'
import { accountsService, categoriesService, tagsService, transactionsService } from '../services'
import { useToastStore } from '../store'
import { categoryLabel, formatCurrency, formatDate } from '../utils'
import type { Account, Category, Transaction } from '../types'
import { FilterBar } from './transactions/FilterBar'
import { SummaryStrip } from './transactions/SummaryStrip'
import { MonthNav } from './transactions/MonthNav'
import { ListSkeleton, SampleRows, TransactionList } from './transactions/TransactionList'
import { TransactionModal, type SavedKind } from './transactions/TransactionModal'
import { ImportModal } from './transactions/ImportModal'
import { ExportMenu } from './transactions/ExportMenu'
import { describeFilters, exportTransactions, type ExportFormat } from './transactions/exportFile'
import { activeFilterCount, DEFAULT_FILTERS, periodText, fetchAll, filtersFromParams, filtersToParams, hasAnyFilter, NO_CATEGORY, PAGE_SIZE, toQuery, transferPeer, useIsMobile, type Filters } from './transactions/shared'
import { needsReview, shownCategory } from '../lib/review'
import { Icon } from '../components/icons'
import './transactions/transactions.css'

interface ListState { items: Transaction[]; total: number; pages: number }

export function Transactions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { toast } = useToastStore()
  const [params, setParams] = useSearchParams()
  // Filtros e página vivem no estado; a URL só espelha (dá para recarregar e compartilhar o link)
  const [filters, setFiltersState] = useState<Filters>(() => filtersFromParams(params))
  const [page, setPage] = useState(() => Math.max(1, Number(params.get('page')) || 1))
  const filterKey = new URLSearchParams(filtersToParams(filters, 1)).toString()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [refsReady, setRefsReady] = useState(false)

  const [list, setList] = useState<ListState | null>(null)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [reload, setReload] = useState(0)
  const allKey = useRef('')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const listTop = useRef<HTMLDivElement>(null)

  // Atalhos por URL: /transactions?acao=nova ou ?acao=importar (fica na URL enquanto o modal está aberto)
  const [pendingAction, setPendingAction] = useState(() => params.get('acao'))
  useEffect(() => {
    if (pendingAction === 'nova') setCreating(true)
    if (pendingAction === 'importar') setImporting(true)
  }, [pendingAction])
  const closeCreate = () => { setCreating(false); setPendingAction(null) }
  const closeImport = () => { setImporting(false); setPendingAction(null) }

  const updateFilters = (patch: Partial<Filters>) => { setFiltersState(f => ({ ...f, ...patch })); setPage(1) }
  // "Limpar filtros" não mexe no período (é a pílula do mês que cuida dele)
  const clearFilters = () => { setFiltersState(f => ({ ...DEFAULT_FILTERS, period: f.period, start_date: f.start_date, end_date: f.end_date })); setPage(1) }

  useEffect(() => {
    const wanted = filtersToParams(filters, page)
    if (pendingAction) wanted.acao = pendingAction
    const next = new URLSearchParams(wanted).toString()
    if (next !== params.toString()) setParams(next, { replace: true })
  }, [filters, page, pendingAction, params, setParams])

  // Contas, categorias e tags (as tags mudam quando uma transação nova traz tag nova)
  useEffect(() => {
    let alive = true
    Promise.all([accountsService.list(), categoriesService.list(), tagsService.list()])
      .then(([a, c, tg]) => { if (!alive) return; setAccounts(a.accounts || []); setCategories(c.categories || []); setTags(tg) })
      .catch(() => { /* a lista mostra o erro */ })
      .finally(() => { if (alive) setRefsReady(true) })
    return () => { alive = false }
  }, [reload])

  // Página atual
  useEffect(() => {
    let alive = true
    const f = filtersFromParams(new URLSearchParams(filterKey))
    setBusy(true); setFailed(false)
    const run: Promise<ListState> = f.category_id === NO_CATEGORY
      ? fetchAll(f).then(rows => ({ items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: rows.length, pages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) }))
      : transactionsService.list({ ...toQuery(f), page, page_size: PAGE_SIZE }).then(r => ({ items: r.transactions || [], total: r.total, pages: Math.max(1, r.total_pages) }))
    run
      .then(r => {
        if (!alive) return
        // Página que deixou de existir (ex.: excluiu o último item dela)
        if (!r.items.length && page > r.pages) { setPage(r.pages); return }
        setList(r)
      })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [filterKey, page, reload])

  // Todas as transações do filtro: resumo e resultado de cada dia
  useEffect(() => {
    let alive = true
    if (allKey.current !== filterKey) { allKey.current = filterKey; setAll(null) }
    fetchAll(filtersFromParams(new URLSearchParams(filterKey)))
      .then(r => { if (alive) setAll(r) })
      .catch(() => { /* o resumo fica de fora */ })
    return () => { alive = false }
  }, [filterKey, reload])

  const goToPage = (p: number) => {
    setPage(p)
    const top = listTop.current?.getBoundingClientRect().top ?? 0
    if (top < 0) listTop.current?.scrollIntoView({ block: 'start' })
  }

  const patch = (u: Transaction) => {
    setList(l => l && { ...l, items: l.items.map(x => (x.id === u.id ? u : x)) })
    setAll(a => a && a.map(x => (x.id === u.id ? u : x)))
  }

  // ── A revisar: sem categoria ou IA com pouca confiança ──
  const reviewing = filters.review === '1'
  const reviewCount = all ? (reviewing ? all.length : all.filter(needsReview).length) : null
  // Confirmáveis: as que têm categoria de verdade ("Outros" dado pela IA conta como sem categoria)
  const confirmable = reviewing && all ? all.filter(tx => shownCategory(tx, categories)) : []
  const uncategorized = reviewing && all ? all.length - confirmable.length : 0
  const [confirmingAll, setConfirmingAll] = useState(false)
  // Confirmar = a pessoa conferiu: a categoria passa a valer como escolha dela.
  // Parcelas agrupadas: o ✓ da linha confirma todas
  const confirmOne = async (txn: Transaction, group?: Transaction[]) => {
    const targets = group ?? [txn]
    try {
      await Promise.all(targets.map(x => transactionsService.update(x.id, { category_id: x.category_id, categorized_by: 'manual' })))
      toast({ message: t('transactions.review.confirmed', { count: targets.length }) })
      setReload(n => n + 1)
    } catch {
      toast({ message: t('transactions.row.categoryError'), variant: 'error' })
    }
  }
  const confirmAll = async () => {
    setConfirmingAll(true)
    try {
      await Promise.all(confirmable.map(tx => transactionsService.update(tx.id, { category_id: tx.category_id, categorized_by: 'manual' })))
      toast({ message: t('transactions.review.confirmed', { count: confirmable.length }) })
      setReload(n => n + 1)
    } catch {
      toast({ message: t('transactions.row.categoryError'), variant: 'error' })
      setReload(n => n + 1)
    } finally {
      setConfirmingAll(false)
    }
  }

  // ── "Aplicar sempre": ao trocar a categoria na revisão, oferece a regra para a mesma descrição ──
  const [ruleOffer, setRuleOffer] = useState<{ txn: Transaction; categoryId: string; installments: boolean } | null>(null)
  const [ruleBusy, setRuleBusy] = useState(false)
  useEffect(() => { if (!reviewing) setRuleOffer(null) }, [reviewing])

  const changeCategory = async (txn: Transaction, categoryId: string, group?: Transaction[]) => {
    const targets = group ?? [txn]
    try {
      const saved = await Promise.all(targets.map(x => transactionsService.update(x.id, { category_id: categoryId, categorized_by: 'manual' })))
      saved.forEach(patch)
      toast({ message: t('transactions.row.categorySaved') })
      if (reviewing) setRuleOffer({ txn, categoryId, installments: !!txn.installment_total && txn.installment_total > 1 })
    } catch {
      toast({ message: t('transactions.row.categoryError'), variant: 'error' })
    }
  }

  const ruleName = (txn: Transaction) => txn.description_normalized || txn.description.toUpperCase()
  const ruleCategory = ruleOffer ? categories.find(c => c.id === ruleOffer.categoryId) : undefined
  const acceptRule = async () => {
    if (!ruleOffer) return
    setRuleBusy(true)
    const name = ruleName(ruleOffer.txn)
    const category = ruleCategory ? categoryLabel(ruleCategory) : ''
    try {
      const r = await transactionsService.createRule(ruleOffer.txn.description, ruleOffer.categoryId)
      toast({ message: r.updated ? t('transactions.rule.saved', { count: r.updated, category }) : t('transactions.rule.savedFuture', { name, category }) })
      setRuleOffer(null)
      setReload(n => n + 1)
    } catch {
      toast({ message: t('transactions.rule.error'), variant: 'error' })
    } finally {
      setRuleBusy(false)
    }
  }
  const offer = reviewing && ruleOffer && ruleCategory ? {
    id: ruleOffer.txn.id,
    content: (
      <>
        <Icon name="sparkle" size={14} className="tx-offer__icon" />
        <span className="tx-offer__text" title={t('transactions.rule.offerHint')}>
          {t(ruleOffer.installments ? 'transactions.rule.offerInstallments' : 'transactions.rule.offer', { category: categoryLabel(ruleCategory), name: ruleName(ruleOffer.txn) })}
        </span>
        <span className="tx-offer__actions">
          <Button size="sm" variant="ghost" onClick={() => setRuleOffer(null)} disabled={ruleBusy}>{t('transactions.rule.dismiss')}</Button>
          <Button size="sm" loading={ruleBusy} onClick={acceptRule}>{t('transactions.rule.accept')}</Button>
        </span>
      </>
    ),
  } : undefined

  const onSaved = (kind: SavedKind, count?: number) => {
    const msg: Record<SavedKind, string> = {
      created: t('transactions.form.toastCreated'),
      installments: t('transactions.form.toastInstallments', { count }),
      transfer: t('transactions.form.toastTransfer'),
      updated: t('transactions.form.toastUpdated'),
    }
    toast({ message: msg[kind] })
    if (kind !== 'updated') setPage(1)
    setReload(n => n + 1)
  }

  const deletingPeer = deleting ? transferPeer(deleting, all ?? list?.items ?? []) : undefined
  const transferAccounts = (a: Transaction, b: Transaction) => {
    const [out, inn] = a.amount < 0 ? [a, b] : [b, a]
    const name = (id: string) => accounts.find(x => x.id === id)?.name ?? '—'
    return { from: name(out.account_id), to: name(inn.account_id) }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      // Transferência: as duas pernas saem juntas (uma só deixaria uma conta com saldo errado)
      const peer = transferPeer(deleting, all ?? list?.items ?? [])
      await transactionsService.remove(deleting.id)
      if (peer) await transactionsService.remove(peer.id)
      toast({ message: t('transactions.form.toastDeleted') })
      setDeleting(null)
      setReload(n => n + 1)
    } catch {
      toast({ message: t('transactions.delete.error'), variant: 'error' })
    } finally {
      setDeleteBusy(false)
    }
  }

  const runExport = async (format: ExportFormat) => {
    setExporting(format)
    try {
      const n = await exportTransactions(format, filters, accounts, categories)
      toast(n ? { message: t('transactions.actions.exported', { count: n }) } : { message: t('transactions.actions.exportEmpty'), variant: 'info' })
    } catch {
      toast({ message: t('transactions.actions.exportError'), variant: 'error' })
    } finally {
      setExporting(null)
    }
  }

  const ready = !!list && refsReady
  const filtered = hasAnyFilter(filters)
  const firstRun = ready && list.total === 0 && !filtered
  const subtitle = !ready ? <Skeleton width={140} height={14} style={{ marginTop: '0.375rem' }} />
    : list.total === 0 ? undefined
    : t(filtered ? 'transactions.found' : 'transactions.count', { count: list.total })
  const period = periodText(filters, t)
  const exportScope = list && list.total > 0
    ? t('transactions.actions.exportScopeN', { count: list.total, period: period.phrase })
    : t('transactions.actions.exportScope')

  // Lista vazia com filtro: o texto diz o que foi buscado e em que período, e a ação resolve o caso
  const noResults = () => {
    const term = filters.search.trim()
    const others = activeFilterCount(filters) - (filters.category_id ? 1 : 0)
    if (filters.category_id === NO_CATEGORY && !term && others === 0) {
      // Nenhuma sem categoria é boa notícia (o "..": período que termina em abreviação, como "out.")
      return <EmptyState tone="done" title={t('transactions.list.allCategorizedTitle')} description={t('transactions.list.allCategorizedText', { period: period.phrase }).replace(/\.\.$/, '.')}
        action={<Button variant="secondary" onClick={() => updateFilters({ category_id: '' })}>{t('transactions.list.seeAll')}</Button>} />
    }
    const wider = filters.period !== '' && (
      <Button variant="secondary" icon="search" onClick={() => updateFilters({ period: '', start_date: '', end_date: '' })}>
        {t(term ? 'transactions.list.searchAllTime' : 'transactions.list.seeAllTime')}
      </Button>
    )
    const title = term ? t('transactions.list.noSearchTitle', { term, period: period.phrase })
      : activeFilterCount(filters) ? t('transactions.list.noFilterTitle', { period: period.phrase })
      : t('transactions.list.noPeriodTitle', { period: period.phrase })
    const clear = activeFilterCount(filters) > 0 && <Button variant="ghost" icon="close" onClick={clearFilters}>{t('transactions.filters.clear')}</Button>
    return <EmptyState title={title} description={activeFilterCount(filters) ? t('transactions.list.noResultsText') : undefined}
      action={(wider || clear) && <>{wider}{clear}</>} />
  }

  return (
    <Page className="tx-page">
      <PageHeader title={t('transactions.title')} subtitle={subtitle} actions={!firstRun && (
        <>
          {!mobile && <Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>{t('transactions.actions.import')}</Button>}
          <ExportMenu busy={exporting} onExport={runExport} onImport={() => setImporting(true)} scope={exportScope} />
          <Button icon="plus" onClick={() => setCreating(true)}>{t(mobile ? 'transactions.actions.newShort' : 'transactions.actions.new')}</Button>
        </>
      )} />

      {failed && !busy ? (
        <Card>
          <EmptyState tone="error" title={t('transactions.list.loadError')} description={t('transactions.list.loadErrorText')}
            action={<Button variant="secondary" icon="refresh" onClick={() => setReload(n => n + 1)}>{t('transactions.list.retry')}</Button>} />
        </Card>
      ) : !ready ? (
        <Card padding="none" className="tx-list-card"><ListSkeleton /></Card>
      ) : firstRun ? (
        <Card>
          {accounts.length === 0 ? (
            <EmptyState title={t('transactions.list.noAccountTitle')} description={t('transactions.list.noAccountText')}
              action={<Button icon="plus" onClick={() => navigate('/profile')}>{t('transactions.list.goToProfile')}</Button>} />
          ) : (
            // Primeiro contato: o desenho do que o extrato vira, com a importação como ação principal
            <EmptyState preview={<SampleRows categories={categories} />} title={t('transactions.list.emptyTitle')} description={t('transactions.list.emptyText')}
              action={<>
                <Button icon="upload" onClick={() => setImporting(true)}>{t('transactions.import.title')}</Button>
                <Button variant="secondary" icon="plus" onClick={() => setCreating(true)}>{t('transactions.list.addByHand')}</Button>
              </>} />
          )}
        </Card>
      ) : (
        <>
          <p className="tx-print-only">{describeFilters(filters, accounts, categories)}</p>
          <FilterBar filters={filters} onChange={updateFilters} onClear={clearFilters} accounts={accounts} categories={categories} tags={tags} />
          <MonthNav filters={filters} onChange={updateFilters} />
          {list.total > 0 && !reviewing && <SummaryStrip data={all} categories={categories} onReview={() => updateFilters({ review: '1' })} />}
          {reviewing ? (
            <div className="tx-review" role="status">
              <span className="tx-review__icon" aria-hidden><Icon name="sparkle" size={16} /></span>
              <div className="tx-review__text">
                <strong>{t('transactions.review.title', { count: reviewCount ?? 0 })}</strong>
                <span>{t('transactions.review.text')}</span>
              </div>
              <Button variant="ghost" size="sm" icon="close" onClick={() => updateFilters({ review: '' })}>{t('transactions.review.exit')}</Button>
            </div>
          ) : null}
          <div ref={listTop} className="tx-anchor" />
          <Card padding="none" className="tx-list-card">
            {list.total === 0 ? noResults() : (
              <TransactionList items={list.items} dayTotalsFrom={all} accounts={accounts} categories={categories}
                page={Math.min(page, list.pages)} totalPages={list.pages} total={list.total} busy={busy}
                onPage={goToPage} onEdit={setEditing} onDelete={setDeleting} onCategory={changeCategory} onConfirm={reviewing ? confirmOne : undefined} offer={offer} />
            )}
            {/* Rodapé fixo do modo revisão: confirma de uma vez as que já têm categoria */}
            {reviewing && confirmable.length > 0 && (
              <div className="tx-review-foot">
                {uncategorized > 0 && <span className="tx-review-foot__hint">{t('transactions.review.footHint', { count: uncategorized })}</span>}
                <Button icon="check" loading={confirmingAll} onClick={confirmAll}>{t('transactions.review.confirmAll', { count: confirmable.length })}</Button>
              </div>
            )}
          </Card>
        </>
      )}

      <TransactionModal open={creating} onClose={closeCreate} accounts={accounts} categories={categories}
        defaultAccountId={filters.account_id} onSaved={onSaved} />
      <TransactionModal open={!!editing} initial={editing} onClose={() => setEditing(null)} accounts={accounts} categories={categories}
        onSaved={onSaved} onDelete={tx => { setEditing(null); setDeleting(tx) }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteBusy}
        title={t('transactions.delete.title')} confirmLabel={t('transactions.delete.confirm')}
        message={deleting && (deletingPeer
          ? t('transactions.delete.transferMessage', { ...transferAccounts(deleting, deletingPeer), date: formatDate(deleting.transaction_date), amount: formatCurrency(Math.abs(deleting.amount)) })
          : t('transactions.delete.message', { name: deleting.description, date: formatDate(deleting.transaction_date), amount: formatCurrency(Math.abs(deleting.amount)) }))} />
      <ImportModal open={importing} onClose={closeImport} accounts={accounts} categories={categories} defaultAccountId={filters.account_id}
        onImported={() => { setPage(1); setReload(n => n + 1) }}
        onReview={() => { closeImport(); setFiltersState({ ...DEFAULT_FILTERS, period: '', review: '1' }); setPage(1) }} />
    </Page>
  )
}
