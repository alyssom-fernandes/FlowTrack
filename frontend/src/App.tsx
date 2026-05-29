import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import { authService } from './services'
import { AppShell } from './components/layout'
import { FullPageSpinner } from './components/ui'

import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Investments } from './pages/Investments'
import { Goals } from './pages/Goals'
import { Reports } from './pages/Reports'
import { Profile } from './pages/Profile'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  // Wait for auth check to complete before deciding
  if (isLoading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    // Get initial session on mount
    authService.getSession().then((session) => {
      if (session?.user) {
        setUser(session.user as ReturnType<typeof useAuthStore.getState>['user'])
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    // Listen for auth state changes (login/logout)
    const { data: { subscription } } = authService.onAuthStateChange((session: unknown) => {
      const s = session as { user?: ReturnType<typeof useAuthStore.getState>['user'] } | null
      setUser(s?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

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
