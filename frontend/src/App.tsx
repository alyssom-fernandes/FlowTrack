import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import { authService } from './services'
import { AppShell } from './components/layout'
import { FullPageSpinner, Button, Input } from './components/ui'

import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Investments } from './pages/Investments'
import { Goals } from './pages/Goals'
import { Reports } from './pages/Reports'
import { Profile } from './pages/Profile'

// ── Password Reset Page ───────────────────────────────────
function PasswordResetPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true); setError('')
    try {
      await authService.updatePassword(password)
      setDone(true)
    } catch {
      setError('Erro ao atualizar a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '22rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="FlowTrack" className="ft-logo" style={{ height: '1.75rem', margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)' }}>
            {done ? 'Senha atualizada com sucesso.' : 'Defina sua nova senha'}
          </p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem' }}>
          {done ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="square" style={{ margin: '0 auto' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)' }}>
                Sua senha foi atualizada. Você já pode fazer login.
              </p>
              <Button onClick={() => window.location.href = '/login'} style={{ width: '100%' }}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <Input
                label="Nova senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
              <Input
                label="Confirmar senha"
                type="password"
                placeholder="Repita a nova senha"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</p>}
              <Button type="submit" loading={loading} style={{ width: '100%', marginTop: '0.25rem' }}>
                Salvar nova senha
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Protected Route ───────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'demo@flowtrack.app'

export default function App() {
  const { setUser, setLoading, setDemo } = useAuthStore()
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = authService.onAuthStateChange((session: unknown, event: string) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        setLoading(false)
        return
      }
      const s = session as { user?: ReturnType<typeof useAuthStore.getState>['user'] & { email?: string } } | null
      setUser(s?.user ?? null)
      setDemo(s?.user?.email === DEMO_EMAIL)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Show password reset UI when coming from a recovery email link
  if (passwordRecovery) return <PasswordResetPage />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {[
          { path: '/dashboard',    el: <Dashboard /> },
          { path: '/transactions', el: <Transactions /> },
          { path: '/investments',  el: <Investments /> },
          { path: '/goals',        el: <Goals /> },
          { path: '/reports',      el: <Reports /> },
          { path: '/profile',      el: <Profile /> },
        ].map(({ path, el }) => (
          <Route key={path} path={path} element={
            <ProtectedRoute>
              <AppShell>{el}</AppShell>
            </ProtectedRoute>
          } />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
