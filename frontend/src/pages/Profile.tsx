import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Card, Button, Input, Modal, Spinner } from '../components/ui'
import { useAuthStore } from '../store'
import { authService, accountsService } from '../services'
import { formatCurrency, formatDate } from '../utils'
import type { Account, AccountCreate, BankOption } from '../types'
import { BANK_LIST } from '../types'

const THEME_KEY = 'ft-theme'

function getTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light'
    localStorage.setItem(THEME_KEY, 'light')
  } else {
    delete document.documentElement.dataset.theme
    localStorage.setItem(THEME_KEY, 'dark')
  }
}

const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '0.4375rem 0.625rem',
  fontSize: 'var(--font-size-md)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer', width: '100%',
}

// ── ThemeToggle ───────────────────────────────────────────
function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const isDark = theme === 'dark'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>
          Aparência
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', marginTop: '0.125rem' }}>
          {isDark ? 'Modo escuro ativo' : 'Modo claro ativo'}
        </div>
      </div>
      <button
        onClick={toggle}
        aria-label="Alternar tema"
        style={{
          width: '3rem', height: '1.625rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          background: isDark ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background var(--transition)', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '0.1875rem',
          left: isDark ? 'calc(100% - 1.25rem)' : '0.1875rem',
          width: '1.25rem', height: '1.25rem', borderRadius: '50%',
          background: '#fff', transition: 'left var(--transition)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isDark
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9D2449" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          }
        </span>
      </button>
    </div>
  )
}

// ── InfoRow ───────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>{value}</span>
    </div>
  )
}

