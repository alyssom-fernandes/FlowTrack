import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal, Money, Select, Textarea } from '../../components/ui'
import { Icon } from '../../components/icons'
import { investmentsService } from '../../services'
import { formatPercent } from '../../utils'
import type { Investment, InvestmentCreate, InvestmentType } from '../../types'
import { amountPlaceholder, amountToInput, parseAmount } from '../goals/helpers'
import { TYPE_ORDER } from './model'
import '../goals/form.css'

interface FormState { name: string; type: InvestmentType; institution: string; invested: string; current: string; notes: string }
type Errors = Partial<Record<'name' | 'invested' | 'current', string>>

function initialForm(inv: Investment | null): FormState {
  if (!inv) return { name: '', type: 'tesouro_direto', institution: '', invested: '', current: '', notes: '' }
  return {
    name: inv.name, type: inv.type, institution: inv.institution || '', notes: inv.notes || '',
    invested: amountToInput(inv.total_invested), current: inv.current_value ? amountToInput(inv.current_value) : '0',
  }
}

export function InvestmentModal({ open, investment, onClose, onSaved }: {
  open: boolean
  investment: Investment | null
  onClose: () => void
  onSaved: (created: boolean) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [form, setForm] = useState<FormState>(() => initialForm(investment))
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialForm(investment))
    setErrors({})
    setSaveError('')
  }, [open, investment])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: undefined }))
  }

  const invested = parseAmount(form.invested)
  const current = parseAmount(form.current)
  const hasPreview = invested > 0 && current >= 0
  const profit = hasPreview ? current - invested : 0
  const profitPct = hasPreview ? (profit / invested) * 100 : 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    if (!form.name.trim()) next.name = t('investments.form.errorName')
    if (!(invested > 0)) next.invested = t('investments.form.errorInvested')
    if (!(current >= 0)) next.current = t('investments.form.errorCurrent')
    setErrors(next)
    if (Object.keys(next).length) return

    // Texto vazio (e não nulo) para conseguir limpar instituição e notas ao editar
    const payload: InvestmentCreate = {
      name: form.name.trim(), type: form.type,
      institution: form.institution.trim() || (investment ? '' : undefined),
      notes: form.notes.trim() || (investment ? '' : undefined),
      total_invested: Math.round(invested * 100) / 100, current_value: Math.round(current * 100) / 100,
    }
    setSaving(true)
    setSaveError('')
    try {
      if (investment) await investmentsService.update(investment.id, payload)
      else await investmentsService.create(payload)
      onSaved(!investment)
    } catch {
      setSaveError(t('investments.form.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  const tone = profit > 0 ? 'gl-pos' : profit < 0 ? 'gl-neg' : ''

  return (
    <Modal open={open} onClose={onClose} title={investment ? t('investments.editInvestment') : t('investments.newInvestment')} width="32rem"
      description={investment ? t('investments.form.currentHint') : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form={formId} loading={saving}>{investment ? t('common.saveChanges') : t('investments.form.create')}</Button>
      </>}>
      <form id={formId} className="gl-form" onSubmit={submit} noValidate>
        <Input label={t('investments.form.name')} value={form.name} onChange={e => set('name', e.target.value)} maxLength={80}
          placeholder={t('investments.form.namePlaceholder')} error={errors.name} />

        <div className="gl-form__row">
          <Select label={t('investments.form.type')} value={form.type} onChange={e => set('type', e.target.value as InvestmentType)}>
            {TYPE_ORDER.map(type => <option key={type} value={type}>{t(`investments.types.${type}`)}</option>)}
          </Select>
          <Input label={t('investments.form.institution')} optional value={form.institution} onChange={e => set('institution', e.target.value)}
            placeholder={t('investments.form.institutionPlaceholder')} maxLength={60} />
        </div>

        <div className="gl-form__row">
          <Input label={t('investments.form.invested')} value={form.invested} onChange={e => set('invested', e.target.value)}
            inputMode="decimal" placeholder={amountPlaceholder()} leading="R$" className="ft-num" error={errors.invested} />
          <Input label={t('investments.form.current')} value={form.current} onChange={e => set('current', e.target.value)}
            inputMode="decimal" placeholder={amountPlaceholder()} leading="R$" className="ft-num" error={errors.current} />
        </div>

        <div className="inv-preview" aria-live="polite">
          <span className="inv-preview__label">{t('investments.form.preview')}</span>
          <span className={`inv-preview__value ft-num ${tone}`}>
            {hasPreview ? <><Money value={profit} signed /> ({formatPercent(profitPct, 1, true)})</> : '—'}
          </span>
        </div>

        <Textarea label={t('investments.form.notes')} optional value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder={t('investments.form.notesPlaceholder')} rows={2} maxLength={240} />

        {saveError && <p className="gl-form__error" role="alert"><Icon name="alertCircle" size={16} />{saveError}</p>}
      </form>
    </Modal>
  )
}
