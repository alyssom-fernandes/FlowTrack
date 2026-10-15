import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, IconButton, Input, Modal, Money, Select } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useToastStore } from '../../store'
import { accountsService } from '../../services'
import { formatCurrency, formatNumber } from '../../utils'
import { BANK_LIST, type Account } from '../../types'
import { PALETTE, focusInvalid, parseAmount, uniqueColors } from './helpers'
import { BankMark, ColorPicker, ListSkeleton, LoadError } from './parts'

const TYPES: Account['account_type'][] = ['checking', 'savings', 'credit', 'investment']

function useBankName() {
  const { t } = useTranslation()
  return (name: string) => (name === 'Outro' ? t('profile.accounts.otherBank') : name)
}

export function AccountsTab() {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const bankName = useBankName()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [modal, setModal] = useState<{ account: Account | null } | null>(null)
  const [toDelete, setToDelete] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await accountsService.list()
      setAccounts(res.accounts || [])
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => setModal({ account: null })
  const openEdit = (a: Account) => setModal({ account: a })

  const saved = (wasEdit: boolean) => {
    setModal(null)
    toast({ message: wasEdit ? t('profile.accounts.updated') : t('profile.accounts.created') })
    load()
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await accountsService.remove(toDelete.id)
      setAccounts(prev => prev?.filter(a => a.id !== toDelete.id) ?? prev)
      toast({ message: t('profile.accounts.deleted') })
      setToDelete(null)
    } catch {
      toast({ message: t('profile.accounts.deleteError'), variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const total = (accounts || []).reduce((s, a) => s + a.balance, 0)
  const loading = accounts === null && !failed

  return (
    <>
      <Card>
        <CardHeader
          title={t('profile.accounts.title')}
          subtitle={accounts && accounts.length > 0 ? t('profile.accounts.count', { count: accounts.length }) : undefined}
          action={accounts && accounts.length > 0 ? <Button size="sm" icon="plus" onClick={openNew}>{t('profile.accounts.new')}</Button> : undefined}
        />

        {failed ? (
          <LoadError message={t('profile.accounts.loadError')} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : accounts!.length === 0 ? (
          <EmptyState title={t('profile.accounts.emptyTitle')} description={t('profile.accounts.emptyText')}
            action={<Button icon="plus" onClick={openNew}>{t('profile.accounts.new')}</Button>} />
        ) : (
          <>
            <ul className="prf-list">
              {accounts!.map(a => (
                <li key={a.id} className="prf-item">
                  <button type="button" className="prf-item__main" onClick={() => openEdit(a)}
                    aria-label={`${a.name}, ${bankName(a.bank_name)} · ${t(`profile.accounts.types.${a.account_type}`)}, ${formatCurrency(a.balance)}`}>
                    <BankMark color={a.bank_color} label={a.bank_name === 'Outro' ? a.name : a.bank_name} />
                    <span className="prf-item__text">
                      <span className="prf-item__title">{a.name}</span>
                      <span className="prf-item__sub">{bankName(a.bank_name)} · {t(`profile.accounts.types.${a.account_type}`)}</span>
                    </span>
                    <Money value={a.balance} className="prf-item__value" style={a.balance < 0 ? { color: 'var(--red)' } : undefined} />
                    <Icon name="chevronRight" size={16} className="prf-item__chevron" />
                  </button>
                  <span className="prf-item__actions">
                    <IconButton icon="edit" label={t('profile.accounts.edit', { name: a.name })} onClick={() => openEdit(a)} />
                    <IconButton icon="trash" label={t('profile.accounts.delete', { name: a.name })} onClick={() => setToDelete(a)} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="prf-total">
              <span className="prf-total__label">{t('profile.accounts.total')}</span>
              <Money value={total} className="prf-total__value" style={total < 0 ? { color: 'var(--red)' } : undefined} />
            </div>
          </>
        )}
      </Card>

      {modal && (
        <AccountModal account={modal.account} onClose={() => setModal(null)} onSaved={saved}
          onDelete={a => { setModal(null); setToDelete(a) }} />
      )}

      <ConfirmDialog open={!!toDelete} onClose={() => !deleting && setToDelete(null)} onConfirm={confirmDelete} loading={deleting}
        title={t('profile.accounts.deleteTitle')} message={t('profile.accounts.deleteText', { name: toDelete?.name ?? '' })}
        confirmLabel={t('profile.accounts.deleteAction')} />
    </>
  )
}

// ── Nova conta / editar conta ──
function AccountModal({ account, onClose, onSaved, onDelete }: {
  account: Account | null; onClose: () => void; onSaved: (wasEdit: boolean) => void; onDelete: (a: Account) => void
}) {
  const { t } = useTranslation()
  const bankName = useBankName()
  const isEdit = !!account
  const [name, setName] = useState(account?.name ?? '')
  const [bank, setBank] = useState(account?.bank_name ?? BANK_LIST[0].name)
  const [color, setColor] = useState(account?.bank_color ?? BANK_LIST[0].color)
  const [type, setType] = useState<Account['account_type']>(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account ? formatNumber(account.balance, 2) : '')
  const [errors, setErrors] = useState<{ name?: string; balance?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  const bankColor = BANK_LIST.find(b => b.name === bank)?.color
  const colors = uniqueColors([...uniqueColors([bankColor, ...PALETTE]).slice(0, PALETTE.length), color])

  const changeBank = (next: string) => {
    setBank(next)
    const c = BANK_LIST.find(b => b.name === next)?.color
    if (c) setColor(c)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = parseAmount(balance)
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('profile.accounts.nameRequired')
    if (value === null) next.balance = t('profile.accounts.balanceInvalid')
    setErrors(next)
    if (next.name || next.balance) { focusInvalid(e.currentTarget); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), bank_name: bank, bank_color: color, account_type: type, currency: account?.currency ?? 'BRL', balance: value ?? 0 }
      if (account) await accountsService.update(account.id, payload)
      else await accountsService.create(payload)
      onSaved(isEdit)
    } catch {
      setErrors({ form: t('profile.accounts.saveError') })
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? t('profile.accounts.editTitle') : t('profile.accounts.newTitle')} width="30rem"
      footer={<>
        {account && <Button variant="danger" icon="trash" onClick={() => onDelete(account)} disabled={saving} className="prf-footer-start">{t('profile.accounts.deleteAction')}</Button>}
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form="prf-account-form" loading={saving}>{isEdit ? t('profile.accounts.save') : t('profile.accounts.create')}</Button>
      </>}>
      <form id="prf-account-form" onSubmit={submit} className="prf-form" noValidate>
        <Input label={t('profile.accounts.name')} value={name} onChange={e => setName(e.target.value)} placeholder={t('profile.accounts.namePlaceholder')}
          error={errors.name} maxLength={60} autoComplete="off" className="prf-input-mark"
          leading={<BankMark size="sm" color={color} label={bank === 'Outro' ? (name || '?') : bank} />} />
        <div className="prf-form-grid">
          <Select label={t('profile.accounts.bank')} value={bank} onChange={e => changeBank(e.target.value)}>
            {BANK_LIST.map(b => <option key={b.name} value={b.name}>{bankName(b.name)}</option>)}
          </Select>
          <Select label={t('profile.accounts.type')} value={type} onChange={e => setType(e.target.value as Account['account_type'])}>
            {TYPES.map(v => <option key={v} value={v}>{t(`profile.accounts.types.${v}`)}</option>)}
          </Select>
        </div>
        <Input label={t('profile.accounts.balance')} value={balance} onChange={e => setBalance(e.target.value)} placeholder={formatNumber(0, 2)}
          inputMode="decimal" leading="R$" className="ft-num" error={errors.balance} hint={t('profile.accounts.balanceHint')} autoComplete="off" />
        <div className="ft-field">
          <span className="ft-field__label">{t('profile.accounts.color')}</span>
          <ColorPicker label={t('profile.accounts.color')} value={color} onChange={setColor} colors={colors}
            names={bankColor ? { [bankColor.toLowerCase()]: `${t('profile.accounts.bankColor')} (${bankName(bank)})` } : undefined} />
        </div>
        {errors.form && <p className="prf-form-error" role="alert">{errors.form}</p>}
      </form>
    </Modal>
  )
}
