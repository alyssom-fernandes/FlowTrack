import { useState, useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useAlertsStore } from '../store'
import { authService } from '../services'
import { demo } from '../demo'
import { useOnlineStatus } from '../utils'
import { Icon, type IconName } from './icons'
import { IconButton, Logo, Modal, Spinner } from './ui'
import type { Alert } from '../types'
import './layout.css'

const NAV: { path: string; key: string; mobileKey: string; icon: IconName }[] = [
  { path: '/dashboard',    key: 'dashboard',    mobileKey: 'home',         icon: 'dashboard' },
  { path: '/transactions', key: 'transactions', mobileKey: 'transactions', icon: 'list' },
  { path: '/investments',  key: 'investments',  mobileKey: 'invest',       icon: 'trendUp' },
  { path: '/goals',        key: 'goals',        mobileKey: 'goals',        icon: 'target' },
  { path: '/reports',      key: 'reports',      mobileKey: 'reports',      icon: 'pie' },
  { path: '/profile',      key: 'profile',      mobileKey: 'profile',      icon: 'user' },
]

const ALERT_LOOK: Record<Alert['type'], { icon: IconName; color: string }> = {
  danger:  { icon: 'alertCircle', color: 'var(--red)' },
  warning: { icon: 'alert',       color: 'var(--amber)' },
  info:    { icon: 'info',        color: 'var(--blue)' },
}

// ── Lista de alertas (popover no computador, folha no celular) ──
function AlertsList() {
  const { t } = useTranslation()
  const { alerts, loading } = useAlertsStore()
  if (loading) return <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'center' }}><Spinner size={18} /></div>
  if (!alerts.length) {
    return (
      <div style={{ padding: '1.5rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <Icon name="checkCircle" size={20} style={{ color: 'var(--green)' }} />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>{t('nav.noAlerts')}</span>
      </div>
    )
  }
  return (
    <div style={{ padding: '0.25rem' }}>
      {alerts.map((a, i) => {
        const look = ALERT_LOOK[a.type] ?? ALERT_LOOK.info
        return (
          <div key={i} className="ft-alert-item">
            <Icon name={look.icon} size={16} style={{ color: look.color, marginTop: '0.0625rem' }} />
            <span className="ft-alert-item__text">{a.message}</span>
          </div>
        )
      })}
    </div>
  )
}

function BellButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  const { count } = useAlertsStore()
  return (
    <span className="ft-bell">
      <IconButton icon="bell" label={count ? `${t('nav.alerts')} (${count})` : t('nav.alerts')} onClick={onClick} size="md" />
      {count > 0 && <span className="ft-bell__count">{count > 9 ? '9+' : count}</span>}
    </span>
  )
}

function useDisplayName() {
  const { t } = useTranslation()
  const { user, isDemo } = useAuthStore()
  const name = isDemo ? t('nav.demoUser') : (user?.email?.split('@')[0] || '')
  const sub = isDemo ? t('nav.demoUserSub') : (user?.email || '')
  return { name, sub, initial: (name || '?').charAt(0).toUpperCase() }
}

