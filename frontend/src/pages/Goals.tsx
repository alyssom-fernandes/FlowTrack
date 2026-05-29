import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Button, Card, Input, Modal, Spinner } from '../components/ui'
import { goalsService } from '../services'
import { formatCurrency, formatDate, toISODate } from '../utils'
import type { Goal, GoalCreate, GoalType } from '../types'

// ── shared select style ───────────────────────────────────
const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '0.4375rem 0.625rem',
  fontSize: 'var(--font-size-md)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'var(--font)', width: '100%',
}

// ── ProgressBar ───────────────────────────────────────────
function ProgressBar({ percent, type }: { percent: number; type: GoalType }) {
  const color = type === 'savings_target' ? 'var(--green)' : 'var(--accent)'
  const soft  = type === 'savings_target' ? 'var(--green-soft)' : 'var(--accent-soft)'
  const clamped = Math.min(percent, 100)
  return (
    <div style={{ height: '0.3125rem', borderRadius: '9999px', background: soft, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '9999px', transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── GoalCard ──────────────────────────────────────────────
function GoalCard({ goal, onEdit, onDeleted }: {
  goal: Goal
  onEdit: (g: Goal) => void
  onDeleted: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try { await goalsService.remove(goal.id); onDeleted(goal.id) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  const isSavings = goal.type === 'savings_target'
  const pct = goal.progress_percent ?? 0
  const overBudget = !isSavings && pct > 100

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)' }}>{goal.name}</span>
            <span style={{
              padding: '0.0625rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: '500',
              background: isSavings ? 'var(--green-soft)' : 'var(--accent-soft)',
              color: isSavings ? 'var(--green)' : 'var(--accent)',
            }}>
              {isSavings ? 'Poupança' : 'Limite'}
            </span>
            {overBudget && (
              <span style={{ padding: '0.0625rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: '500', background: 'var(--red-soft)', color: 'var(--red)' }}>
                Excedido
              </span>
            )}
          </div>
          {goal.end_date && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', marginTop: '0.125rem' }}>
              Até {formatDate(goal.end_date)}
            </div>
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
              <button onClick={() => onEdit(goal)} title="Editar" style={{ color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
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

      {/* Progress */}
      <ProgressBar percent={pct} type={goal.type} />

      {/* Amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
          {isSavings ? 'Acumulado' : 'Gasto'}: <strong style={{ color: overBudget ? 'var(--red)' : isSavings ? 'var(--green)' : 'var(--text-secondary)' }}>{formatCurrency(goal.current_amount)}</strong>
        </span>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
          Meta: <strong style={{ color: 'var(--text-secondary)' }}>{formatCurrency(goal.target_amount)}</strong>
        </span>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: '600', color: overBudget ? 'var(--red)' : isSavings ? 'var(--green)' : 'var(--accent)' }}>
          {pct.toFixed(0)}%
        </span>
      </div>
    </Card>
  )
}

// ── GoalModal ─────────────────────────────────────────────
function GoalModal({ open, onClose, onSaved, initial }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Goal | null
}) {
  const isEdit = !!initial
  const today = toISODate()
  const blank: GoalCreate = {
    name: '', type: 'spending_limit', target_amount: 0,
    start_date: today, period: 'monthly',
  }

  const [form, setForm] = useState<GoalCreate>(blank)
  const [amountStr, setAmountStr] = useState('')
  const [currentStr, setCurrentStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name, type: initial.type,
        target_amount: initial.target_amount,
        start_date: initial.start_date,
        end_date: initial.end_date,
        period: initial.period,
        category_id: initial.category_id,
      })
      setAmountStr(String(initial.target_amount))
      setCurrentStr(String(initial.current_amount))
    } else {
      setForm(blank)
      setAmountStr('')
      setCurrentStr('')
    }
    setError('')
  }, [open, initial])

  const set = (k: keyof GoalCreate, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome da meta.'); return }
    const target = parseFloat(amountStr.replace(',', '.'))
    if (isNaN(target) || target <= 0) { setError('Informe um valor alvo válido.'); return }

    setSaving(true)
    setError('')
    try {
      const payload: GoalCreate = { ...form, target_amount: target }
      if (isEdit && initial) {
        const current = parseFloat(currentStr.replace(',', '.'))
        await goalsService.update(initial.id, { ...payload, ...(isNaN(current) ? {} : { current_amount: current } as object) })
      } else {
        await goalsService.create(payload)
      }
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar meta. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar meta' : 'Nova meta'} width="26rem">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <Input label="Nome *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Limite restaurantes" required />

        {/* Tipo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Tipo *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {([['spending_limit', 'Limite de gasto'], ['savings_target', 'Meta de poupança']] as [GoalType, string][]).map(([t, label]) => (
              <button key={t} type="button" onClick={() => set('type', t)} style={{
                flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--font-size-sm)', fontWeight: '500',
                border: '0.5px solid',
                borderColor: form.type === t ? (t === 'savings_target' ? 'var(--green)' : 'var(--accent)') : 'var(--border)',
                background: form.type === t ? (t === 'savings_target' ? 'var(--green-soft)' : 'var(--accent-soft)') : 'transparent',
                color: form.type === t ? (t === 'savings_target' ? 'var(--green)' : 'var(--accent)') : 'var(--text-muted)',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Valor alvo + período */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <Input label="Valor alvo (R$) *" value={amountStr} onChange={e => setAmountStr(e.target.value)}
            placeholder="0,00" inputMode="decimal" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500' }}>Período</label>
            <select value={form.period} onChange={e => set('period', e.target.value)} style={sel}>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
        </div>

        {/* Valor atual (só edição) */}
        {isEdit && (
          <Input label="Valor atual (R$)" value={currentStr} onChange={e => setCurrentStr(e.target.value)}
            placeholder="0,00" inputMode="decimal"
            hint="Atualize manualmente o progresso acumulado" />
        )}

        {/* Datas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <Input label="Data início" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          <Input label="Data fim" type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value || undefined)} />
        </div>

        {error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Salvar' : 'Criar meta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Goals (main page) ─────────────────────────────────────
export function Goals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await goalsService.list()
      setGoals(res.goals || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSaved = () => { load(); setEditing(null) }
  const handleDeleted = (id: string) => setGoals(prev => prev.filter(g => g.id !== id))

  const savings = goals.filter(g => g.type === 'savings_target')
  const limits  = goals.filter(g => g.type === 'spending_limit')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Metas</h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
              {goals.length > 0 ? `${goals.length} meta${goals.length > 1 ? 's' : ''} ativa${goals.length > 1 ? 's' : ''}` : 'Nenhuma meta criada'}
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowModal(true) }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nova meta
          </Button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <Spinner size={24} />
          </div>
        ) : goals.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Nenhuma meta ativa. Crie sua primeira meta para acompanhar gastos ou poupança.
            </p>
            <Button onClick={() => setShowModal(true)}>Criar primeira meta</Button>
          </Card>
        ) : (
          <>
            {limits.length > 0 && (
              <section>
                <h2 style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '500', marginBottom: '0.625rem' }}>
                  Limites de gasto
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {limits.map(g => (
                    <GoalCard key={g.id} goal={g}
                      onEdit={(g) => { setEditing(g); setShowModal(true) }}
                      onDeleted={handleDeleted} />
                  ))}
                </div>
              </section>
            )}

            {savings.length > 0 && (
              <section>
                <h2 style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '500', marginBottom: '0.625rem' }}>
                  Metas de poupança
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {savings.map(g => (
                    <GoalCard key={g.id} goal={g}
                      onEdit={(g) => { setEditing(g); setShowModal(true) }}
                      onDeleted={handleDeleted} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <GoalModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSaved={handleSaved}
        initial={editing}
      />

      <PageFooter />
    </div>
  )
}
