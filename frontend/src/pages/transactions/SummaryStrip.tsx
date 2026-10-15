// Resumo do filtro atual: entradas, saídas, resultado e categorização automática.
// "A revisar" usa a mesma regra do modo revisão (lib/review): é o atalho para ele, uma contagem só na tela.
// Com as categorias, o "Outros" que a IA deu por falta de opção não conta como categorização automática.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Money, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { formatPercent } from '../../utils'
import { needsReview } from '../../lib/review'
import type { Category, Transaction } from '../../types'
import { autoStats, sumFlows } from './shared'

function Stat({ label, hint, value, sub, className = '' }: { label: string; hint?: string; value: ReactNode | null; sub?: ReactNode; className?: string }) {
  return (
    <div className={`tx-stat ${className}`}>
      <span className="tx-stat__label" title={hint}>
        {label}
        {hint && <Icon name="info" size={13} style={{ color: 'var(--text-hint)' }} />}
      </span>
      {value === null ? <Skeleton width="70%" height={22} style={{ margin: '0.1875rem 0' }} /> : <span className="tx-stat__value">{value}</span>}
      {sub !== undefined && <span className="tx-stat__sub">{sub}</span>}
    </div>
  )
}

export function SummaryStrip({ data, categories, onReview }: { data: Transaction[] | null; categories: Category[]; onReview: () => void }) {
  const { t } = useTranslation()
  const flows = data ? sumFlows(data) : null
  const auto = data ? autoStats(data, categories) : null
  const toReview = data ? data.filter(needsReview).length : 0
  return (
    <Card padding="none" className="tx-summary" role="group" aria-label={t('transactions.summary.label')} aria-busy={!data || undefined}>
      <Stat label={t('transactions.summary.income')} value={flows && <Money value={flows.income} />} />
      <Stat label={t('transactions.summary.expense')} value={flows && <Money value={flows.expense} />} />
      <Stat label={t('transactions.summary.net')} hint={t('transactions.summary.netHint')} value={flows && <Money value={flows.net} signed />} />
      <Stat className="tx-stat--auto" label={t('transactions.summary.auto')} hint={t('transactions.summary.autoHint')}
        value={auto && formatPercent(auto.pct, 0, false)}
        sub={!auto ? <Skeleton width="50%" height={12} /> : toReview > 0
          ? <button type="button" className="tx-pending" onClick={onReview}>{t('transactions.summary.pending', { count: toReview })}<Icon name="arrowRight" size={13} /></button>
          : t('transactions.summary.noPending')} />
    </Card>
  )
}