// ── AccountModal ──────────────────────────────────────────
function AccountModal({ open, onClose, onSaved, initial }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Account | null
}) {
  const isEdit = !!initial
  const blank: AccountCreate = { name: '', bank_name: 'Nubank', bank_color: '#820ad1', account_type: 'checking', currency: 'BRL', balance: 0 }

  const [form, setForm] = useState<AccountCreate>(blank)
  const [balanceStr, setBalanceStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({ name: initial.name, bank_name: initial.bank_name, bank_color: initial.bank_color, account_type: initial.account_type, currency: initial.currency, balance: initial.balance })
      setBalanceStr(String(initial.balance))
    } else {
      setForm(blank)
      setBalanceStr('')
    }
    setError('')
  }, [open, initial])

  const set = (k: keyof AccountCreate, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleBankChange = (bankName: string) => {
    const bank = BANK_LIST.find(b => b.name === bankName)
    setForm(f => ({ ...f, bank_name: bankName, bank_color: bank?.color || '#9D2449' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome da conta.'); return }
    const balance = parseFloat(balanceStr.replace(',', '.'))
    if (isNaN(balance)) { setError('Informe um saldo válido.'); return }

    setSaving(true)
    setError('')
    try {
      const payload = { ...form, balance }
      if (isEdit && initial) await accountsService.update(initial.id, payload)
      else await accountsService.create(payload)
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar conta. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const accountTypes = [
    { value: 'checking',   label: 'Conta corrente' },
    { value: 'savings',    label: 'Conta poupança' },
    { value: 'credit',     label: 'Cartão de crédito' },
    { value: 'investment', label: 'Conta investimento' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar conta' : 'Nova conta'} width="24rem">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <Input label="Nome da conta *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Conta corrente" required />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Banco *</label>
            <select value={form.bank_name} onChange={e => handleBankChange(e.target.value)} style={sel}>
              {BANK_LIST.map((b: BankOption) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Tipo *</label>
            <select value={form.account_type} onChange={e => set('account_type', e.target.value)} style={sel}>
              {accountTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <Input label="Saldo atual (R$) *" value={balanceStr} onChange={e => setBalanceStr(e.target.value)}
          placeholder="0,00" inputMode="decimal"
          hint="Use valor negativo para dívidas no cartão de crédito" />

        {error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Salvar' : 'Criar conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── AccountRow ────────────────────────────────────────────
function AccountRow({ account, onEdit, onDeleted }: {
  account: Account
  onEdit: (a: Account) => void
  onDeleted: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try { await accountsService.remove(account.id); onDeleted(account.id) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  const accountTypeLabel: Record<string, string> = {
    checking: 'Corrente', savings: 'Poupança', credit: 'Crédito', investment: 'Investimento',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
      <div style={{ width: '0.25rem', height: '2.25rem', borderRadius: '9999px', background: account.bank_color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {account.name}
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>
          {account.bank_name} · {accountTypeLabel[account.account_type] || account.account_type}
        </div>
      </div>
      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: account.balance >= 0 ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
        {formatCurrency(account.balance)}
      </span>
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        {confirmDelete ? (
          <>
            <Button size="sm" variant="danger" loading={deleting} onClick={handleDelete}>Sim</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Não</Button>
          </>
        ) : (
          <>
            <button onClick={() => onEdit(account)} title="Editar" style={{ color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Excluir" style={{ color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Profile ───────────────────────────────────────────────
export function Profile() {
  const { user, isDemo } = useAuthStore()
  const [signingOut, setSigningOut] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  const loadAccounts = () => {
    setLoadingAccounts(true)
    accountsService.list()
      .then(res => setAccounts(res.accounts || []))
      .finally(() => setLoadingAccounts(false))
  }

  useEffect(() => { loadAccounts() }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    try { await authService.signOut() } finally { setSigningOut(false) }
  }

  const handleAccountSaved = () => { loadAccounts(); setEditingAccount(null) }
  const handleAccountDeleted = (id: string) => setAccounts(prev => prev.filter(a => a.id !== id))

  const displayName = isDemo ? 'Demo' : (user?.email?.split('@')[0] || '—')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '36rem' }}>

        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Perfil</h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Configurações da conta</p>
        </div>

        {/* Avatar + nome */}
        <Card style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '3rem', height: '3rem', borderRadius: '50%', flexShrink: 0,
            background: isDemo ? 'var(--amber-soft)' : 'var(--accent-soft)',
            border: `1.5px solid ${isDemo ? 'var(--amber)' : 'var(--accent)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--font-size-lg)', fontWeight: '700',
            color: isDemo ? 'var(--amber)' : 'var(--accent)',
          }}>
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || '—'}</div>
            {isDemo && (
              <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '0.0625rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', background: 'var(--amber-soft)', color: 'var(--amber)', fontWeight: '500' }}>
                Conta demo
              </span>
            )}
          </div>
        </Card>

        {/* Informações da conta */}
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>
            Informações
          </span>
          <InfoRow label="E-mail" value={user?.email || '—'} />
          <InfoRow label="Membro desde" value={user?.created_at ? formatDate(user.created_at) : '—'} />
          <InfoRow label="Plano" value={isDemo ? 'Demo (reset semanal)' : 'Pessoal'} />
        </Card>

        {/* Contas bancárias */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
              Contas ({accounts.length})
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setEditingAccount(null); setShowAccountModal(true) }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M12 5v14M5 12h14"/></svg>
              Nova conta
            </Button>
          </div>

          {loadingAccounts ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}><Spinner size={20} /></div>
          ) : accounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', marginBottom: '0.75rem' }}>
                Nenhuma conta cadastrada. Adicione uma conta para começar.
              </p>
              <Button size="sm" onClick={() => setShowAccountModal(true)}>Adicionar primeira conta</Button>
            </div>
          ) : (
            accounts.map(acc => (
              <AccountRow
                key={acc.id}
                account={acc}
                onEdit={(a) => { setEditingAccount(a); setShowAccountModal(true) }}
                onDeleted={handleAccountDeleted}
              />
            ))
          )}
        </Card>

        {/* Aparência */}
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
            Aparência
          </span>
          <ThemeToggle />
        </Card>

        {/* Sair */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>Encerrar sessão</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', marginTop: '0.125rem' }}>Você será redirecionado para o login</div>
            </div>
            <Button variant="danger" size="sm" loading={signingOut} onClick={handleSignOut}>Sair</Button>
          </div>
        </Card>
      </div>

      <AccountModal
        open={showAccountModal}
        onClose={() => { setShowAccountModal(false); setEditingAccount(null) }}
        onSaved={handleAccountSaved}
        initial={editingAccount}
      />

      <PageFooter />
    </div>
  )
}
