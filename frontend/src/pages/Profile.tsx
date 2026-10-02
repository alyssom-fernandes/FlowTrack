import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Page, PageHeader, Tabs } from '../components/ui'
import { GeneralTab } from './profile/GeneralTab'
import { AccountsTab } from './profile/AccountsTab'
import { CategoriesTab } from './profile/CategoriesTab'
import { HistoryTab } from './profile/HistoryTab'
import './profile/profile.css'

const TABS = ['general', 'accounts', 'categories', 'history'] as const
type TabKey = typeof TABS[number]

// A aba fica no endereço (?tab=accounts) para dar para voltar e compartilhar
export function Profile() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabKey = (TABS as readonly string[]).includes(raw || '') ? raw as TabKey : 'general'

  const change = (next: TabKey) => setParams(next === 'general' ? {} : { tab: next }, { replace: true })

  return (
    <Page>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <div className="prf-tabs">
        <Tabs label={t('profile.tabsLabel')} value={tab} onChange={change}
          items={TABS.map(v => ({ value: v, label: t(`profile.tabs.${v}`) }))} />
      </div>
      <div className="prf-body" role="tabpanel" aria-label={t(`profile.tabs.${tab}`)}>
        {tab === 'general' && <GeneralTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </Page>
  )
}
