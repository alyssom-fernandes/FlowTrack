import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Button, Card, Input, Modal, Spinner } from '../components/ui'
import { investmentsService } from '../services'
import { useToastStore } from '../store'
import { formatCurrency, formatPercent } from '../utils'
import type { Investment, InvestmentCreate, InvestmentType } from '../types'

// ── Constants ─────────────────────────────────────────────
const TYPE_LABELS: Record<InvestmentType, string> = {
  renda_fixa:        'Renda Fixa',
  renda_variavel:    'Renda Variável',
  fundo_imobiliario: 'Fundo Imobiliário',
  tesouro_direto:    'Tesouro Direto',
  cdb:               'CDB',
  lci_lca:           'LCI / LCA',
  acoes:             'Ações',
  criptomoeda:       'Criptomoeda',
  outro:             'Outro',
}

const TYPE_ORDER: InvestmentType[] = [
  'tesouro_direto', 'renda_fixa', 'cdb', 'lci_lca',
  'fundo_imobiliario', 'renda_variavel', 'acoes', 'criptomoeda', 'outro',
]

const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '0.4375rem 0.625rem',
  fontSize: 'var(--font-size-md)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'var(--font)', width: '100%',
}

// ── MetricCard ────────────────────────────────────────────
function MetricCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <Card hover style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 'var(--font-size-sm)', color: subColor || 'var(--text-muted)' }}>{sub}</span>}
    </Card>
  )
}

