// Endereço que não existe: diz o que aconteceu e leva de volta (antes, qualquer rota ia para o painel)
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Icon } from '../components/icons'

export function NotFound() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  useDocumentTitle(t('common.notFound.title'))
  return (
    <main className="ft-notfound">
      <img src="/logo.png" alt="FlowTrack" className="ft-logo-escuro ft-notfound__logo" />
      <img src="/logo-claro.png" alt="FlowTrack" className="ft-logo-claro ft-notfound__logo" />
      <p className="ft-notfound__code ft-num" aria-hidden>404</p>
      <h1 className="ft-notfound__title">{t('common.notFound.title')}</h1>
      <p className="ft-notfound__text">{t('common.notFound.text', { path: pathname })}</p>
      <Link to="/" className="ft-btn ft-btn--primary ft-btn--md"><Icon name="dashboard" size={16} />{t('common.notFound.action')}</Link>
    </main>
  )
}
