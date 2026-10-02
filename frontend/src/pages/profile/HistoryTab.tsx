import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, IconButton, Money } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { useToastStore } from '../../store'
import { accountsService, auditLogService, categoriesService } from '../../services'
import { categoryLabel, formatDate, formatDateShort, formatRelative, formatSignedCurrency } from '../../utils'
import type { Account, AuditLogEntry, Category } from '../../types'
import { ListSkeleton, LoadError } from './parts'

// Campos que aparecem na comparação "antes → depois", nesta ordem
const FIELDS = ['description', 'amount', 'transaction_date', 'type', 'account_id', 'category_id', 'is_recurring', 'tags', 'notes'] as const
type FieldKey = typeof FIELDS[number]

const ICONS: Record<AuditLogEntry['action'], IconName> = { create: 'plus', update: 'edit', delete: 'trash' }

interface Lookup { accounts: Map<string, Account>; categories: Map<string, Category> }

export function HistoryTab() {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [lookup, setLookup] = useState<Lookup>({ accounts: new Map(), categories: new Map() })
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pending, setPending] = useState<AuditLogEntry | null>(null)
  const [undoing, setUndoing] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    setRefreshing(true)
    try {
      const [log, accs, cats] = await Promise.all([
        auditLogService.list(50),
        accountsService.list().catch(() => null),
        categoriesService.list().catch(() => null),
      ])
      setEntries(log.entries || [])
      setLookup({
        accounts: new Map((accs?.accounts || []).map(a => [a.id, a])),
        categories: new Map((cats?.categories || []).map(c => [c.id, c])),
      })
    } catch {
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const undo = async () => {
    if (!pending) return
    setUndoing(true)
    try {
      await auditLogService.undo(pending.id)
      toast({ message: t('profile.history.undoDone') })
      setPending(null)
      load()
    } catch {
      toast({ message: t('profile.history.undoError'), variant: 'error' })
    } finally {
      setUndoing(false)
    }
  }

  const loading = entries === null && !failed

  // Texto de cada valor, conforme o campo
  const show = (key: FieldKey, v: unknown): string => {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '—'
    switch (key) {
      case 'amount': return formatSignedCurrency(Number(v))
      case 'transaction_date': return formatDate(String(v))
      case 'type': return t(`profile.history.types.${String(v)}`, { defaultValue: String(v) })
      case 'account_id': return lookup.accounts.get(String(v))?.name ?? '—'
      case 'category_id': return categoryLabel(lookup.categories.get(String(v)), '—')
      case 'is_recurring': return v ? t('common.yes') : t('common.no')
      case 'tags': return Array.isArray(v) ? v.join(', ') : String(v)
      default: return String(v)
    }
  }

  const describe = (e: AuditLogEntry) => {
    const oldV = e.old_values || {}
    const newV = e.new_values || {}
    const name = String(newV.description ?? oldV.description ?? '').trim() || t('profile.history.noDescription')
    const rawAmount = e.action === 'delete' ? oldV.amount : (newV.amount ?? oldV.amount)
    const amount = rawAmount === undefined || rawAmount === null ? null : Number(rawAmount)
    const base = e.action === 'delete' ? oldV : { ...oldV, ...newV }
    const account = base.account_id ? lookup.accounts.get(String(base.account_id))?.name : undefined
    const date = base.transaction_date ? formatDateShort(String(base.transaction_date)) : undefined
    const changes = e.action === 'update'
      ? FIELDS.filter(k => k in newV && JSON.stringify(newV[k] ?? null) !== JSON.stringify(oldV[k] ?? null))
          .map(k => ({ key: k, from: show(k, oldV[k]), to: show(k, newV[k]) }))
      : []
    return { name, amount, account, date, changes }
  }

  const title = (e: AuditLogEntry) => e.entity_type === 'transaction'
    ? t(`profile.history.actions.${e.action}`)
    : t(`profile.history.entities.${e.entity_type}`, { defaultValue: t('profile.history.otherEntity') })

  const pendingInfo = pending ? describe(pending) : null
  const pendingText = pending && pendingInfo
    ? t(pending.action === 'create' ? 'profile.history.undoCreate' : pending.action === 'delete' ? 'profile.history.undoDelete' : 'profile.history.undoUpdate', {
        name: pendingInfo.name, amount: pendingInfo.amount === null ? '—' : formatSignedCurrency(pendingInfo.amount),
      })
    : ''

  return (
    <>
      <Card>
        <CardHeader title={t('profile.history.title')} subtitle={t('profile.history.subtitle')}
          action={entries && entries.length > 0 ? <IconButton icon="refresh" label={t('profile.history.refresh')} onClick={load} disabled={refreshing} /> : undefined} />
        {failed ? (
          <LoadError message={t('profile.history.loadError')} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : entries!.length === 0 ? (
          <EmptyState icon="history" title={t('profile.history.emptyTitle')} description={t('profile.history.emptyText')}
            action={<Button variant="secondary" iconRight="arrowRight" onClick={() => navigate('/transactions')}>{t('profile.history.emptyAction')}</Button>} />
        ) : (
          <ol className="prf-entries">
            {entries!.map(e => {
              const info = describe(e)
              const canUndo = !e.undone && e.entity_type === 'transaction'
              return (
                <li key={e.id} className={`prf-entry${e.undone ? ' prf-entry--undone' : ''}`}>
                  <span className="prf-entry__icon" aria-hidden><Icon name={ICONS[e.action] ?? 'history'} size={15} /></span>
                  <div className="prf-entry__body">
                    <div className="prf-entry__head">
                      <span className="prf-entry__title">{info.name}</span>
                      {info.amount !== null && (
                        <Money value={info.amount} signed tone={e.undone ? 'none' : 'auto'} className="prf-entry__amount" />
                      )}
                    </div>
                    <div className="prf-entry__meta">
                      <span>{title(e)}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={e.created_at} title={formatDate(e.created_at, { dateStyle: 'medium', timeStyle: 'short' })}>
                        {formatRelative(e.created_at)}
                      </time>
                      {(info.account || info.date) && <span aria-hidden>·</span>}
                      {(info.account || info.date) && <span>{[info.account, info.date].filter(Boolean).join(', ')}</span>}
                      {e.undone && <Badge size="sm" icon="undo">{t('profile.history.undone')}</Badge>}
                    </div>
                    {e.action === 'update' && (
                      info.changes.length > 0 ? (
                        <ul className="prf-diff">
                          {info.changes.map(c => (
                            <li key={c.key} className="prf-diff__row">
                              <span className="prf-sr">{t('profile.history.changeLabel', { field: t(`profile.history.fields.${c.key}`), from: c.from, to: c.to })}</span>
                              <span className="prf-diff__label" aria-hidden>{t(`profile.history.fields.${c.key}`)}</span>
                              <span className="prf-diff__values ft-num" aria-hidden>
                                <s className="prf-diff__old">{c.from}</s>
                                <Icon name="arrowRight" size={12} style={{ color: 'var(--text-hint)' }} />
                                <span className="prf-diff__new">{c.to}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="prf-entry__note">{t('profile.history.noChanges')}</p>
                    )}
                  </div>
                  {canUndo && (
                    <div className="prf-entry__action">
                      <Button variant="secondary" size="sm" icon="undo" className="prf-touch" onClick={() => setPending(e)}
                        aria-label={t('profile.history.undoLabel', { name: info.name })}>
                        {t('profile.history.undo')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <ConfirmDialog open={!!pending} onClose={() => !undoing && setPending(null)} onConfirm={undo} loading={undoing} danger={false}
        title={t('profile.history.undoTitle')} message={pendingText} confirmLabel={t('profile.history.undo')} />
    </>
  )
}
