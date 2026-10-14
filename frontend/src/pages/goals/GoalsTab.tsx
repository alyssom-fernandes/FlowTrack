import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Money, ProgressBar, SectionLabel, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { categoriesService, goalsService } from '../../services'
import { useToastStore } from '../../store'
import { categoryLabel, formatCurrency, formatDate, formatPercent, toISODate } from '../../utils'
import type { Category, Goal, GoalType } from '../../types'
import { describeGoal, goalRange, type GoalStatus } from './helpers'
import { GoalModal } from './GoalModal'
import { CategoryIcon } from '../dashboard/CategoryIcon'
import { categoryColor } from '../../lib/categoryColor'

const STATUS_LOOK: Record<GoalStatus, 'green' | 'amber' | 'red' | 'default'> = {
  ok: 'green', warn: 'amber', over: 'red', behind: 'amber', done: 'green', upcoming: 'default', ended: 'default',
}

// A barra fala o mesmo que a pílula: a cor é a do estado, não a da categoria
const STATUS_COLOR: Record<GoalStatus, string> = {
  ok: 'var(--pace-ok)', warn: 'var(--pace-warn)', over: 'var(--pace-over)', behind: 'var(--pace-warn)', done: 'var(--pace-ok)',
  upcoming: 'var(--chart-neutral)', ended: 'var(--chart-neutral)',
}

function GoalCard({ goal, category, today, onEdit, onDelete }: {
  goal: Goal; category?: Category; today: Date; onEdit: () => void; onDelete: () => void
}) {
  const { t } = useTranslation()
  const isLimit = goal.type === 'spending_limit'
  const v = describeGoal(goal, today, t)
  const { end } = goalRange(goal, today)
  const statusText = t(`goals.status.${v.status}`)
  const showPace = v.elapsed !== null && (v.status === 'ok' || v.status === 'warn' || v.status === 'behind')

  let left: React.ReactNode
  if (isLimit) {
    left = v.remaining >= 0
      ? t('goals.left', { value: formatCurrency(v.remaining) })
      : <span className="gl-neg">{t('goals.overBy', { value: formatCurrency(-v.remaining) })}</span>
  } else {
    left = v.remaining > 0 ? t('goals.missing', { value: formatCurrency(v.remaining) })
      : v.remaining < 0 ? t('goals.beyond', { value: formatCurrency(-v.remaining) }) : t('goals.reached')
  }

  let right: string | null = null
  if (v.status === 'upcoming') right = t('goals.startsOn', { date: formatDate(goal.start_date, { day: 'numeric', month: 'short' }) })
  else if (v.status === 'ended' && end) right = t('goals.endedOn', { date: formatDate(toISODate(end), { day: 'numeric', month: 'short', year: 'numeric' }) })
  else if (v.daysLeft !== null && v.status !== 'done') right = t('goals.daysLeft', { count: v.daysLeft })

  // Meta de economia tem identidade: faixa na cor da categoria (ou vinho) com o ícone grande
  const color = category ? categoryColor(category) : 'var(--accent)'
  return (
    <Card className={`gl-card${isLimit ? '' : ' gl-card--savings'}`} style={{ '--c': color } as React.CSSProperties}>
      {/* Meta de economia: faixa na cor da meta, glifo grande cortado pela borda e o valor guardado sobre ela */}
      {!isLimit && (
        <div className="gl-card__band">
          <span className="gl-card__band-icon" aria-hidden>{category ? <CategoryIcon name={category.icon} size={96} /> : <Icon name="piggy" size={96} />}</span>
          <span className="gl-card__band-fig">
            <Money value={goal.current_amount} size="kpi" className="gl-card__value" />
            <span className="gl-card__of ft-num">{t('goals.of', { value: formatCurrency(goal.target_amount) })}</span>
          </span>
        </div>
      )}
      <div className="gl-card__top">
        <div className="gl-card__heading">
          <h3 className="gl-card__name">{goal.name}</h3>
          <div className="gl-card__meta">
            <span className="gl-card__meta-item">
              <span className="gl-dot" style={{ background: category ? categoryColor(category) : 'var(--chart-neutral)' }} aria-hidden />
              {category ? categoryLabel(category) : isLimit ? t('goals.allSpending') : t('goals.allIncome')}
            </span>
            <span className="gl-card__meta-item"><Icon name="calendar" size={13} />{v.periodText}</span>
          </div>
        </div>
        <div className="gl-card__status">
          <Badge variant={STATUS_LOOK[v.status]} dot={v.status !== 'done'} icon={v.status === 'done' ? 'check' : undefined}>{statusText}</Badge>
        </div>
        <div className="gl-card__actions">
          <IconButton icon="edit" label={t('goals.actions.edit', { name: goal.name })} onClick={onEdit} />
          <IconButton icon="trash" label={t('goals.actions.delete', { name: goal.name })} onClick={onDelete} />
        </div>
      </div>

      <div className="gl-card__progress">
        <div className="gl-card__figures">
          {isLimit ? (
            <span className="gl-card__amount">
              <Money value={goal.current_amount} className={`gl-card__value${v.pct > 100 ? ' gl-neg' : ''}`} />
              <span className="gl-card__of ft-num">{t('goals.of', { value: formatCurrency(goal.target_amount) })}</span>
            </span>
          ) : <span className="gl-card__saved">{t('goals.saved')}</span>}
          <span className="gl-card__pct ft-num">{formatPercent(v.pct, 0, false)}</span>
        </div>
        <ProgressBar value={v.pct} color={STATUS_COLOR[v.status]} pace={showPace ? v.elapsed! * 100 : undefined}
          label={`${goal.name}: ${formatPercent(v.pct, 0, false)}, ${statusText}`} />
        <div className="gl-card__foot ft-num">
          <span>{left}</span>
          {right && <span>{right}</span>}
        </div>
      </div>
    </Card>
  )
}

