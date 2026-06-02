import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import { authService } from './services'
import { AppShell } from './components/layout'
import { FullPageSpinner, ToastContainer, ErrorBoundary } from './components/ui'

import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Investments } from './pages/Investments'
import { Goals } from './pages/Goals'
import { Reports } from './pages/Reports'
import { Profile } from './pages/Profile'
import { ResetPassword } from './pages/ResetPassword'

// ── Root redirect — forward recovery codes to /reset-password
function RootRedirect() {
  if (window.location.search.includes('code=')) {
    return <Navigate to={`/reset-password${window.location.search}`} replace />
  }
  return <Navigate to="/dashboard" replace />
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

  useEffect(() => {
    const { data: { subscription } } = authService.onAuthStateChange((session: unknown, event: string) => {
      if (event === 'PASSWORD_RECOVERY') return
      const s = session as { user?: ReturnType<typeof useAuthStore.getState>['user'] & { email?: string } } | null
      setUser(s?.user ?? null)
      setDemo(s?.user?.email === DEMO_EMAIL)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<RootRedirect />} />
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
      <ToastContainer />
    </BrowserRouter>
    </ErrorBoundary>
  )
}