// ── Sidebar (computador) ──────────────────────────────────
export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { load } = useAlertsStore()
  const [showAlerts, setShowAlerts] = useState(false)
  const { name, sub, initial } = useDisplayName()

  useEffect(() => { load() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="ft-sidebar" aria-label={t('nav.menu')}>
      <div className="ft-sidebar__inner">
        <div className="ft-sidebar__top">
          <Link to="/dashboard" aria-label="FlowTrack"><Logo height={24} /></Link>
          <div style={{ position: 'relative' }}>
            <BellButton onClick={() => setShowAlerts(v => !v)} />
            {showAlerts && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowAlerts(false)} />
                <div className="ft-alerts-pop" role="dialog" aria-label={t('nav.alerts')}>
                  <div className="ft-alerts-pop__head">
                    <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{t('nav.alerts')}</span>
                    <IconButton icon="close" label={t('common.close')} onClick={() => setShowAlerts(false)} />
                  </div>
                  <AlertsList />
                </div>
              </>
            )}
          </div>
        </div>

        <nav className="ft-sidebar__nav">
          {NAV.map(item => (
            <Link key={item.path} to={item.path} className="ft-nav-link" aria-current={location.pathname === item.path ? 'page' : undefined}>
              <Icon name={item.icon} size={18} />
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        <div className="ft-sidebar__user">
          <span className="ft-avatar" aria-hidden>{initial}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ft-sidebar__user-name">{name}</div>
            <div className="ft-sidebar__user-sub">{sub}</div>
          </div>
          <IconButton icon="logout" label={t('nav.signOut')} onClick={() => authService.signOut()} />
        </div>
      </div>
    </aside>
  )
}

// ── Barra superior (celular) ──────────────────────────────
function MobileTopBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { load } = useAlertsStore()
  const [open, setOpen] = useState(false)

  useEffect(() => { load() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <header className="ft-mobile-top">
      <Link to="/dashboard" aria-label="FlowTrack"><Logo height={20} /></Link>
      <BellButton onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title={t('nav.alerts')}>
        <AlertsList />
      </Modal>
    </header>
  )
}

// ── Navegação de baixo (celular) ──────────────────────────
export function BottomNavbar() {
  const { t } = useTranslation()
  const location = useLocation()
  return (
    <nav className="ft-bottom" aria-label={t('nav.menu')}>
      {NAV.map(item => (
        <Link key={item.path} to={item.path} className="ft-bottom__link" aria-current={location.pathname === item.path ? 'page' : undefined}>
          <Icon name={item.icon} size={20} strokeWidth={location.pathname === item.path ? 2 : 1.75} />
          <span>{t(`nav.${item.mobileKey}`)}</span>
        </Link>
      ))}
    </nav>
  )
}

// ── Aviso de demonstração ─────────────────────────────────
function DemoBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isDemo } = useAuthStore()
  if (!isDemo) return null
  const restore = () => { demo.restart(); window.location.reload() }
  const exit = async () => { await authService.signOut(); navigate('/login', { replace: true }) }
  return (
    <div className="ft-demo-banner" role="note">
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        <span className="ft-demo-banner__dot" />
        <span className="ft-demo-banner__long">{t('nav.demoBanner')}</span>
        <span className="ft-demo-banner__short">{t('nav.demoBannerShort')}</span>
      </span>
      <span className="ft-demo-banner__actions">
        <button type="button" className="ft-link-btn" onClick={restore}>{t('nav.demoRestore')}</button>
        <button type="button" className="ft-link-btn" onClick={exit}>{t('nav.demoExit')}</button>
      </span>
    </div>
  )
}

// ── Rodapé da marca (guia AFN) ────────────────────────────
function BrandFooter() {
  return (
    <footer className="ft-page-footer">
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span className="pf-afn" style={{ fontSize: '10px' }}>AFN</span>
        <span className="pf-gap" />
        <span className="pf-sys" style={{ fontSize: '10px' }}>SYSTEMS</span>
      </div>
      <span className="pf-pipe" style={{ fontSize: '13px' }}>|</span>
      <span className="pf-info" style={{ fontSize: '11px' }}>FlowTrack</span>
    </footer>
  )
}

// O rodapé agora vem do AppShell; mantido só para as telas que ainda o importam.
export function PageFooter() { return null }

// ── Sem conexão ───────────────────────────────────────────
function OfflineBanner() {
  const { t } = useTranslation()
  const { isOnline, isSyncing } = useOnlineStatus()
  if (isOnline && !isSyncing) return null
  return (
    <div className="ft-offline" role="status" style={{
      background: isSyncing ? 'var(--blue-soft)' : 'var(--amber-soft)',
      color: isSyncing ? 'var(--blue)' : 'var(--amber)',
      borderBottom: '1px solid var(--border)',
    }}>
      <Icon name={isSyncing ? 'refresh' : 'alert'} size={14} />
      {isSyncing ? t('nav.syncing') : t('nav.offline')}
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  return (
    <div className="ft-shell">
      <a href="#conteudo" className="ft-skip">{t('nav.skipToContent')}</a>
      <Sidebar />
      <div className="ft-main-col">
        <MobileTopBar />
        <DemoBanner />
        <OfflineBanner />
        <main id="conteudo" className="ft-main">{children}</main>
        <BrandFooter />
      </div>
      <BottomNavbar />
    </div>
  )
}
