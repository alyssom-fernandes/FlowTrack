import { useState, useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore, useAlertsStore } from '../store'
import { authService } from '../services'
import { useOnlineStatus } from '../utils'

// ── Nav items ─────────────────────────────────────────────
const NAV = [
  { path: '/dashboard',    label: 'Dashboard',    mLabel: 'Início',     icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path: '/transactions', label: 'Transações',   mLabel: 'Transações', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg> },
  { path: '/investments',  label: 'Investimentos',mLabel: 'Investir',   icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> },
  { path: '/goals',        label: 'Metas',        mLabel: 'Metas',      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> },
  { path: '/reports',      label: 'Relatórios',   mLabel: 'Relatórios', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { path: '/profile',      label: 'Perfil',       mLabel: 'Perfil',     icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
]

// ── AlertsPanel ───────────────────────────────────────────
function AlertsPanel({ onClose }: { onClose: () => void }) {
  const { alerts, loading } = useAlertsStore()

  const colorMap: Record<string, { color: string; bg: string }> = {
    danger:  { color: 'var(--red)',    bg: 'var(--red-soft)' },
    warning: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
    info:    { color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
      />
      <div style={{
        position: 'absolute', left: 'calc(100% + 0.5rem)', top: 0, zIndex: 200,
        width: '22rem', maxHeight: '28rem', overflowY: 'auto',
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)' }}>Alertas</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', fontSize: '1rem' }}>✕</button>
        </div>
        <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {loading && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-hint)', fontSize: 'var(--font-size-sm)' }}>Carregando...</div>
          )}
          {!loading && alerts.length === 0 && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-hint)', fontSize: 'var(--font-size-sm)' }}>Nenhum alerta no momento.</div>
          )}
          {alerts.map((a, i) => {
            const c = colorMap[a.type] ?? colorMap.info
            return (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-md)', background: c.bg }}>
                <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: c.color, flexShrink: 0, marginTop: '0.3rem' }} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{a.message}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Sidebar ───────────────────────────────────────────────
export function Sidebar() {
  const location = useLocation()
  const { user, isDemo } = useAuthStore()
  const { count, load } = useAlertsStore()
  const [showAlerts, setShowAlerts] = useState(false)
  const displayName = isDemo ? 'Demo' : (user?.email?.split('@')[0] || '')

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside style={{ width: 'var(--sidebar-width)', flexShrink: 0, background: 'var(--bg-sidebar)', borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100dvh', position: 'sticky', top: 0 }}>
      {/* Logo */}
      <div style={{ padding: '1rem 0.875rem', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src="/logo.png" alt="FlowTrack" className="ft-logo" style={{ height: '1.875rem', width: 'auto' }} />
        {/* Bell icon with alert badge */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAlerts(v => !v)}
            title="Alertas"
            aria-label="Ver alertas"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: count > 0 ? 'var(--accent)' : 'var(--text-hint)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', transition: 'color var(--transition)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = count > 0 ? 'var(--accent)' : 'var(--text-hint)')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
          {count > 0 && (
            <span style={{
              position: 'absolute', top: '-2px', right: '-2px',
              minWidth: '1rem', height: '1rem', borderRadius: '9999px',
              background: 'var(--accent)', color: '#fff',
              fontSize: '0.5625rem', fontWeight: '700',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 0.2rem', lineHeight: 1,
            }}>{count > 9 ? '9+' : count}</span>
          )}
          {showAlerts && <AlertsPanel onClose={() => setShowAlerts(false)} />}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        {NAV.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link key={item.path} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', fontWeight: isActive ? '600' : '400', color: isActive ? 'var(--text-primary)' : 'var(--text-hint)', background: isActive ? 'var(--accent-soft)' : 'transparent', textDecoration: 'none', transition: 'all var(--transition)' }}>
              <span style={{ color: isActive ? 'var(--accent)' : 'inherit', flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer: user · Sair */}
      <div style={{ padding: '0.625rem 0.875rem', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" strokeWidth="1.5" strokeLinecap="square"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: '500' }}>{displayName}</span>
        <span style={{ color: 'var(--text-hint)', fontSize: 'var(--font-size-sm)' }}>·</span>
        <button onClick={() => authService.signOut()} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font)', transition: 'color var(--transition)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-hint)')}>Sair</button>
      </div>
    </aside>
  )
}

const MOBILE_NAV = NAV

// ── BottomNavbar ──────────────────────────────────────────
export function BottomNavbar() {
  const location = useLocation()
  return (
    <nav style={{ width: '100%', background: 'var(--bg-sidebar)', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'stretch', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {MOBILE_NAV.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <Link key={item.path} to={item.path} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.1875rem', padding: '0.5rem 0.25rem', color: isActive ? 'var(--accent)' : 'var(--text-hint)', textDecoration: 'none', transition: 'color var(--transition)', minHeight: '3.25rem' }}>
            <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', strokeWidth: isActive ? '2' : '1.5' }}>{item.icon}</span>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: isActive ? '600' : '400', letterSpacing: '0.02em' }}>{item.mLabel}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ── PageFooter ────────────────────────────────────────────
export function PageFooter() {
  return (
    <footer style={{ borderTop: '0.5px solid var(--border)', padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: 'auto' }}>
      {/* AFN SYSTEMS — left */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize: '0.625rem', letterSpacing: '2px', color: 'var(--brand-afn)' }}>AFN</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize: '0.625rem', letterSpacing: '1.5px', color: 'var(--brand-secondary)' }}>SYSTEMS</span>
      </div>
      {/* pipe */}
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', color: 'var(--brand-secondary)' }}>|</span>
      {/* FlowTrack — right */}
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize: '0.6875rem', letterSpacing: '0.3px', color: 'var(--brand-secondary)' }}>FlowTrack</span>
    </footer>
  )
}

// ── OfflineBanner ─────────────────────────────────────────
function OfflineBanner() {
  const { isOnline, isSyncing } = useOnlineStatus()
  if (isOnline && !isSyncing) return null
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      padding: '0.375rem 1rem', textAlign: 'center',
      background: isSyncing ? 'var(--accent-soft)' : 'var(--red-soft)',
      borderBottom: `0.5px solid ${isSyncing ? 'var(--accent)' : 'var(--red)'}`,
      fontSize: 'var(--font-size-sm)',
      color: isSyncing ? 'var(--accent)' : 'var(--red)',
    }}>
      {isSyncing ? '↑ Sincronizando dados...' : '● Sem conexão — alterações serão salvas quando reconectar'}
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .ft-sidebar { display: none; }
        .ft-bottom { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; }
        .ft-main { padding-bottom: calc(3.5rem + env(safe-area-inset-bottom)); overflow-x: hidden; }
        @media (min-width: 768px) {
          .ft-sidebar { display: flex !important; }
          .ft-bottom  { display: none !important; }
          .ft-main    { padding-bottom: 0 !important; }
        }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        <div className="ft-sidebar"><Sidebar /></div>
        <main className="ft-main" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <OfflineBanner />
          {children}
        </main>
        <div className="ft-bottom"><BottomNavbar /></div>
      </div>
    </>
  )
}
