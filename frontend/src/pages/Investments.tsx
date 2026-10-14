import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, IconButton, Money, Page, PageHeader, Skeleton } from '../components/ui'
import { investmentsService } from '../services'
import { useToastStore } from '../store'
import { formatPercent } from '../utils'
import type { Investment } from '../types'
import { AllocationCard } from './investments/AllocationCard'
import { HoldingsHero } from './investments/HoldingsHero'
import { InvestmentModal } from './investments/InvestmentModal'
import { allocation, colorByType } from './investments/model'
import './goals/form.css'
import './investments/investments.css'

interface Totals { invested: number; current: number; profit: number; profitPct: number }


function InvestmentsSkeleton() {
  return (
    <div className="inv" aria-busy="true">
      <div className="inv-kpis">
        {[0, 1, 2].map(i => <Card key={i} className="inv-kpi"><Skeleton width="45%" height={12} /><Skeleton width="70%" height={26} style={{ marginTop: '0.375rem' }} /><Skeleton width="40%" height={12} style={{ marginTop: '0.375rem' }} /></Card>)}
      </div>
      <Card><Skeleton width="30%" height={16} /><Skeleton height={14} style={{ marginTop: '1.25rem' }} /></Card>
      <Card padding="none">
        {[0, 1, 2, 3].map(i => <div key={i} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}><Skeleton width="35%" height={14} /><Skeleton width="20%" height={12} style={{ marginTop: '0.375rem' }} /></div>)}
      </Card>
    </div>
  )
}

export function Investments() {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const [items, setItems] = useState<Investment[] | null>(null)
  const [totals, setTotals] = useState<Totals>({ invested: 0, current: 0, profit: 0, profitPct: 0 })
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [removing, setRemoving] = useState<Investment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await investmentsService.list()
      setItems(res.investments || [])
      setTotals({ invested: res.total_invested, current: res.total_current_value, profit: res.total_profitability, profitPct: res.total_profitability_percent })
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => { setCreating(false); setEditing(null) }
  const saved = (created: boolean) => {
    close()
    toast({ message: created ? t('investments.toast.created') : t('investments.toast.updated') })
    load()
  }

  const confirmDelete = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await investmentsService.remove(removing.id)
      toast({ message: t('investments.toast.deleted') })
      setRemoving(null)
      load()
    } catch {
      toast({ message: t('investments.toast.deleteError'), variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const list = [...(items || [])].sort((a, b) => b.current_value - a.current_value)
  const slices = allocation(list)
  const colorOf = colorByType(slices)

  let body: React.ReactNode
  if (failed) {
    body = (
      <Card>
        <EmptyState icon="alertCircle" title={t('investments.loadError')}
          action={<Button variant="secondary" icon="refresh" onClick={load}>{t('investments.retry')}</Button>} />
      </Card>
    )
  } else if (items === null) {
    body = <InvestmentsSkeleton />
  } else if (items.length === 0) {
    body = (
      <Card>
        <EmptyState icon="trendUp" title={t('investments.empty.title')} description={t('investments.empty.text')}
          action={<Button icon="plus" onClick={() => setCreating(true)}>{t('investments.empty.action')}</Button>} />
      </Card>
    )
  } else {
    body = (
      <div className="inv">
        <HoldingsHero invested={totals.invested} current={totals.current} positions={items.length} types={slices.length} />

        <AllocationCard slices={slices} />

        <Card padding="none">
          <div className="inv-assets__head">
            <CardHeader title={t('investments.assets.title')} subtitle={t('investments.assets.subtitle')} />
          </div>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">{t('investments.assets.asset')}</th>
                  <th scope="col">{t('investments.assets.type')}</th>
                  <th scope="col" className="inv-num">{t('investments.assets.invested')}</th>
                  <th scope="col" className="inv-num">{t('investments.assets.current')}</th>
                  <th scope="col" className="inv-num">{t('investments.assets.result')}</th>
                  <th scope="col"><span className="inv-sr">{t('investments.assets.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map(inv => {
                  const tone = inv.profitability > 0 ? 'gl-pos' : inv.profitability < 0 ? 'gl-neg' : ''
                  const typeLabel = t(`investments.types.${inv.type}`)
                  return (
                    <tr key={inv.id}>
                      <td className="inv-name">
                        <span className="inv-name__title">{inv.name}</span>
                        <span className="inv-name__sub">
                          <span className="inv-name__type"><span className="inv-swatch" style={{ background: colorOf(inv.type) }} aria-hidden />{typeLabel}{inv.institution && <span aria-hidden>·</span>}</span>
                          {inv.institution && <span>{inv.institution}</span>}
                        </span>
                        {inv.notes && <span className="inv-name__note" title={inv.notes}>{inv.notes}</span>}
                      </td>
                      <td className="inv-col-type">
                        <span className="inv-type"><span className="inv-swatch" style={{ background: colorOf(inv.type) }} aria-hidden />{typeLabel}</span>
                      </td>
                      <td className="inv-num inv-col-invested">
                        <span className="inv-cell-label">{t('investments.assets.invested')}</span>
                        <Money value={inv.total_invested} className="inv-value" />
                      </td>
                      <td className="inv-num inv-col-current">
                        <span className="inv-cell-label">{t('investments.assets.current')}</span>
                        <Money value={inv.current_value} style={{ color: 'var(--text-primary)', fontWeight: 500 }} />
                      </td>
                      <td className="inv-num inv-col-result">
                        <span className="inv-cell-label">{t('investments.assets.result')}</span>
                        <span className={`inv-result ft-num ${tone}`}>
                          <Money value={inv.profitability} signed className="inv-result__value" />
                          <span className="inv-result__pct">{formatPercent(inv.profitability_percent, 1, true)}</span>
                        </span>
                      </td>
                      <td className="inv-col-actions">
                        <span className="inv-actions">
                          <IconButton icon="edit" label={t('investments.actions.edit', { name: inv.name })} onClick={() => { setEditing(inv); setCreating(false) }} />
                          <IconButton icon="trash" label={t('investments.actions.delete', { name: inv.name })} onClick={() => setRemoving(inv)} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <Page>
      <PageHeader title={t('investments.title')}
        subtitle={items && items.length ? t('investments.subtitle', { count: items.length }) : t('investments.subtitleEmpty')}
        actions={<Button icon="plus" onClick={() => { setEditing(null); setCreating(true) }}>{t('investments.newInvestment')}</Button>} />
      {body}

      <InvestmentModal open={creating || !!editing} investment={editing} onClose={close} onSaved={saved} />

      <ConfirmDialog open={!!removing} onClose={() => !deleting && setRemoving(null)} onConfirm={confirmDelete} loading={deleting}
        title={t('investments.delete.title')} message={removing ? t('investments.delete.message', { name: removing.name }) : undefined}
        confirmLabel={t('investments.delete.confirm')} />
    </Page>
  )
}
