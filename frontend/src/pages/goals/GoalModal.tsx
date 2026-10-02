import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Select, Tabs } from '../../components/ui'
import { Icon } from '../../components/icons'
import { goalsService } from '../../services'
import { categoryLabel, toISODate } from '../../utils'
import type { Category, Goal, GoalCreate, GoalType } from '../../types'
import { amountPlaceholder, amountToInput, isSpendingCategory, parseAmount } from './helpers'
import './form.css'

type Period = 'monthly' | 'yearly' | 'custom'

interface FormState {
  type: GoalType
  name: string
  amount: string
  period: Period
  category_id: string
  start_date: string
  end_date: string
}

type Errors = Partial<Record<'name' | 'amount' | 'start' | 'end', string>>

function initialForm(goal: Goal | null, presetType: GoalType): FormState {
  const today = new Date()
  if (goal) {
    return {
      type: goal.type, name: goal.name, amount: amountToInput(goal.target_amount), period: goal.period,
      category_id: goal.category_id || '', start_date: goal.start_date, end_date: goal.end_date || '',
    }
  }
  return {
    type: presetType, name: '', amount: '', period: presetType === 'savings_target' ? 'custom' : 'monthly', category_id: '',
    start_date: toISODate(today), end_date: presetType === 'savings_target' ? `${today.getFullYear()}-12-31` : '',
  }
}

export function GoalModal({ open, goal, presetType, categories, onClose, onSaved }: {
  open: boolean
  goal: Goal | null
  presetType: GoalType
  categories: Category[]
  onClose: () => void
  onSaved: (created: boolean) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [form, setForm] = useState<FormState>(() => initialForm(goal, presetType))
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [periodTouched, setPeriodTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialForm(goal, presetType))
    setErrors({})
    setSaveError('')
    setPeriodTouched(false)
  }, [open, goal, presetType])

  // Meta nova: o período acompanha o tipo até a pessoa escolher outro
  const changeType = (type: GoalType) => {
    if (goal || periodTouched) return set('type', type)
    const base = initialForm(null, type)
    setForm(f => ({ ...f, type, period: base.period, start_date: base.start_date, end_date: base.end_date }))
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k === 'start_date' ? 'start' : k === 'end_date' ? 'end' : k]: undefined }))
  }

  const isLimit = form.type === 'spending_limit'
  const options = categories.filter(c => !isLimit || isSpendingCategory(c) || c.id === form.category_id)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    const amount = parseAmount(form.amount)
    if (!form.name.trim()) next.name = t('goals.form.errorName')
    if (!(amount > 0)) next.amount = t('goals.form.errorAmount')
    if (form.period === 'custom') {
      if (!form.start_date) next.start = t('goals.form.errorStart')
      if (!form.end_date || (form.start_date && form.end_date < form.start_date)) next.end = t('goals.form.errorEnd')
    }
    setErrors(next)
    if (Object.keys(next).length) return

    // Mensal e anual usam o período corrente; a data de início só registra quando a meta nasceu
    const today = new Date()
    const payload: GoalCreate = {
      name: form.name.trim(), type: form.type, target_amount: Math.round(amount * 100) / 100, period: form.period,
      category_id: form.category_id || undefined,
      start_date: form.period === 'custom' ? form.start_date : goal?.start_date || toISODate(new Date(today.getFullYear(), form.period === 'yearly' ? 0 : today.getMonth(), 1)),
      end_date: form.period === 'custom' ? form.end_date : undefined,
    }
    setSaving(true)
    setSaveError('')
    try {
      if (goal) await goalsService.update(goal.id, payload)
      else await goalsService.create(payload)
      onSaved(!goal)
    } catch {
      setSaveError(t('goals.form.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={goal ? t('goals.editGoal') : t('goals.newGoal')} width="30rem"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form={formId} loading={saving}>{goal ? t('common.saveChanges') : t('goals.form.create')}</Button>
      </>}>
      <form id={formId} className="gl-form" onSubmit={submit} noValidate>
        <Field label={t('goals.form.typeLabel')}>
          <Tabs block label={t('goals.form.typeLabel')} value={form.type} onChange={changeType}
            items={(['spending_limit', 'savings_target'] as GoalType[]).map(v => ({ value: v, label: t(`goals.type.${v}`) }))} />
        </Field>

        <Input label={t('goals.form.nameLabel')} value={form.name} onChange={e => set('name', e.target.value)} maxLength={80}
          placeholder={isLimit ? t('goals.form.namePlaceholderLimit') : t('goals.form.namePlaceholderSavings')} error={errors.name} />

        <div className="gl-form__row">
          <Input label={isLimit ? t('goals.form.amountLimit') : t('goals.form.amountSavings')} value={form.amount}
            onChange={e => set('amount', e.target.value)} inputMode="decimal" placeholder={amountPlaceholder()} leading="R$" error={errors.amount}
            className="ft-num" />
          <Select label={t('goals.form.periodLabel')} value={form.period} onChange={e => { setPeriodTouched(true); set('period', e.target.value as Period) }}>
            {(['monthly', 'yearly', 'custom'] as Period[]).map(p => <option key={p} value={p}>{t(`goals.period.${p}`)}</option>)}
          </Select>
        </div>

        {form.period === 'custom' && (
          <div className="gl-form__row">
            <Input label={t('goals.form.startDate')} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} error={errors.start} />
            <Input label={t('goals.form.endDate')} type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => set('end_date', e.target.value)} error={errors.end} />
          </div>
        )}

        <Select label={t('goals.form.categoryLabel')} value={form.category_id} onChange={e => set('category_id', e.target.value)}
          hint={isLimit ? t('goals.form.hintLimit') : t('goals.form.hintSavings')}>
          {/* A API ignora nulos no PATCH: uma meta com categoria não volta a "todas" */}
          <option value="" disabled={!!goal?.category_id}>{isLimit ? t('goals.allSpending') : t('goals.allIncome')}</option>
          {options.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
        </Select>

        {saveError && <p className="gl-form__error" role="alert"><Icon name="alertCircle" size={16} />{saveError}</p>}
      </form>
    </Modal>
  )
}
