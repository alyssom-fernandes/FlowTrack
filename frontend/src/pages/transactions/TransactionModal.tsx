// Nova transação, transferência entre contas e edição
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, Input, Modal, Select, Tabs, Textarea } from '../../components/ui'
import { Icon } from '../../components/icons'
import { transactionsService, transfersService } from '../../services'
import { categoryLabel, formatCurrency, formatNumber, toISODate } from '../../utils'
import type { Account, Category, Transaction } from '../../types'
import { amountToInput, parseAmount, parseTags } from './shared'

type Kind = 'debit' | 'credit' | 'transfer'
export type SavedKind = 'created' | 'installments' | 'transfer' | 'updated'

interface Props {
  open: boolean
  onClose: () => void
  initial?: Transaction | null
  accounts: Account[]
  categories: Category[]
  defaultAccountId?: string
  onSaved: (kind: SavedKind, count?: number) => void
  onDelete?: (t: Transaction) => void
}

const accountLabel = (a: Account) => (a.bank_name && a.bank_name !== a.name ? `${a.name} · ${a.bank_name}` : a.name)

// Mesma data em meses seguintes, sem pular para o mês seguinte (31/01 → 28/02)
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const last = new Date(y, m - 1 + n + 1, 0).getDate()
  return toISODate(new Date(y, m - 1 + n, Math.min(d, last)))
}

