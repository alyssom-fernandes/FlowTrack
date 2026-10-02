import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { authService, realAuthAvailable } from '../services'
import { useAuthStore } from '../store'
import { Button, Input } from '../components/ui'
import { Icon } from '../components/icons'
import { AuthLayout, Notice, PasswordInput, StatusIcon } from './login/AuthLayout'
import { authFailure, focusField, isEmail, reachServer, withTimeout, type AuthFailure } from './login/helpers'

type View = 'login' | 'forgot' | 'sent'
type FieldErrors = { email?: string; password?: string }

export function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const askedForgot = (location.state as { view?: string } | null)?.view === 'forgot' && realAuthAvailable
  const [view, setView] = useState<View>(askedForgot ? 'forgot' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownView = useRef<View>('login')

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  // O pedido de "novo link" vem no estado da navegação: limpa para não reabrir ao recarregar
  useEffect(() => { if (location.state) navigate(location.pathname, { replace: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao trocar de etapa, o foco vai para o título dela (ou para o e-mail, na volta)
  useEffect(() => {
    if (shownView.current === view) return
    shownView.current = view
    if (view === 'login') document.getElementById('ent-email')?.focus()
    else headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [view])

  const goTo = (next: View) => { setFailure(null); setFieldErrors({}); setView(next) }

  const handleDemo = async () => {
    setDemoError(false); setDemoLoading(true)
    try { await authService.signInDemo(); navigate('/dashboard', { replace: true }) }
    catch { setDemoError(true); setDemoLoading(false) }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = t('login.form.emailRequired')
    else if (!isEmail(email)) errors.email = t('login.form.emailInvalid')
    if (!password) errors.password = t('login.form.passwordRequired')
    setFieldErrors(errors); setFailure(null)
    if (errors.email || errors.password) { focusField(errors.email ? 'ent-email' : 'ent-password'); return }
    setLoading(true)
    try {
      await withTimeout(reachServer().then(() => authService.signIn(email.trim(), password)))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setFailure(authFailure(err))
      setLoading(false)
    }
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    const error = !email.trim() ? t('login.form.emailRequired') : !isEmail(email) ? t('login.form.emailInvalid') : undefined
    setFieldErrors({ email: error }); setFailure(null)
    if (error) { focusField('ent-forgot-email'); return }
    setLoading(true)
    try {
      await withTimeout(reachServer().then(() => authService.sendPasswordReset(email.trim())))
      setView('sent')
    } catch (err) {
      setFailure(authFailure(err))
    } finally {
      setLoading(false)
    }
  }

  const loginMessage = (f: AuthFailure) =>
    f === 'credentials' || f === 'network' || f === 'unconfirmed' || f === 'rate' ? t(`login.errors.${f}`) : t('login.errors.unknown')
  const forgotMessage = (f: AuthFailure) =>
    f === 'network' || f === 'rate' ? t(`login.forgot.errors.${f}`) : t('login.forgot.errors.unknown')

  if (view === 'forgot') {
    return (
      <AuthLayout compact>
        <form className="ent-stack" onSubmit={handleForgot} noValidate>
          <button type="button" className="ent-link ent-back" onClick={() => goTo('login')}>
            <Icon name="arrowLeft" size={14} />{t('login.backToLogin')}
          </button>
          <h2 className="ent-heading" ref={headingRef} tabIndex={-1}>{t('login.forgot.title')}</h2>
          <p className="ent-sub">{t('login.forgot.text')}</p>
          <Input id="ent-forgot-email" label={t('login.form.email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            placeholder={t('login.form.emailPlaceholder')} value={email} error={fieldErrors.email}
            onChange={e => { setEmail(e.target.value); setFieldErrors({}) }} />
          {failure && <Notice tone={failure === 'network' ? 'amber' : 'red'} icon="alertCircle">{forgotMessage(failure)}</Notice>}
          <Button type="submit" size="lg" block loading={loading}>{t('login.forgot.submit')}</Button>
        </form>
      </AuthLayout>
    )
  }

  if (view === 'sent') {
    return (
      <AuthLayout compact>
        <div className="ent-stack">
          <StatusIcon icon="mail" tone="accent" />
          <h2 className="ent-heading" ref={headingRef} tabIndex={-1}>{t('login.sent.title')}</h2>
          <p className="ent-sub">
            <Trans i18nKey="login.sent.text" values={{ email: email.trim() }} components={{ b: <span className="ent-email" /> }} />
          </p>
          <p className="ent-sub">{t('login.sent.spam')}</p>
          <div className="ent-actions">
            <Button size="lg" block variant="secondary" onClick={() => goTo('login')}>{t('login.backToLogin')}</Button>
            <Button block variant="ghost" onClick={() => goTo('forgot')}>{t('login.sent.again')}</Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="ent-stack">
        <div className="ent-intro">
          <h2 className="ent-heading">{t('login.demo.title')}</h2>
          <p className="ent-sub">{t('login.demo.text')}</p>
        </div>
        <Button size="lg" block iconRight="arrowRight" loading={demoLoading} onClick={handleDemo}>{t('login.demo.cta')}</Button>
        <p className="ent-hint">{t('login.demo.hint')}</p>
        {demoError && <Notice tone="red" icon="alertCircle">{t('login.demo.error')}</Notice>}

        {realAuthAvailable ? (
          <>
            <div className="ent-divider" id="ent-login-label">{t('login.divider')}</div>
            <form className="ent-form" onSubmit={handleLogin} noValidate aria-labelledby="ent-login-label">
              <Input id="ent-email" label={t('login.form.email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                placeholder={t('login.form.emailPlaceholder')} value={email} error={fieldErrors.email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: undefined })) }} />
              <div className="ent-field">
                <div className="ent-field__head">
                  <label htmlFor="ent-password" className="ft-field__label">{t('login.form.password')}</label>
                  <button type="button" className="ent-link" onClick={() => goTo('forgot')}>{t('login.form.forgot')}</button>
                </div>
                <PasswordInput id="ent-password" autoComplete="current-password" value={password} error={fieldErrors.password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })) }} />
              </div>
              {failure && (
                <Notice tone={failure === 'network' ? 'amber' : 'red'} icon="alertCircle">{loginMessage(failure)}</Notice>
              )}
              <Button type="submit" size="lg" block variant="secondary" loading={loading} style={{ marginTop: '0.25rem' }}>
                {t('login.form.submit')}
              </Button>
            </form>
          </>
        ) : (
          <Notice>
            <strong>{t('login.unavailable.title')}</strong> {t('login.unavailable.text')}
          </Notice>
        )}
      </div>
    </AuthLayout>
  )
}
