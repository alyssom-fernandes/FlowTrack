import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authService, realAuthAvailable, supabase } from '../services'
import { Button, Spinner } from '../components/ui'
import { AuthLayout, Notice, PasswordInput, StatusHeading } from './login/AuthLayout'
import { authFailure, focusField, reachServer, withTimeout, type AuthFailure } from './login/helpers'

type Status = 'loading' | 'ready' | 'done' | 'invalid' | 'unavailable'
type FieldErrors = { password?: string; confirm?: string }

const MIN_LENGTH = 8

// O Supabase devolve o erro na própria URL quando o link venceu ou já foi usado
const linkHasError = () => /(^|[?&#])error(_code)?=/.test(window.location.search + window.location.hash)

export function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>(() => (!realAuthAvailable || !supabase ? 'unavailable' : linkHasError() ? 'invalid' : 'loading'))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const [saving, setSaving] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!supabase || status !== 'loading') return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready')
    })
    // O Supabase pode trocar o código antes do evento chegar: confere a sessão também
    supabase.auth.getSession()
      .then(({ data: { session } }) => setStatus(prev => (prev === 'loading' ? (session ? 'ready' : 'invalid') : prev)))
      .catch(() => setStatus(prev => (prev === 'loading' ? 'invalid' : prev)))
    const timeout = setTimeout(() => setStatus(prev => (prev === 'loading' ? 'invalid' : prev)), 8000)
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (status === 'done') headingRef.current?.focus() }, [status])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errors: FieldErrors = {}
    if (!password) errors.password = t('login.reset.passwordRequired')
    else if (password.length < MIN_LENGTH) errors.password = t('login.reset.tooShort', { min: MIN_LENGTH })
    if (!errors.password && confirm !== password) errors.confirm = t('login.reset.mismatch')
    setFieldErrors(errors); setFailure(null)
    if (errors.password || errors.confirm) { focusField(errors.password ? 'ent-new-password' : 'ent-confirm-password'); return }
    setSaving(true)
    try {
      await withTimeout(reachServer().then(() => authService.updatePassword(password)))
      setStatus('done')
    } catch (err) {
      setFailure(authFailure(err))
    } finally {
      setSaving(false)
    }
  }

  const openDemo = async () => {
    setDemoLoading(true)
    try { await authService.signInDemo(); navigate('/dashboard', { replace: true }) }
    catch { setDemoLoading(false) }
  }

  const failureMessage = (f: AuthFailure) =>
    f === 'network' || f === 'samePassword' || f === 'weakPassword' ? t(`login.reset.errors.${f}`) : t('login.reset.errors.unknown')

  return (
    <AuthLayout compact>
      {status === 'loading' && (
        <div className="ent-checking" role="status">
          <Spinner size={18} />
          <span>{t('login.reset.checking')}</span>
        </div>
      )}

      {status === 'unavailable' && (
        <div className="ent-stack">
          <StatusHeading icon="lock">{t('login.reset.unavailableTitle')}</StatusHeading>
          <p className="ent-sub">{t('login.reset.unavailableText')}</p>
          <div className="ent-actions">
            <Button size="lg" block iconRight="arrowRight" loading={demoLoading} onClick={openDemo}>{t('login.demo.cta')}</Button>
            <Button block variant="ghost" onClick={() => navigate('/login')}>{t('login.backToLogin')}</Button>
          </div>
        </div>
      )}

      {status === 'invalid' && (
        <div className="ent-stack">
          <StatusHeading icon="alertCircle" tone="amber">{t('login.reset.invalidTitle')}</StatusHeading>
          <p className="ent-sub">{t('login.reset.invalidText')}</p>
          <div className="ent-actions">
            <Button size="lg" block onClick={() => navigate('/login', { state: { view: 'forgot' } })}>{t('login.reset.requestNew')}</Button>
            <Button block variant="ghost" onClick={() => navigate('/login')}>{t('login.backToLogin')}</Button>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <form className="ent-stack" onSubmit={handleSubmit} noValidate>
          <h2 className="ent-heading">{t('login.reset.title')}</h2>
          <p className="ent-sub">{t('login.reset.text', { min: MIN_LENGTH })}</p>
          <PasswordInput id="ent-new-password" label={t('login.reset.newPassword')} autoComplete="new-password" value={password} error={fieldErrors.password}
            hint={t('login.reset.hint', { min: MIN_LENGTH })}
            onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })) }} />
          <PasswordInput id="ent-confirm-password" label={t('login.reset.confirm')} autoComplete="new-password" value={confirm} error={fieldErrors.confirm}
            onChange={e => { setConfirm(e.target.value); setFieldErrors(f => ({ ...f, confirm: undefined })) }} />
          {failure && <Notice tone={failure === 'network' ? 'amber' : 'red'} icon="alertCircle">{failureMessage(failure)}</Notice>}
          <Button type="submit" size="lg" block loading={saving} style={{ marginTop: '0.25rem' }}>{t('login.reset.submit')}</Button>
        </form>
      )}

      {status === 'done' && (
        <div className="ent-stack">
          <StatusHeading icon="checkCircle" tone="green" ref={headingRef}>{t('login.reset.doneTitle')}</StatusHeading>
          <p className="ent-sub">{t('login.reset.doneText')}</p>
          <div className="ent-actions">
            <Button size="lg" block iconRight="arrowRight" onClick={() => navigate('/dashboard', { replace: true })}>{t('login.reset.continue')}</Button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
