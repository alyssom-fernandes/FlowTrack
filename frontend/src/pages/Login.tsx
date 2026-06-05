import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authService } from '../services'
import { useAuthStore } from '../store'
import { Button, Input, AfnBrand } from '../components/ui'

type View = 'login' | 'forgot' | 'forgot_sent'

export function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setError(''); setLoading(true)
    try { await authService.signIn(email, password); navigate('/dashboard', { replace: true }) }
    catch { setError(t('login.wrongCredentials')) }
    finally { setLoading(false) }
  }

  const handleDemo = async () => {
    setError(''); setDemoLoading(true)
    try { await authService.signInDemo(); navigate('/dashboard', { replace: true }) }
    catch { setError(t('login.demoUnavailable')) }
    finally { setDemoLoading(false) }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) return
    setError(''); setLoading(true)
    try {
      await authService.sendPasswordReset(resetEmail)
      setView('forgot_sent')
    } catch {
      setError(t('login.resetSendError'))
    } finally {
      setLoading(false)
    }
  }

  const goToLogin = () => { setView('login'); setError(''); setResetEmail('') }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '22rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Logo + headline */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo.png" alt="FlowTrack" className="ft-logo" style={{ height: '1.75rem', width: 'auto' }} />
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)' }}>
            {view === 'login' ? t('login.tagline') : t('login.passwordReset')}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {view === 'login' && (
            <>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <Input label={t('login.email')} type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <Input label={t('login.password')} type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setResetEmail(email); setError('') }}
                    style={{ alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', padding: 0, textDecoration: 'underline dotted' }}
                  >
                    {t('login.forgotPassword')}
                  </button>
                </div>
                {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)', textAlign: 'center' }}>{error}</p>}
                <Button type="submit" loading={loading} style={{ width: '100%', marginTop: '0.25rem' }}>{t('login.signIn')}</Button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', letterSpacing: '0.05em' }}>ou</span>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Button variant="ghost" loading={demoLoading} onClick={handleDemo} style={{ width: '100%' }}>
                  {t('login.demoMode')}
                </Button>
                <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', letterSpacing: '0.02em' }}>
                  {t('login.demoHint')}
                </p>
              </div>
            </>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {t('login.resetEmailLabel')}
              </p>
              <Input
                label={t('login.email')}
                type="email"
                placeholder="seu@email.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
              {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={goToLogin} style={{ flex: 1 }}>{t('common.back')}</Button>
                <Button type="submit" loading={loading} style={{ flex: 1 }}>{t('login.sendLink')}</Button>
              </div>
            </form>
          )}

          {view === 'forgot_sent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="square">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t('login.resetSentTitle')} <strong style={{ color: 'var(--text-primary)' }}>{resetEmail}</strong>.<br />
                {t('login.resetSentBody')}
              </p>
              <Button variant="secondary" onClick={goToLogin} style={{ width: '100%' }}>{t('login.backToLogin')}</Button>
            </div>
          )}

          <div style={{ paddingTop: '0.75rem', borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
            <AfnBrand size="md" />
          </div>
        </div>

      </div>
    </div>
  )
}
