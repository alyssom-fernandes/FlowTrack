import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { authService } from './services/auth'
import { AppShell } from './components/layout/AppShell'
import { FullPageSpinner } from './components/ui/Spinner'

// Pages (lazy loaded)
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Investments } from './pages/Investments'
import { Goals } from './pages/Goals'
import { Reports } from './pages/Reports'
import { Profile } from './pages/Profile'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    // Get initial session
    authService.getSession().then((session) => {
      setUser(session?.user as ReturnType<typeof useAuthStore.getState>['user'])
      setLoading(false)
    })

    // Listen for auth changes
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
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppShell><Dashboard /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/transactions" element={
          <ProtectedRoute>
            <AppShell><Transactions /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/investments" element={
          <ProtectedRoute>
            <AppShell><Investments /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/goals" element={
          <ProtectedRoute>
            <AppShell><Goals /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <AppShell><Reports /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <AppShell><Profile /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
