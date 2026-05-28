import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNavbar } from './BottomNavbar'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { isOnline, isSyncing } = useOnlineStatus()

  return (
    <>
      <style>{`
        .ft-sidebar { display: none; }
        .ft-bottom-nav { display: flex; }
        .ft-main { padding-bottom: calc(3.5rem + env(safe-area-inset-bottom)); }
        @media (min-width: 768px) {
          .ft-sidebar { display: flex !important; }
          .ft-bottom-nav { display: none !important; }
          .ft-main { padding-bottom: 0 !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>

        {/* Offline banner */}
        {(!isOnline || isSyncing) && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0,
            zIndex: 200,
            background: isOnline ? 'var(--accent-soft)' : 'var(--amber-soft)',
            borderBottom: `0.5px solid ${isOnline ? 'var(--accent)' : 'var(--amber)'}`,
            padding: '0.375rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: 'var(--font-size-sm)',
            color: isOnline ? 'var(--accent)' : 'var(--amber)',
          }}>
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: isOnline ? 'var(--accent)' : 'var(--amber)', flexShrink: 0 }} />
            {isSyncing ? 'Sincronizando transações offline…' : 'Sem conexão — lançamentos serão sincronizados quando reconectar'}
          </div>
        )}

        {/* Sidebar — desktop */}
        <div className="ft-sidebar">
          <Sidebar />
        </div>

        {/* Main */}
        <main className="ft-main" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>

        {/* Bottom navbar — mobile */}
        <div className="ft-bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
          <BottomNavbar />
        </div>
      </div>
    </>
  )
}
