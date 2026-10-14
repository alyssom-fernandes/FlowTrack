// Resumo do filtro atual: entradas, saídas, resultado e categorização automática
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Money, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { formatPercent } from '../../utils'
import type { Transaction } from '../../types'
import { autoStats, sumFlows } from './shared'

function Stat({ label, hint, dot, value, sub }: { label: string; hint?: string; dot?: string; value: ReactNode | null; sub?: ReactNode }) {
  return (
    <div className="tx-stat">
      <span className="tx-stat__label" title={hint}>
        {dot && <span className="tx-stat__dot" style={{ background: dot }} />}
        {label}
        {hint && <Icon name="info" size={13} style={{ color: 'var(--text-hint)' }} />}
      </span>
      {value === null ? <Skeleton width="70%" height={22} style={{ margin: '0.1875rem 0' }} /> : <span className="tx-stat__value">{value}</span>}
      {sub !== undefined && <span className="tx-stat__sub">{sub}</span>}
    </div>
  )
}

export function SummaryStrip({ data, onShowPending }: { data: Transaction[] | null; onShowPending?: () => void }) {
  const { t } = useTranslation()
  const flows = data ? sumFlows(data) : null
  const auto = data ? autoStats(data) : null
  return (
    <Card padding="none" className="tx-summary" role="group" aria-label={t('transactions.summary.label')} aria-busy={!data || undefined}>
      <Stat label={t('transactions.summary.income')} dot="var(--chart-income)" value={flows && <Money value={flows.income} />} />
      <Stat label={t('transactions.summary.expense')} dot="var(--chart-expense)" value={flows && <Money value={flows.expense} />} />
      <Stat label={t('transactions.summary.net')} hint={t('transactions.summary.netHint')} value={flows && <Money value={flows.net} signed />} />
      <Stat label={t('transactions.summary.auto')} hint={t('transactions.summary.autoHint')}
        value={auto && formatPercent(auto.pct, 0, false)}
        sub={!auto ? <Skeleton width="50%" height={12} /> : auto.pending > 0 && !onShowPending
          ? <span className="tx-pending">{t('transactions.summary.pending', { count: auto.pending })}</span>
          : auto.pending > 0
          ? <button type="button" className="tx-pending" onClick={onShowPending}>{t('transactions.summary.pending', { count: auto.pending })}<Icon name="arrowRight" size={12} /></button>
          : t('transactions.summary.noPending')} />
    </Card>
  )
}
