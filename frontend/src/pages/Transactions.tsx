import { useState, useEffect, useCallback } from 'react'
import { PageFooter } from '../components/layout'
import { Button, Card, Input, Modal, Badge, Spinner } from '../components/ui'
import { transactionsService, accountsService, supabase } from '../services'
import { formatCurrency, formatDate, toISODate } from '../utils'
import type { Transaction, TransactionCreate, TransactionUpdate, Account, Category } from '../types'

// ── Shared select style ───────────────────────────────────
const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '0.4375rem 0.625rem',
  fontSize: 'var(--font-size-md)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer', width: '100%',
}

// ── CategoryInline — inline select to edit category ───────
function CategoryInline({ txn, categories, onSaved }: {
  txn: Transaction
  categories: Category[]
  onSaved: (updated: Transaction) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const cat = categories.find(c => c.id === txn.category_id)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSaving(true)
    try {
      const updated = await transactionsService.update(txn.id, {
        category_id: val || undefined,
        categorized_by: 'manual',
      } as TransactionUpdate)
      onSaved(updated)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (saving) return <Spinner size={14} />

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={txn.category_id || ''}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        style={{ ...sel, width: '9rem', padding: '0.125rem 0.375rem', fontSize: 'var(--font-size-xs)' }}
      >
        <option value="">Sem categoria</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Clique para editar categoria"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {cat
        ? <Badge variant="default">{cat.name}</Badge>
        : <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textDecoration: 'underline dotted' }}>+ categoria</span>
      }
    </button>
  )
}

// ── TxnRow ────────────────────────────────────────────────
function TxnRow({ txn, accounts, categories, onUpdated, onDeleted }: {
  txn: Transaction
  accounts: Account[]
  categories: Category[]
  onUpdated: (t: Transaction) => void
  onDeleted: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isPositive = txn.amount > 0
  const account = accounts.find(a => a.id === txn.account_id)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await transactionsService.remove(txn.id)
      onDeleted(txn.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.875rem 1fr auto auto auto',
      gap: '0.625rem', alignItems: 'center',
      padding: '0.625rem 0', borderBottom: '0.5px solid var(--border-subtle)',
    }}>
      {/* Icon */}
      <div style={{
        width: '1.875rem', height: '1.875rem', borderRadius: '0.4375rem', flexShrink: 0,
        background: isPositive ? 'var(--green-soft)' : 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke={isPositive ? 'var(--green)' : 'var(--accent)'} strokeWidth="1.5" strokeLinecap="square">
          {isPositive
            ? <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            : <path d="M3 11l19-9-9 19-2-8-8-2z" />}
        </svg>
      </div>

      {/* Description + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {txn.description}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.125rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>{formatDate(txn.transaction_date)}</span>
          {account && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>· {account.name}</span>}
        </div>
      </div>

      {/* Category inline */}
      <div style={{ flexShrink: 0 }}>
        <CategoryInline txn={txn} categories={categories} onSaved={onUpdated} />
      </div>

      {/* Amount */}
      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: isPositive ? 'var(--green)' : 'var(--red)', flexShrink: 0, textAlign: 'right' }}>
        {isPositive ? '+' : ''}{formatCurrency(txn.amount)}
      </span>

      {/* Delete */}
      <div style={{ flexShrink: 0 }}>
        {confirmDelete
          ? (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button size="sm" variant="danger" loading={deleting} onClick={handleDelete}>Sim</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Não</Button>
            </div>
          )
          : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}
              title="Excluir"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          )
        }
      </div>
    </div>
  )
}

