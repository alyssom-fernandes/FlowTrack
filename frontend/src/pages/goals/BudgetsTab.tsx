import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Button, Card, ConfirmDialog, EmptyState, IconButton, ProgressBar, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { budgetsService, categoriesService } from '../../services'
import { useToastStore } from '../../store'
import { categoryLabel, formatCurrency, formatPercent } from '../../utils'
import type { Budget, Category } from '../../types'
import { isSpendingCategory, monthKey, monthName, monthTitle, shiftMonth } from './helpers'
import { BudgetModal } from './BudgetModal'

function Summary({ budgets, daysLeft, future }: { budgets: Budget[]; daysLeft: number | null; future: boolean }) {
  const { t } = useTranslation()
  const limit = budgets.reduce((s, b) => s + b.limit_amount, 0)
  const spent = budgets.reduce((s, b) => s + b.spent, 0)
  const rest = limit - spent
  const pct = limit > 0 ? (spent / limit) * 100 : 0
  const over = budgets.filter(b => b.spent > b.limit_amount).length
  return (
    <Card className="gl-bsum">
      <div className="gl-bsum__figs">
        <div className="gl-fig gl-fig--budget">
          <span className="gl-fig__label">{t('goals.budgets.budgeted')}</span>
          <span className="gl-fig__value">{formatCurrency(limit)}</span>
        </div>
        <div className="gl-fig gl-fig--spent">
          <span className="gl-fig__label">{t('goals.budgets.spent')}</span>
          <span className="gl-fig__value">{formatCurrency(spent)}</span>
        </div>
        <div className="gl-fig gl-fig--rest">
          <span className="gl-fig__label">{rest >= 0 ? t('goals.budgets.remaining') : t('goals.budgets.overTotal')}</span>
          <span className={`gl-fig__value${rest < 0 ? ' gl-neg' : ''}`}>{formatCurrency(Math.abs(rest))}</span>
        </div>
      </div>
      <ProgressBar value={pct} tone="spending" height={8} label={t('goals.budgets.usedPct', { pct: formatPercent(pct, 0, false) })} />
      <div className="gl-bsum__foot ft-num">
        <span className="gl-bsum__foot-item">
          {t('goals.budgets.usedPct', { pct: formatPercent(pct, 0, false) })}
          <span aria-hidden>·</span>
          {over > 0
            ? <span className="gl-neg">{t('goals.budgets.overCount', { count: over })}</span>
            : future ? t('goals.budgets.notStarted') : t('goals.budgets.allWithin')}
        </span>
        {daysLeft !== null && <span className="gl-bsum__foot-item"><Icon name="calendar" size={14} />{t('goals.budgets.daysLeft', { count: daysLeft })}</span>}
      </div>
    </Card>
  )
}

function BudgetRow({ budget, category, onEdit, onDelete }: { budget: Budget; category?: Category; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const name = category ? categoryLabel(category) : budget.category_name || '—'
  const rest = budget.limit_amount - budget.spent
  const pct = budget.limit_amount > 0 ? (budget.spent / budget.limit_amount) * 100 : 0
  return (
    <li className="gl-brow">
      <span className="gl-brow__name">
        <span className="gl-dot" style={{ background: category?.color || budget.category_color || 'var(--chart-neutral)' }} aria-hidden />
        <span>{name}</span>
      </span>
      <div className="gl-brow__bar"><ProgressBar value={pct} tone="spending" label={`${name}: ${formatPercent(pct, 0, false)}`} /></div>
      <span className="gl-brow__spent ft-num">
        {t('goals.budgets.spentOf', { spent: formatCurrency(budget.spent), limit: formatCurrency(budget.limit_amount) })}
      </span>
      <span className={`gl-brow__left ft-num${rest < 0 ? ' gl-neg' : ''}`}>
        {rest >= 0 ? t('goals.budgets.left', { value: formatCurrency(rest) }) : t('goals.budgets.overBy', { value: formatCurrency(-rest) })}
      </span>
      <span className={`gl-brow__pct ft-num${pct > 100 ? ' gl-neg' : ''}`}>{formatPercent(pct, 0, false)}</span>
      <span className="gl-brow__actions">
        <IconButton icon="edit" label={t('goals.actions.edit', { name })} onClick={onEdit} />
        <IconButton icon="trash" label={t('goals.actions.delete', { name })} onClick={onDelete} />
      </span>
    </li>
  )
}

function BudgetsSkeleton() {
  return (
    <>
      <Card className="gl-bsum" aria-busy="true">
        <div className="gl-bsum__figs">
          {[0, 1, 2].map(i => <div key={i} className="gl-fig"><Skeleton width="50%" height={12} /><Skeleton width="80%" height={24} /></div>)}
        </div>
        <Skeleton height={8} radius="9999px" />
      </Card>
      <Card padding="none">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="gl-brow"><Skeleton width="60%" height={14} style={{ gridArea: 'name' }} /><Skeleton height={6} radius="9999px" style={{ gridArea: 'bar' }} /></div>
        ))}
      </Card>
    </>
  )
}