export function TransactionModal({ open, onClose, initial, accounts, categories, defaultAccountId, onSaved, onDelete }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isEdit = !!initial
  const editingTransfer = initial?.type === 'transfer'

  const [kind, setKind] = useState<Kind>('debit')
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState(toISODate())
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [tagsStr, setTagsStr] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [split, setSplit] = useState(false)
  const [countStr, setCountStr] = useState('3')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // Preenche o formulário quando o modal abre (ou troca a transação editada)
  const openKey = open ? (initial?.id ?? 'new') : ''
  const [loadedKey, setLoadedKey] = useState('')
  if (openKey !== loadedKey) {
    setLoadedKey(openKey)
    if (open) {
      const firstAcc = (defaultAccountId && accounts.some(a => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id) || ''
      if (initial) {
        setKind(initial.type)
        setDescription(initial.description)
        setAmountStr(amountToInput(initial.amount))
        setDate(initial.transaction_date)
        setAccountId(initial.account_id)
        setCategoryId(initial.category_id || '')
        setNotes(initial.notes || '')
        setTagsStr((initial.tags || []).join(', '))
        setRecurring(initial.is_recurring)
      } else {
        setKind('debit'); setDescription(''); setAmountStr(''); setDate(toISODate())
        setAccountId(firstAcc); setCategoryId(''); setNotes(''); setTagsStr(''); setRecurring(false)
      }
      setToAccountId(accounts.find(a => a.id !== firstAcc)?.id || '')
      setSplit(false); setCountStr('3'); setErrors({}); setFormError(''); setSaving(false)
    }
  }

  // Contas que chegaram depois de abrir
  useEffect(() => {
    if (!open || initial || accountId || !accounts.length) return
    setAccountId(accounts[0].id)
    setToAccountId(accounts[1]?.id || '')
  }, [open, initial, accountId, accounts])

  const sortedCats = useMemo(() => [...categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [categories])
  const isTransfer = kind === 'transfer'
  const amount = parseAmount(amountStr)
  const count = parseInt(countStr, 10)
  const splitting = split && !isEdit && !isTransfer

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!isTransfer && !description.trim()) e.description = t('transactions.form.errors.description')
    if (!editingTransfer && (!Number.isFinite(amount) || amount <= 0)) e.amount = t('transactions.form.errors.amount')
    if (!date) e.date = t('transactions.form.errors.date')
    if (!editingTransfer && !accountId) e.account = t('transactions.form.errors.account')
    if (isTransfer && !isEdit) {
      if (!toAccountId) e.to = t('transactions.form.errors.to')
      else if (toAccountId === accountId) e.to = t('transactions.form.errors.same')
    }
    if (splitting && (!Number.isInteger(count) || count < 2 || count > 48)) e.count = t('transactions.form.errors.installments')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (saving || !validate()) return
    setSaving(true); setFormError('')
    const value = Math.abs(Math.round(amount * 100) / 100)
    const signed = kind === 'debit' ? -value : value
    const tags = parseTags(tagsStr)
    try {
      if (isEdit && initial) {
        await transactionsService.update(initial.id, editingTransfer
          ? { description: description.trim() || initial.description, transaction_date: date, notes: notes.trim() || undefined }
          : {
            account_id: accountId, description: description.trim(), amount: signed, transaction_date: date, type: kind,
            ...(categoryId && categoryId !== initial.category_id ? { category_id: categoryId } : {}),
            notes: notes.trim() || undefined, is_recurring: recurring, tags,
          })
        onSaved('updated')
      } else if (isTransfer) {
        await transfersService.create({ from_account_id: accountId, to_account_id: toAccountId, amount: value, description: description.trim() || undefined, transaction_date: date, notes: notes.trim() || undefined })
        onSaved('transfer')
      } else {
        const base = { account_id: accountId, description: description.trim(), amount: signed, type: kind, category_id: categoryId || undefined, notes: notes.trim() || undefined, is_recurring: recurring, tags }
        if (splitting) {
          for (let i = 0; i < count; i++) {
            await transactionsService.create({ ...base, transaction_date: addMonths(date, i), installment_current: i + 1, installment_total: count })
          }
          onSaved('installments', count)
        } else {
          await transactionsService.create({ ...base, transaction_date: date })
          onSaved('created')
        }
      }
      onClose()
    } catch {
      setFormError(t(isTransfer && !isEdit ? 'transactions.form.errors.transfer' : 'transactions.form.errors.save'))
    } finally {
      setSaving(false)
    }
  }

  const title = t(isEdit ? 'transactions.form.editTitle' : 'transactions.form.newTitle')

  if (open && !accounts.length) {
    return (
      <Modal open={open} onClose={onClose} title={title} width="28rem">
        <EmptyState compact title={t('transactions.form.noAccountTitle')} description={t('transactions.form.noAccountText')}
          action={<Button icon="plus" onClick={() => navigate('/profile')}>{t('transactions.list.goToProfile')}</Button>} />
      </Modal>
    )
  }

  const submitLabel = isEdit ? t('transactions.form.saveChanges')
    : isTransfer ? t('transactions.form.transferBtn')
    : splitting && Number.isInteger(count) && count >= 2 ? t('transactions.form.createInstallments', { count })
    : t('transactions.form.save')

  const footer = (
    <>
      {isEdit && initial && onDelete && (
        <Button variant="ghost" icon="trash" className="tx-modal-delete" onClick={() => onDelete(initial)} disabled={saving}>{t('transactions.form.delete')}</Button>
      )}
      <Button variant="secondary" onClick={onClose} disabled={saving}>{t('transactions.form.cancel')}</Button>
      <Button type="submit" form="tx-form" loading={saving}>{submitLabel}</Button>
    </>
  )

  const kinds: Kind[] = isEdit ? ['debit', 'credit'] : ['debit', 'credit', 'transfer']

  return (
    <Modal open={open} onClose={onClose} title={title} width="32rem" footer={footer}>
      <form id="tx-form" onSubmit={submit} noValidate className="tx-form">
        {editingTransfer ? (
          <p className="tx-note-box"><Icon name="transfer" size={16} />{t('transactions.form.transferEditNote')}</p>
        ) : (
          <Tabs block label={t('transactions.form.typeLabel')} value={kind} onChange={v => { setKind(v); setErrors({}) }}
            items={kinds.map(k => ({ value: k, label: t(`transactions.form.${k}`) }))} />
        )}

        <Input label={t('transactions.form.description')} value={description} onChange={e => setDescription(e.target.value)}
          placeholder={t(isTransfer ? 'transactions.form.transferPlaceholder' : 'transactions.form.descriptionPlaceholder')}
          optional={isTransfer} error={errors.description} maxLength={200} autoComplete="off" />

        <div className="tx-form__row tx-form__row--pair">
          <Input label={t(splitting ? 'transactions.form.installmentAmount' : 'transactions.form.amount')} value={amountStr}
            onChange={e => setAmountStr(e.target.value)} onBlur={() => { if (Number.isFinite(amount) && amount > 0) setAmountStr(amountToInput(amount)) }}
            inputMode="decimal" placeholder={formatNumber(0, 2)} leading="R$" className="ft-num" error={errors.amount} disabled={editingTransfer} autoComplete="off" />
          <Input type="date" label={t('transactions.form.date')} value={date} onChange={e => setDate(e.target.value)} error={errors.date} />
        </div>

        {isTransfer && !isEdit ? (
          <>
            <div className="tx-form__row">
              <Select label={t('transactions.form.from')} value={accountId} error={errors.account} onChange={e => {
                const v = e.target.value
                setAccountId(v)
                if (v === toAccountId) setToAccountId(accounts.find(a => a.id !== v)?.id || '')
              }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
              </Select>
              <Select label={t('transactions.form.to')} value={toAccountId} onChange={e => setToAccountId(e.target.value)} error={errors.to}>
                <option value="" disabled>{t('transactions.import.csv.pick')}</option>
                {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
              </Select>
            </div>
            <p className="tx-hint"><Icon name="info" size={14} />{t('transactions.form.transferNote')}</p>
          </>
        ) : !editingTransfer && (
          <div className="tx-form__row">
            <Select label={t('transactions.form.account')} value={accountId} onChange={e => setAccountId(e.target.value)} error={errors.account}>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </Select>
            <Select label={t('transactions.form.category')} value={categoryId} onChange={e => setCategoryId(e.target.value)} optional>
              {(!isEdit || !initial?.category_id) && <option value="">{t('transactions.form.noCategory')}</option>}
              {sortedCats.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
            </Select>
          </div>
        )}

        <Textarea label={t('transactions.form.notes')} optional rows={2} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={t('transactions.form.notesPlaceholder')} maxLength={500} />

        {!isTransfer && (
          <Input label={t('transactions.form.tags')} optional value={tagsStr} onChange={e => setTagsStr(e.target.value)}
            placeholder={t('transactions.form.tagsPlaceholder')} hint={t('transactions.form.tagsHint')} leading={<Icon name="tag" size={15} />} autoComplete="off" />
        )}

        {!isTransfer && (
          <div className="tx-options">
            <label className="tx-option">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
              <span>
                <span className="tx-option__title">{t('transactions.form.recurring')}</span>
                <span className="tx-option__hint">{t('transactions.form.recurringHint')}</span>
              </span>
            </label>
            {!isEdit && (
              <label className="tx-option">
                <input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />
                <span>
                  <span className="tx-option__title">{t('transactions.form.installments')}</span>
                  <span className="tx-option__hint">{t('transactions.form.installmentsHint')}</span>
                </span>
              </label>
            )}
            {splitting && (
              <div className="tx-split">
                <Input label={t('transactions.form.installmentsCount')} type="number" min={2} max={48} inputMode="numeric" value={countStr}
                  onChange={e => setCountStr(e.target.value)} error={errors.count} className="ft-num" style={{ width: '6rem' }} />
                {Number.isFinite(amount) && amount > 0 && Number.isInteger(count) && count >= 2 && count <= 48 && (
                  <p className="tx-split__sum ft-num">{t('transactions.form.installmentsSummary', { count, value: formatCurrency(amount), total: formatCurrency(amount * count) })}</p>
                )}
              </div>
            )}
          </div>
        )}

        {formError && <p className="tx-error" role="alert"><Icon name="alertCircle" size={16} />{formError}</p>}
      </form>
    </Modal>
  )
}