// ── TransactionModal ──────────────────────────────────────
function TransactionModal({ open, onClose, onSaved, accounts, categories }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  accounts: Account[]
  categories: Category[]
}) {
  const today = toISODate()
  const [form, setForm] = useState<TransactionCreate>({
    account_id: '', description: '', amount: 0,
    transaction_date: today, type: 'debit',
  })
  const [amountStr, setAmountStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ account_id: accounts[0]?.id || '', description: '', amount: 0, transaction_date: today, type: 'debit' })
      setAmountStr('')
      setError('')
    }
  }, [open, accounts])

  const set = (field: keyof TransactionCreate, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.account_id) { setError('Selecione uma conta.'); return }
    if (!form.description.trim()) { setError('Informe a descrição.'); return }
    const amt = parseFloat(amountStr.replace(',', '.'))
    if (isNaN(amt) || amt === 0) { setError('Informe um valor válido.'); return }

    setSaving(true)
    setError('')
    try {
      const finalAmount = form.type === 'debit' ? -Math.abs(amt) : Math.abs(amt)
      await transactionsService.create({ ...form, amount: finalAmount })
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar transação. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova transação" width="26rem">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Conta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Conta *</label>
          <select value={form.account_id} onChange={e => set('account_id', e.target.value)} style={sel} required>
            <option value="">Selecione...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.bank_name}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Tipo *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['debit', 'credit'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('type', t)} style={{
                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--font-size-md)', fontWeight: '500',
                border: '0.5px solid',
                borderColor: form.type === t ? (t === 'credit' ? 'var(--green)' : 'var(--accent)') : 'var(--border)',
                background: form.type === t ? (t === 'credit' ? 'var(--green-soft)' : 'var(--accent-soft)') : 'transparent',
                color: form.type === t ? (t === 'credit' ? 'var(--green)' : 'var(--accent)') : 'var(--text-muted)',
              }}>
                {t === 'debit' ? 'Saída (débito)' : 'Entrada (crédito)'}
              </button>
            ))}
          </div>
        </div>

        {/* Descrição + Valor na mesma linha */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.625rem' }}>
          <Input label="Descrição *" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Supermercado" required />
          <Input label="Valor (R$) *" value={amountStr} onChange={e => setAmountStr(e.target.value)}
            placeholder="0,00" style={{ width: '7rem' }} inputMode="decimal" />
        </div>

        {/* Data + Categoria */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <Input label="Data *" type="date" value={form.transaction_date}
            onChange={e => set('transaction_date', e.target.value)} required />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Categoria</label>
            <select value={form.category_id || ''} onChange={e => set('category_id', e.target.value || undefined)} style={sel}>
              <option value="">Sem categoria</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Notas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Notas</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Opcional..." rows={2}
            style={{ ...sel, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── FilterBar ─────────────────────────────────────────────
interface Filters {
  search: string
  account_id: string
  type: string
  category_id: string
  start_date: string
  end_date: string
}

function FilterBar({ filters, onChange, accounts, categories }: {
  filters: Filters
  onChange: (f: Filters) => void
  accounts: Account[]
  categories: Category[]
}) {
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v })

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 10rem', minWidth: '10rem' }}>
        <Input placeholder="Buscar..." value={filters.search}
          onChange={e => set('search', e.target.value)} style={{ height: '2rem' }} />
      </div>
      <select value={filters.account_id} onChange={e => set('account_id', e.target.value)}
        style={{ ...sel, width: 'auto', flex: '1 1 8rem', minWidth: '8rem', height: '2rem', padding: '0 0.625rem' }}>
        <option value="">Todas as contas</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={filters.type} onChange={e => set('type', e.target.value)}
        style={{ ...sel, width: 'auto', flex: '0 0 auto', height: '2rem', padding: '0 0.625rem' }}>
        <option value="">Todos os tipos</option>
        <option value="credit">Receita</option>
        <option value="debit">Gasto</option>
      </select>
      <select value={filters.category_id} onChange={e => set('category_id', e.target.value)}
        style={{ ...sel, width: 'auto', flex: '1 1 8rem', minWidth: '8rem', height: '2rem', padding: '0 0.625rem' }}>
        <option value="">Todas as categorias</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input type="date" value={filters.start_date} onChange={e => set('start_date', e.target.value)}
        style={{ ...sel, width: 'auto', flex: '0 0 auto', height: '2rem', padding: '0 0.5rem' }} />
      <input type="date" value={filters.end_date} onChange={e => set('end_date', e.target.value)}
        style={{ ...sel, width: 'auto', flex: '0 0 auto', height: '2rem', padding: '0 0.5rem' }} />
      {(filters.search || filters.account_id || filters.type || filters.category_id || filters.start_date || filters.end_date) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ search: '', account_id: '', type: '', category_id: '', start_date: '', end_date: '' })}>
          Limpar
        </Button>
      )}
    </div>
  )
}

