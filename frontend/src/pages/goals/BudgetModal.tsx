import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Button, Input, Modal, Select } from '../../components/ui'
import { Icon } from '../../components/icons'
import { budgetsService, transactionsService } from '../../services'
import { categoryLabel, formatCurrency } from '../../utils'
import type { Budget, Category } from '../../types'
import { amountPlaceholder, amountToInput, monthBounds, monthTitle, parseAmount, shiftMonth } from './helpers'
import './form.css'

// Média de gastos da categoria nos 3 meses anteriores ao do orçamento (transferências fora)
function useAverage(categoryId: string, month: string, enabled: boolean): number | null | undefined {
  const [avg, setAvg] = useState<{ key: string; value: number | null }>({ key: '', value: null })
  const key = `${categoryId}|${month}`
  useEffect(() => {
    if (!enabled || !categoryId) return
    let ignore = false
    const start = monthBounds(shiftMonth(month, -3)).start
    const end = monthBounds(shiftMonth(month, -1)).end
    transactionsService.list({ category_id: categoryId, start_date: start, end_date: end, page_size: 500 })
      .then(res => {
        const spent = (res.transactions || []).filter(tx => tx.amount < 0 && tx.type !== 'transfer').reduce((s, tx) => s - tx.amount, 0)
        if (!ignore) setAvg({ key, value: spent > 0 ? Math.round((spent / 3) * 100) / 100 : 0 })
      })
      .catch(() => { if (!ignore) setAvg({ key, value: null }) })
    return () => { ignore = true }
  }, [categoryId, month, enabled, key])
  // undefined = carregando ou sem categoria
  return categoryId && avg.key === key ? avg.value : undefined
}

export function BudgetModal({ open, month, budget, categories, taken, onClose, onSaved }: {
  open: boolean
  month: string
  budget: Budget | null
  categories: Category[]
  taken: Set<string>
  onClose: () => void
  onSaved: (created: boolean) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState<{ category?: string; amount?: string }>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategoryId(budget?.category_id || '')
    setAmount(amountToInput(budget?.limit_amount))
    setErrors({})
    setSaveError('')
  }, [open, budget])

  const available = categories.filter(c => !taken.has(c.id))
  const category = categories.find(c => c.id === (budget?.category_id || categoryId))
  const avg = useAverage(budget?.category_id || categoryId, month, open)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = parseAmount(amount)
    const next: typeof errors = {}
    if (!budget && !categoryId) next.category = t('goals.budgets.form.errorCategory')
    if (!(value > 0)) next.amount = t('goals.budgets.form.errorAmount')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    setSaveError('')
    try {
      const limit = Math.round(value * 100) / 100
      if (budget) await budgetsService.update(budget.id, limit)
      else await budgetsService.create({ category_id: categoryId, month, limit_amount: limit })
      onSaved(!budget)
    } catch (err) {
      setSaveError(isAxiosError(err) && err.response?.status === 409 ? t('goals.budgets.form.errorDuplicate') : t('goals.budgets.form.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  const noneLeft = !budget && available.length === 0
  const description = budget && category ? `${categoryLabel(category)} · ${monthTitle(month)}` : monthTitle(month)

  return (
    <Modal open={open} onClose={onClose} title={budget ? t('goals.budgets.edit') : t('goals.budgets.new')} description={description} width="26rem"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form={formId} loading={saving} disabled={noneLeft}>{budget ? t('common.saveChanges') : t('goals.budgets.form.create')}</Button>
      </>}>
      <form id={formId} className="gl-form" onSubmit={submit} noValidate>
        {noneLeft ? (
          <p className="gl-form__note">{t('goals.budgets.form.allTaken')}</p>
        ) : (
          <>
            {!budget && (
              <Select label={t('goals.budgets.form.categoryLabel')} value={categoryId} error={errors.category}
                onChange={e => { setCategoryId(e.target.value); setErrors(x => ({ ...x, category: undefined })) }}>
                <option value="" disabled>{t('goals.budgets.form.choose')}</option>
                {available.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
              </Select>
            )}
            <Input label={t('goals.budgets.form.limitLabel')} value={amount} error={errors.amount}
              onChange={e => { setAmount(e.target.value); setErrors(x => ({ ...x, amount: undefined })) }}
              inputMode="decimal" placeholder={amountPlaceholder()} leading="R$" className="ft-num"
              hint={avg !== undefined && avg !== null && (
                <span className="gl-hint-row">
                  <span className="ft-num">{avg > 0 ? t('goals.budgets.form.average', { value: formatCurrency(avg) }) : t('goals.budgets.form.noHistory')}</span>
                  {avg > 0 && <button type="button" className="gl-link" onClick={() => { setAmount(amountToInput(Math.ceil(avg))); setErrors(x => ({ ...x, amount: undefined })) }}>{t('goals.budgets.form.useAverage')}</button>}
                </span>
              )} />
          </>
        )}
        {saveError && <p className="gl-form__error" role="alert"><Icon name="alertCircle" size={16} />{saveError}</p>}
      </form>
    </Modal>
  )
}
