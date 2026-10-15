import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Button, Page, PageHeader, Tabs } from '../components/ui'
import { GoalsTab } from './goals/GoalsTab'
import { BudgetsTab } from './goals/BudgetsTab'
import './goals/goals.css'

const TABS = ['metas', 'orcamentos'] as const
type TabKey = typeof TABS[number]

// A aba fica no endereço (?aba=orcamentos), usado pelo Dashboard
export function Goals() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab: TabKey = params.get('aba') === 'orcamentos' ? 'orcamentos' : 'metas'
  const [creating, setCreating] = useState(false)
  // Lista vazia: o botão do topo some e o do vazio fica como o único principal
  const [empty, setEmpty] = useState(false)

  const change = (next: TabKey) => {
    setCreating(false)
    setEmpty(false)
    setParams(next === 'metas' ? {} : { aba: next }, { replace: true })
  }

  return (
    <Page>
      <PageHeader title={t('goals.title')} subtitle={t(`goals.subtitle.${tab}`)}
        actions={empty ? undefined : <Button icon="plus" onClick={() => setCreating(true)}>{tab === 'metas' ? t('goals.newGoal') : t('goals.budgets.new')}</Button>} />
      <div className="gl-tabs">
        <Tabs label={t('goals.tabsLabel')} value={tab} onChange={change} items={TABS.map(v => ({ value: v, label: t(`goals.tabs.${v}`) }))} />
      </div>
      <div role="tabpanel" aria-label={t(`goals.tabs.${tab}`)}>
        {tab === 'metas'
          ? <GoalsTab creating={creating} onCreatingChange={setCreating} onEmptyChange={setEmpty} />
          : <BudgetsTab creating={creating} onCreatingChange={setCreating} onEmptyChange={setEmpty} />}
      </div>
    </Page>
  )
}