// ── CsvImportModal ────────────────────────────────────────
type CsvStep = 'upload' | 'map' | 'importing' | 'done'

function parseCsvAmount(raw: string): number {
  let s = raw.trim().replace(/\s/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',')
    s = parts[1] && parts[1].length <= 2 ? s.replace(',', '.') : s.replace(',', '')
  }
  return parseFloat(s.replace(/[^0-9.\-]/g, ''))
}

function parseCsvDate(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}` }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) { const [d, m, y] = s.split('/'); return `20${y}-${m}-${d}` }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}` }
  return null
}

function CsvImportModal({ open, onClose, onImported, accounts }: {
  open: boolean; onClose: () => void; onImported: () => void; accounts: Account[]
}) {
  const [step, setStep] = useState<CsvStep>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [accountId, setAccountId] = useState('')
  const [colDate, setColDate] = useState('')
  const [colDesc, setColDesc] = useState('')
  const [colAmount, setColAmount] = useState('')
  const [colCredit, setColCredit] = useState('')
  const [colDebit, setColDebit] = useState('')
  const [splitMode, setSplitMode] = useState(false)
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setStep('upload'); setHeaders([]); setRows([])
      setAccountId(''); setColDate(''); setColDesc('')
      setColAmount(''); setColCredit(''); setColDebit('')
      setSplitMode(false); setImported(0); setSkipped(0); setError('')
    } else {
      setAccountId(accounts[0]?.id || '')
    }
  }, [open])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        let text = evt.target?.result as string
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
        const firstLine = text.split('\n')[0]
        const delimiters = [';', ',', '\t', '|']
        const delim = delimiters.reduce((b, d) => firstLine.split(d).length > firstLine.split(b).length ? d : b, ',')
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length < 2) { setError('Arquivo vazio ou sem dados.'); return }
        const hdrs = lines[0].split(delim).map(h => h.trim().replace(/^["']|["']$/g, ''))
        const data = lines.slice(1, 301).map(line => {
          const vals = line.split(delim).map(v => v.trim().replace(/^["']|["']$/g, ''))
          return Object.fromEntries(hdrs.map((h, i) => [h, vals[i] ?? '']))
        }).filter(r => Object.values(r).some(v => v !== ''))
        setHeaders(hdrs); setRows(data)
        const lower = hdrs.map(h => h.toLowerCase())
        const find = (pats: RegExp[]) => hdrs.find((_, i) => pats.some(p => p.test(lower[i]))) || ''
        const dDate   = find([/^data/, /\bdate\b/, /\bdt\b/, /lancamento/])
        const dDesc   = find([/descri/, /hist/, /\bmemo\b/, /complemento/, /\btitulo\b/, /\btitle\b/])
        const dAmt    = find([/^valor$/, /^amount$/, /^value$/, /quantia/])
        const dCredit = find([/credito/, /\bcredit\b/, /entrada/])
        const dDebit  = find([/debito/, /\bdebit\b/, /saida/])
        setColDate(dDate); setColDesc(dDesc)
        if (dCredit && dDebit && !dAmt) { setSplitMode(true); setColCredit(dCredit); setColDebit(dDebit) }
        else { setSplitMode(false); setColAmount(dAmt) }
        setStep('map')
      } catch { setError('Não foi possível ler o arquivo. Verifique se é um CSV válido.') }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleImport = async () => {
    if (!accountId) { setError('Selecione uma conta.'); return }
    if (!colDate || !colDesc) { setError('Mapeie data e descrição.'); return }
    if (!splitMode && !colAmount) { setError('Mapeie o campo de valor.'); return }
    if (splitMode && !colCredit && !colDebit) { setError('Mapeie crédito ou débito.'); return }
    setStep('importing'); setError('')
    let imp = 0; let skip = 0
    for (const row of rows) {
      try {
        const dateStr = parseCsvDate(row[colDate] || '')
        const description = (row[colDesc] || '').trim()
        let amount: number
        if (splitMode) {
          const credit = parseCsvAmount(row[colCredit] || '0') || 0
          const debit  = parseCsvAmount(row[colDebit]  || '0') || 0
          amount = credit > 0 ? credit : -Math.abs(debit)
        } else {
          amount = parseCsvAmount(row[colAmount] || '0')
        }
        if (!dateStr || !description || isNaN(amount) || amount === 0) { skip++; continue }
        await transactionsService.create({
          account_id: accountId, description, amount,
          transaction_date: dateStr, type: amount >= 0 ? 'credit' : 'debit',
        })
        imp++
      } catch (e: unknown) {
        const ae = e as { response?: { status: number } }
        if (ae.response?.status === 409) skip++; else skip++
      }
    }
    setImported(imp); setSkipped(skip); setStep('done')
  }

  const colSel: React.CSSProperties = { ...sel, fontSize: 'var(--font-size-sm)' }

  return (
    <Modal open={open} onClose={onClose} title="Importar extrato CSV" width="36rem">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)', padding: '0.5rem 0.75rem', background: 'var(--red-soft)', borderRadius: 'var(--radius-md)' }}>{error}</p>}

        {step === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Selecione um arquivo <strong>.csv</strong> exportado do seu banco (Nubank, Itaú, Bradesco, Santander e outros). O sistema detecta as colunas automaticamente.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Arquivo CSV *</label>
              <input type="file" accept=".csv,.txt" onChange={handleFile}
                style={{ padding: '0.5rem', background: 'var(--bg-input)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-md)', color: 'var(--text-primary)', cursor: 'pointer', width: '100%' }} />
            </div>
          </div>
        )}

        {step === 'map' && (
          <>
            {/* Account */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Conta *</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={sel}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.bank_name}</option>)}
              </select>
            </div>

            {/* Column mapping */}
            <div>
              <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '0.5rem' }}>Mapeamento de colunas</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Data *</label>
                  <select value={colDate} onChange={e => setColDate(e.target.value)} style={colSel}>
                    <option value="">Selecione...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Descrição *</label>
                  <select value={colDesc} onChange={e => setColDesc(e.target.value)} style={colSel}>
                    <option value="">Selecione...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* Mode toggle */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.375rem' }}>
                  {([false, true] as const).map(isSplit => (
                    <button key={String(isSplit)} type="button" onClick={() => setSplitMode(isSplit)} style={{
                      flex: 1, padding: '0.375rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      fontFamily: 'var(--font)', fontSize: 'var(--font-size-sm)', fontWeight: '500', border: '0.5px solid',
                      borderColor: splitMode === isSplit ? 'var(--accent)' : 'var(--border)',
                      background: splitMode === isSplit ? 'var(--accent-soft)' : 'transparent',
                      color: splitMode === isSplit ? 'var(--accent)' : 'var(--text-muted)',
                    }}>{isSplit ? 'Crédito / Débito separados' : 'Coluna única de valor'}</button>
                  ))}
                </div>

                {!splitMode ? (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Valor * <span style={{ color: 'var(--text-hint)', fontWeight: '400' }}>(negativo = saída)</span></label>
                    <select value={colAmount} onChange={e => setColAmount(e.target.value)} style={colSel}>
                      <option value="">Selecione...</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Crédito (entradas)</label>
                      <select value={colCredit} onChange={e => setColCredit(e.target.value)} style={colSel}>
                        <option value="">Selecione...</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>Débito (saídas)</label>
                      <select value={colDebit} onChange={e => setColDebit(e.target.value)} style={colSel}>
                        <option value="">Selecione...</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Preview */}
            <div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                Prévia <span style={{ color: 'var(--text-hint)' }}>({rows.length} linhas detectadas)</span>
              </p>
              <div style={{ overflowX: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
                  <thead>
                    <tr>{headers.map(h => <th key={h} style={{ padding: '0.3rem 0.5rem', textAlign: 'left', background: 'var(--bg-card-hover)', color: 'var(--text-hint)', fontWeight: '500', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i} style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
                        {headers.map(h => <td key={h} style={{ padding: '0.3rem 0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleImport}>Importar {rows.length} linhas</Button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
            <Spinner size={28} />
            <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-muted)' }}>Importando transações...</p>
          </div>
        )}

        {step === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center', padding: '1rem 0' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="square">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>
                {imported} transaç{imported === 1 ? 'ão importada' : 'ões importadas'}
              </p>
              {skipped > 0 && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {skipped} ignorada{skipped > 1 ? 's' : ''} (duplicadas ou com dados inválidos)
                </p>
              )}
            </div>
            <Button onClick={() => { onImported(); onClose() }}>Ver transações</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Transactions (main page) ──────────────────────────────
const PAGE_SIZE = 20

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const [filters, setFilters] = useState<Filters>({
    search: '', account_id: '', type: '', category_id: '', start_date: '', end_date: '',
  })

  const load = useCallback(async (p: number, f: Filters) => {
    setLoading(true)
    try {
      const res = await transactionsService.list({
        page: p, page_size: PAGE_SIZE,
        ...(f.search       && { search:      f.search }),
        ...(f.account_id   && { account_id:  f.account_id }),
        ...(f.type         && { type:         f.type }),
        ...(f.category_id  && { category_id: f.category_id }),
        ...(f.start_date   && { start_date:  f.start_date }),
        ...(f.end_date     && { end_date:    f.end_date }),
      })
      setTransactions(res.transactions || [])
      setTotal(res.total)
      setTotalPages(res.total_pages)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      accountsService.list(),
      supabase.from('categories').select('*').order('name'),
    ]).then(([accRes, catRes]) => {
      setAccounts(accRes.accounts || [])
      setCategories((catRes.data || []) as Category[])
    })
  }, [])

  useEffect(() => {
    load(page, filters)
  }, [page, filters, load])

  const handleFiltersChange = (f: Filters) => {
    setFilters(f)
    setPage(1)
  }

  const handleUpdated = (updated: Transaction) =>
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))

  const handleDeleted = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
    setTotal(n => n - 1)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await transactionsService.exportCsv({
        ...(filters.start_date  && { start_date:  filters.start_date }),
        ...(filters.end_date    && { end_date:    filters.end_date }),
        ...(filters.account_id  && { account_id:  filters.account_id }),
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Transações</h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
              {total > 0 ? `${total} transaç${total === 1 ? 'ão' : 'ões'} encontrada${total === 1 ? '' : 's'}` : 'Nenhuma transação encontrada'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" style={{ transform: 'scaleY(-1)', transformOrigin: 'center' }} />
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Importar CSV
            </Button>
            <Button variant="secondary" size="sm" loading={exporting} onClick={handleExport}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar CSV
            </Button>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova transação
            </Button>
          </div>
        </div>

        {/* Filters */}
        <FilterBar filters={filters} onChange={handleFiltersChange} accounts={accounts} categories={categories} />

        {/* List */}
        <Card style={{ flex: 1 }}>
          {loading
            ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
                <Spinner size={24} />
              </div>
            )
            : transactions.length === 0
              ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-muted)' }}>Nenhuma transação encontrada.</p>
                  {!filters.search && !filters.account_id && !filters.type && (
                    <Button style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>Criar primeira transação</Button>
                  )}
                </div>
              )
              : (
                <>
                  {transactions.map(txn => (
                    <TxnRow
                      key={txn.id}
                      txn={txn}
                      accounts={accounts}
                      categories={categories}
                      onUpdated={handleUpdated}
                      onDeleted={handleDeleted}
                    />
                  ))}
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', marginTop: '0.5rem', borderTop: '0.5px solid var(--border)' }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>
                        Página {page} de {totalPages}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</Button>
                        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima →</Button>
                      </div>
                    </div>
                  )}
                </>
              )
          }
        </Card>
      </div>

      <TransactionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => load(1, filters)}
        accounts={accounts}
        categories={categories}
      />

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { setPage(1); load(1, filters) }}
        accounts={accounts}
      />

      <PageFooter />
    </div>
  )
}