export function BudgetsTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => new Date())
  const current = monthKey(today)
  const raw = params.get('mes')
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : current
  const prev = shiftMonth(month, -1)

  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [prevBudgets, setPrevBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [removing, setRemoving] = useState<Budget | null>(null)
  const [busy, setBusy] = useState(false)

  const setMonth = (m: string) => {
    const next = new URLSearchParams(params)
    if (m === current) next.delete('mes')
    else next.set('mes', m)
    setParams(next, { replace: true })
  }

  const load = useCallback(async (key: string, isCurrent: () => boolean = () => true) => {
    setFailed(false)
    try {
      const [res, cats] = await Promise.all([budgetsService.list(key), categoriesService.list()])
      // Mês vazio: vê se dá para copiar do anterior
      const before = res.budgets.length ? [] : (await budgetsService.list(shiftMonth(key, -1))).budgets
      if (!isCurrent()) return
      setBudgets(res.budgets)
      setPrevBudgets(before)
      setCategories(cats.categories || [])
    } catch {
      if (isCurrent()) setFailed(true)
    }
  }, [])

  useEffect(() => {
    let alive = true
    setBudgets(null)
    load(month, () => alive)
    return () => { alive = false }
  }, [month, load])

  const close = () => { onCreatingChange(false); setEditing(null) }
  const saved = (created: boolean) => {
    close()
    toast({ message: created ? t('goals.budgets.toast.created') : t('goals.budgets.toast.updated') })
    load(month)
  }

  const copyPrevious = async () => {
    setBusy(true)
    try {
      const have = new Set((budgets || []).map(b => b.category_id))
      const todo = prevBudgets.filter(b => !have.has(b.category_id))
      await Promise.all(todo.map(b => budgetsService.create({ category_id: b.category_id, month, limit_amount: b.limit_amount })))
      toast({ message: t('goals.budgets.toast.copied', { count: todo.length, month: monthName(prev, month) }) })
      await load(month)
    } catch {
      toast({ message: t('goals.budgets.toast.copyError'), variant: 'error' })
      load(month)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await budgetsService.remove(removing.id)
      toast({ message: t('goals.budgets.toast.deleted') })
      setRemoving(null)
      load(month)
    } catch {
      toast({ message: t('goals.budgets.toast.deleteError'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const catById = new Map(categories.map(c => [c.id, c]))
  const sorted = [...(budgets || [])].sort((a, b) => b.spent / (b.limit_amount || 1) - a.spent / (a.limit_amount || 1))
  const taken = new Set((budgets || []).map(b => b.category_id))
  const daysLeft = month === current ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1 : null
  const removingName = removing ? (catById.get(removing.category_id) ? categoryLabel(catById.get(removing.category_id)) : removing.category_name || '') : ''

  return (
    <div className="gl-panel" style={{ gap: '1rem' }}>
      <div className="gl-toolbar">
        <div className="gl-month" role="group" aria-label={t('goals.budgets.monthNav')}>
          <IconButton icon="chevronLeft" variant="secondary" label={t('goals.budgets.prevMonth')} onClick={() => setMonth(prev)} />
          <h2 className="gl-month__label" aria-live="polite">{monthTitle(month)}</h2>
          <IconButton icon="chevronRight" variant="secondary" label={t('goals.budgets.nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
        {month !== current && <Button variant="ghost" size="sm" icon="calendar" onClick={() => setMonth(current)}>{t('goals.budgets.thisMonth')}</Button>}
      </div>

      {failed ? (
        <Card>
          <EmptyState icon="alertCircle" title={t('goals.budgets.loadError')}
            action={<Button variant="secondary" icon="refresh" onClick={() => load(month)}>{t('goals.retry')}</Button>} />
        </Card>
      ) : budgets === null ? (
        <BudgetsSkeleton />
      ) : budgets.length === 0 ? (
        <Card>
          <EmptyState icon="wallet" title={t('goals.budgets.empty.title', { month: monthName(month, current) })}
            description={month < current && !prevBudgets.length ? t('goals.budgets.empty.textPast') : t('goals.budgets.empty.text')}
            action={prevBudgets.length > 0 ? <>
              <Button icon="repeat" loading={busy} onClick={copyPrevious}>{t('goals.budgets.empty.copy', { month: monthName(prev, month) })}</Button>
              <Button variant="secondary" icon="plus" onClick={() => onCreatingChange(true)}>{t('goals.budgets.empty.create')}</Button>
            </> : <Button icon="plus" onClick={() => onCreatingChange(true)}>{t('goals.budgets.empty.create')}</Button>} />
        </Card>
      ) : (
        <>
          <Summary budgets={budgets} daysLeft={daysLeft} future={month > current} />
          <Card padding="none">
            <ul className="gl-blist" aria-label={t('goals.budgets.listLabel')}>
              {sorted.map(b => (
                <BudgetRow key={b.id} budget={b} category={catById.get(b.category_id)}
                  onEdit={() => { setEditing(b); onCreatingChange(false) }} onDelete={() => setRemoving(b)} />
              ))}
            </ul>
          </Card>
        </>
      )}

      <BudgetModal open={creating || !!editing} month={month} budget={editing} taken={taken}
        categories={categories.filter(isSpendingCategory)} onClose={close} onSaved={saved} />

      <ConfirmDialog open={!!removing} onClose={() => !busy && setRemoving(null)} onConfirm={confirmDelete} loading={busy}
        title={t('goals.budgets.delete.title')}
        message={removing ? t('goals.budgets.delete.message', { name: removingName, month: monthName(month, current) }) : undefined}
        confirmLabel={t('goals.budgets.delete.confirm')} />
    </div>
  )
}
