import { useState, useEffect } from 'react'
import { PageFooter } from '../components/layout'
import { Card, Button } from '../components/ui'
import { useAuthStore } from '../store'
import { authService } from '../services'
import { formatDate } from '../utils'

const THEME_KEY = 'ft-theme'

function getTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light'
    localStorage.setItem(THEME_KEY, 'light')
  } else {
    delete document.documentElement.dataset.theme
    localStorage.setItem(THEME_KEY, 'dark')
  }
}

// ── ThemeToggle ───────────────────────────────────────────
function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const isDark = theme === 'dark'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>
          Aparência
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', marginTop: '0.125rem' }}>
          {isDark ? 'Modo escuro ativo' : 'Modo claro ativo'}
        </div>
      </div>
      <button
        onClick={toggle}
        aria-label="Alternar tema"
        style={{
          width: '3rem', height: '1.625rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          background: isDark ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background var(--transition)', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '0.1875rem',
          left: isDark ? 'calc(100% - 1.25rem)' : '0.1875rem',
          width: '1.25rem', height: '1.25rem', borderRadius: '50%',
          background: '#fff', transition: 'left var(--transition)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isDark
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9D2449" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          }
        </span>
      </button>
    </div>
  )
}

// ── InfoRow ───────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>{value}</span>
    </div>
  )
}

// ── Profile ───────────────────────────────────────────────
export function Profile() {
  const { user, isDemo } = useAuthStore()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try { await authService.signOut() } finally { setSigningOut(false) }
  }

  const displayName = isDemo ? 'Demo' : (user?.email?.split('@')[0] || '—')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '36rem' }}>

        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text-primary)' }}>Perfil</h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Configurações da conta</p>
        </div>

        {/* Avatar + nome */}
        <Card style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '3rem', height: '3rem', borderRadius: '50%', flexShrink: 0,
            background: isDemo ? 'var(--amber-soft)' : 'var(--accent-soft)',
            border: `1.5px solid ${isDemo ? 'var(--amber)' : 'var(--accent)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--font-size-lg)', fontWeight: '700',
            color: isDemo ? 'var(--amber)' : 'var(--accent)',
          }}>
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || '—'}</div>
            {isDemo && (
              <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '0.0625rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', background: 'var(--amber-soft)', color: 'var(--amber)', fontWeight: '500' }}>
                Conta demo
              </span>
            )}
          </div>
        </Card>

        {/* Informações da conta */}
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>
            Informações
          </span>
          <InfoRow label="E-mail" value={user?.email || '—'} />
          <InfoRow label="Membro desde" value={user?.created_at ? formatDate(user.created_at) : '—'} />
          <InfoRow label="Plano" value={isDemo ? 'Demo (reset semanal)' : 'Pessoal'} />
        </Card>

        {/* Aparência */}
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500', display: 'block', marginBottom: '0.75rem' }}>
            Aparência
          </span>
          <ThemeToggle />
        </Card>

        {/* Sair */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', fontWeight: '500' }}>Encerrar sessão</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)', marginTop: '0.125rem' }}>Você será redirecionado para o login</div>
            </div>
            <Button variant="danger" size="sm" loading={signingOut} onClick={handleSignOut}>Sair</Button>
          </div>
        </Card>
      </div>

      <PageFooter />
    </div>
  )
}
