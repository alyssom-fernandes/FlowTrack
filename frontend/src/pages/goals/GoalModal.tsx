import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Select, Tabs } from '../../components/ui'
import { Icon } from '../../components/icons'
import { GlyphPicker } from '../../components/glyphs'
import { goalsService } from '../../services'
import { categoryLabel, toISODate } from '../../utils'
import type { Category, Goal, GoalColor, GoalCreate, GoalType } from '../../types'
import { amountPlaceholder, amountToInput, goalColorVar, isSpendingCategory, parseAmount, GOAL_COLORS } from './helpers'
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
  color: GoalColor
  icon: string
}

type Errors = Partial<Record<'name' | 'amount' | 'start' | 'end', string>>

// Meta sem cor e ícone salvos começa no vinho e no cofrinho (ou no glifo da categoria, como o card já mostra)
function initialForm(goal: Goal | null, presetType: GoalType, categories: Category[]): FormState {
  const today = new Date()
  if (goal) {
    const cat = categories.find(c => c.id === goal.category_id)
    return {
      type: goal.type, name: goal.name, amount: amountToInput(goal.target_amount), period: goal.period,
      category_id: goal.category_id || '', start_date: goal.start_date, end_date: goal.end_date || '',
      color: goal.color && GOAL_COLORS.includes(goal.color) ? goal.color : 'accent', icon: goal.icon || cat?.icon || 'piggy-bank',
    }
  }
  return {
    type: presetType, name: '', amount: '', period: presetType === 'savings_target' ? 'custom' : 'monthly', category_id: '',
    start_date: toISODate(today), end_date: presetType === 'savings_target' ? `${today.getFullYear()}-12-31` : '',
    color: 'accent', icon: 'piggy-bank',
  }
}

// Cores da meta: rádio com setas, como o GlyphPicker
function GoalColorPicker({ value, onChange, label }: { value: GoalColor; onChange: (c: GoalColor) => void; label: string }) {
  const { t } = useTranslation()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => {
    const next = (i + GOAL_COLORS.length) % GOAL_COLORS.length
    onChange(GOAL_COLORS[next])
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="gl-swatches">
      {GOAL_COLORS.map((c, i) => {
        const on = c === value
        const name = t(`goals.form.colors.${c}`)
        return (
          <button key={c} ref={el => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} aria-label={name} title={name}
            tabIndex={on ? 0 : -1} className="gl-swatch" style={{ '--c': goalColorVar(c) } as React.CSSProperties} onClick={() => onChange(c)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
            }}>
            {on && <Icon name="check" size={15} strokeWidth={2.5} />}
          </button>
        )
      })}
    </div>
  )
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
  const [form, setForm] = useState<FormState>(() => initialForm(goal, presetType, categories))
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [periodTouched, setPeriodTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialForm(goal, presetType, categories))
    setErrors({})
    setSaveError('')
    setPeriodTouched(false)
    // categories fica de fora: a lista recarregada não deve apagar o que já foi digitado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal, presetType])

  // Meta nova: o período acompanha o tipo até a pessoa escolher outro
  const changeType = (type: GoalType) => {
    if (goal || periodTouched) return set('type', type)
    const base = initialForm(null, type, categories)
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
      // Cor e ícone são da meta de economia; o limite segue a cor da categoria
      ...(form.type === 'savings_target' ? { color: form.color, icon: form.icon } : {}),
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

        {!isLimit && (
          <div className="gl-form__identity">
            <Field label={t('goals.form.colorLabel')}>
              <GoalColorPicker value={form.color} onChange={c => set('color', c)} label={t('goals.form.colorLabel')} />
            </Field>
            <Field label={t('goals.form.iconLabel')}>
              <GlyphPicker value={form.icon} onChange={n => set('icon', n)} color={goalColorVar(form.color)} label={t('goals.form.iconLabel')} />
            </Field>
          </div>
        )}

        {saveError && <p className="gl-form__error" role="alert"><Icon name="alertCircle" size={16} />{saveError}</p>}
      </form>
    </Modal>
  )
}
