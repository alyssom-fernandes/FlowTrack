import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import { authService } from './services'
import { AppShell } from './components/layout'
import { FullPageSpinner, PageLoading, ToastContainer, ErrorBoundary } from './components/ui'

// Cada tela é carregada só quando é aberta
const Login         = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const Dashboard     = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Transactions  = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })))
const Investments   = lazy(() => import('./pages/Investments').then(m => ({ default: m.Investments })))
const Goals         = lazy(() => import('./pages/Goals').then(m => ({ default: m.Goals })))
const Reports       = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })))
const Profile       = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })))

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
      setDemo(authService.isDemo() || s?.user?.email === DEMO_EMAIL)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={<FullPageSpinner />}><Login /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={<FullPageSpinner />}><ResetPassword /></Suspense>} />
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
              <AppShell><Suspense fallback={<PageLoading />}>{el}</Suspense></AppShell>
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
