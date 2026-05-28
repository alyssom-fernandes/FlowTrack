import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { path: '/dashboard', label: 'Início', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="square"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path: '/transactions', label: 'Transações', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="square"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg> },
  { path: '/investments', label: 'Investir', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="square"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> },
  { path: '/goals', label: 'Metas', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="square"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> },
  { path: '/profile', label: 'Perfil', icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="square"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><rect x="8" y="3" width="8" height="8"/></svg> },
]

export function BottomNavbar() {
  const location = useLocation()

  return (
    <nav style={{
      width: '100%',
      background: 'var(--bg-sidebar)',
      borderTop: '0.5px solid var(--border)',
      display: 'flex',
      alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <Link key={item.path} to={item.path} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.1875rem',
            padding: '0.5rem 0.25rem',
            color: isActive ? 'var(--accent)' : 'var(--text-hint)',
            textDecoration: 'none',
            transition: 'color var(--transition)',
            minHeight: '3.25rem',
          }}>
            {item.icon(isActive)}
            <span style={{ fontSize: '0.5625rem', fontWeight: isActive ? '600' : '400', letterSpacing: '0.02em' }}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