// ── InvestmentCard ────────────────────────────────────────
function InvestmentCard({ inv, onEdit, onDeleted }: {
  inv: Investment
  onEdit: (i: Investment) => void
  onDeleted: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try { await investmentsService.remove(inv.id); onDeleted(inv.id) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  const isPositive = inv.profitability >= 0

  return (
    <Card style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        {/* Name + institution */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)' }}>{inv.name}</span>
          {inv.institution && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)' }}>{inv.institution}</span>
          )}
        </div>

        {/* Amounts row */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', marginBottom: '0.0625rem' }}>Investido</div>
            <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>{formatCurrency(inv.total_invested)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', marginBottom: '0.0625rem' }}>Valor atual</div>
            <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>{formatCurrency(inv.current_value)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', marginBottom: '0.0625rem' }}>Rentabilidade</div>
            <div style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: isPositive ? 'var(--green)' : 'var(--red)' }}>
              {isPositive ? '+' : ''}{formatCurrency(inv.profitability)} ({formatPercent(inv.profitability_percent)})
            </div>
          </div>
        </div>

        {inv.notes && (
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', marginTop: '0.375rem', fontStyle: 'italic' }}>{inv.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        {confirmDelete ? (
          <>
            <Button size="sm" variant="danger" loading={deleting} onClick={handleDelete}>Sim</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Não</Button>
          </>
        ) : (
          <>
            <button onClick={() => onEdit(inv)} title="Editar" aria-label="Editar investimento" style={{ color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Excluir" aria-label="Excluir investimento" style={{ color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

const BLANK_INVESTMENT: InvestmentCreate = { name: '', type: 'renda_fixa', institution: '', total_invested: 0, current_value: 0 }

// ── InvestmentModal ───────────────────────────────────────
function InvestmentModal({ open, onClose, onSaved, initial }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Investment | null
}) {
  const isEdit = !!initial

  const [form, setForm] = useState<InvestmentCreate>(BLANK_INVESTMENT)
  const [investedStr, setInvestedStr] = useState('')
  const [currentStr, setCurrentStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({ name: initial.name, type: initial.type, institution: initial.institution || '', total_invested: initial.total_invested, current_value: initial.current_value, currency: initial.currency, notes: initial.notes })
      setInvestedStr(String(initial.total_invested))
      setCurrentStr(String(initial.current_value))
    } else {
      setForm(BLANK_INVESTMENT)
      setInvestedStr('')
      setCurrentStr('')
    }
    setError('')
  }, [open, initial])

  const set = (k: keyof InvestmentCreate, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome do investimento.'); return }
    const invested = parseFloat(investedStr.replace(',', '.'))
    const current  = parseFloat(currentStr.replace(',', '.'))
    if (isNaN(invested) || invested < 0) { setError('Informe o valor investido.'); return }
    if (isNaN(current)  || current  < 0) { setError('Informe o valor atual.'); return }

    setSaving(true)
    setError('')
    try {
      const payload = { ...form, total_invested: invested, current_value: current }
      if (isEdit && initial) await investmentsService.update(initial.id, payload)
      else await investmentsService.create(payload)
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar investimento' : 'Novo investimento'} width="28rem">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <Input label="Nome *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Tesouro IPCA+ 2029" required />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Tipo *</label>
            <select value={form.type} onChange={e => set('type', e.target.value as InvestmentType)} style={sel}>
              {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <Input label="Instituição" value={form.institution || ''} onChange={e => set('institution', e.target.value)} placeholder="Ex: Nubank" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <Input label="Total investido (R$) *" value={investedStr} onChange={e => setInvestedStr(e.target.value)} placeholder="0,00" inputMode="decimal" />
          <Input label="Valor atual (R$) *" value={currentStr} onChange={e => setCurrentStr(e.target.value)} placeholder="0,00" inputMode="decimal" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Notas</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Opcional..." rows={2}
            style={{ ...sel, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Salvar' : 'Adicionar'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Investments (main page) ───────────────────────────────
export function Investments() {
  const { toast } = useToastStore()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [totals, setTotals] = useState({ invested: 0, current: 0, profit: 0, profitPct: 0 })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await investmentsService.list()
      setInvestments(res.investments || [])
      setTotals({ invested: res.total_invested, current: res.total_current_value, profit: res.total_profitability, profitPct: res.total_profitability_percent })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSaved = () => {
    load()
    setEditing(null)
    toast({ message: editing ? 'Investimento atualizado!' : 'Investimento criado!' })
  }
  const handleDeleted = (id: string) => {
    setInvestments(prev => prev.filter(i => i.id !== id))
    toast({ message: 'Investimento excluído.' })
  }

  // Group by type preserving TYPE_ORDER
  const grouped = TYPE_ORDER.reduce<Record<string, Investment[]>>((acc, t) => {
    const items = investments.filter(i => i.type === t)
    if (items.length) acc[t] = items
    return acc
  }, {})

  const isProfit = totals.profit >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Investimentos</h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Carteira manual — Fase 1</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowModal(true) }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Novo investimento
          </Button>
        </div>

        {/* Metrics */}
        {investments.length > 0 && (
          <div className="ft-metrics-grid">
            <MetricCard label="Total investido"   value={formatCurrency(totals.invested)} />
            <MetricCard label="Valor atual"        value={formatCurrency(totals.current)} />
            <MetricCard label="Rentabilidade total"
              value={`${isProfit ? '+' : ''}${formatCurrency(totals.profit)}`}
              sub={formatPercent(totals.profitPct)}
              subColor={isProfit ? 'var(--green)' : 'var(--red)'} />
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <Spinner size={24} />
          </div>
        ) : investments.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Nenhum investimento cadastrado. Adicione manualmente sua carteira.
            </p>
            <Button onClick={() => setShowModal(true)}>Adicionar primeiro investimento</Button>
          </Card>
        ) : (
          Object.entries(grouped).map(([type, items]) => (
            <section key={type}>
              <h2 style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '500', marginBottom: '0.625rem' }}>
                {TYPE_LABELS[type as InvestmentType]}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {items.map(inv => (
                  <InvestmentCard key={inv.id} inv={inv}
                    onEdit={(i) => { setEditing(i); setShowModal(true) }}
                    onDeleted={handleDeleted} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <InvestmentModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSaved={handleSaved}
        initial={editing}
      />

      <PageFooter />
    </div>
  )
}