function GoalsSkeleton() {
  return (
    <div className="gl-grid" aria-busy="true">
      {[0, 1, 2].map(i => (
        <Card key={i} className="gl-skel">
          <Skeleton width="55%" height={16} />
          <Skeleton width="40%" height={12} />
          <Skeleton width="45%" height={22} style={{ marginTop: '0.5rem' }} />
          <Skeleton height={6} radius="9999px" />
          <Skeleton width="35%" height={12} />
        </Card>
      ))}
    </div>
  )
}

export function GoalsTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [presetType, setPresetType] = useState<GoalType>('spending_limit')
  const [removing, setRemoving] = useState<Goal | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [today] = useState(() => new Date())

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [g, c] = await Promise.all([goalsService.list(), categoriesService.list()])
      setGoals(g.goals || [])
      setCategories(c.categories || [])
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = (type: GoalType) => { setPresetType(type); setEditing(null); onCreatingChange(true) }
  const close = () => { onCreatingChange(false); setEditing(null); setPresetType('spending_limit') }

  const saved = (created: boolean) => {
    close()
    toast({ message: created ? t('goals.toast.created') : t('goals.toast.updated') })
    load()
  }

  const confirmDelete = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await goalsService.remove(removing.id)
      setGoals(list => (list || []).filter(g => g.id !== removing.id))
      toast({ message: t('goals.toast.deleted') })
      setRemoving(null)
    } catch {
      toast({ message: t('goals.toast.deleteError'), variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const catById = new Map(categories.map(c => [c.id, c]))
  const limits = (goals || []).filter(g => g.type === 'spending_limit')
  const savings = (goals || []).filter(g => g.type === 'savings_target')

  const section = (title: string, list: Goal[], invite?: ReactNode) => (list.length > 0 || invite) && (
    <section className="gl-section" aria-label={title}>
      <SectionLabel><span>{title}<span className="gl-count ft-num">{list.length}</span></span></SectionLabel>
      <div className="gl-grid">
        {list.map(g => (
          <GoalCard key={g.id} goal={g} category={g.category_id ? catById.get(g.category_id) : undefined} today={today}
            onEdit={() => { setEditing(g); onCreatingChange(false) }} onDelete={() => setRemoving(g)} />
        ))}
        {invite}
      </div>
    </section>
  )
  // Com uma meta de economia (ou nenhuma), o espaço ao lado vira o convite para a próxima
  const savingsInvite = savings.length === 0 || savings.length % 2 === 1 ? (
    <button type="button" className="gl-invite" onClick={() => openNew('savings_target')}>
      <span className="gl-invite__icon"><Icon name="plus" size={20} /></span>
      <span className="gl-invite__title">{t('goals.invite.title')}</span>
      <span className="gl-invite__text">{t('goals.invite.text')}</span>
    </button>
  ) : undefined

  return (
    <div className="gl-panel">
      {failed ? (
        <Card>
          <EmptyState icon="alertCircle" title={t('goals.loadError')}
            action={<Button variant="secondary" icon="refresh" onClick={load}>{t('goals.retry')}</Button>} />
        </Card>
      ) : goals === null ? (
        <GoalsSkeleton />
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState icon="target" title={t('goals.empty.title')} description={t('goals.empty.text')}
            action={<>
              <Button icon="plus" onClick={() => openNew('spending_limit')}>{t('goals.empty.limit')}</Button>
              <Button variant="secondary" onClick={() => openNew('savings_target')}>{t('goals.empty.savings')}</Button>
            </>} />
        </Card>
      ) : (
        <>
          {section(t('goals.sections.limits'), limits)}
          {section(t('goals.sections.savings'), savings, savingsInvite)}
        </>
      )}

      <GoalModal open={creating || !!editing} goal={editing} presetType={presetType} categories={categories} onClose={close} onSaved={saved} />

      <ConfirmDialog open={!!removing} onClose={() => !deleting && setRemoving(null)} onConfirm={confirmDelete} loading={deleting}
        title={t('goals.delete.title')} message={removing ? t('goals.delete.message', { name: removing.name }) : undefined}
        confirmLabel={t('goals.delete.confirm')} />
    </div>
  )
}
