import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, ConfirmDialog, IconButton, Input, Modal, Money, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useAuthStore, useToastStore } from '../../store'
import { accountsService, authService, transactionsService } from '../../services'
import { demo } from '../../demo'
import { getTheme, applyTheme, type Theme } from '../../lib/theme'
import { LANGUAGES, setLanguage } from '../../i18n'
import { currentLocale, formatMonth, getCurrentMonthRange } from '../../utils'
import { SettingRow, Segmented, ThemePicker } from './parts'
import { focusInvalid } from './helpers'

export function GeneralTab() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, isDemo } = useAuthStore()
  const { toast } = useToastStore()
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const lang = i18n.language?.startsWith('en') ? 'en' : 'pt'
  const name = isDemo ? t('profile.identity.demoName') : (user?.email?.split('@')[0] || '—')
  const since = user?.created_at ? formatMonth(user.created_at.slice(0, 7), 'long') : null

  const changeTheme = (next: Theme) => { applyTheme(next); setTheme(next) }

  const signOut = async () => {
    setSigningOut(true)
    try {
      await authService.signOut()
      navigate('/login', { replace: true })
    } catch {
      toast({ message: t('profile.data.signOutError'), variant: 'error' })
      setSigningOut(false)
    }
  }

  const restore = () => { demo.restart(); window.location.reload() }

  return (
    <div className="prf-general">
      {/* Cabeçalho de identidade: o cartão dominante da tela. O aviso de dados fictícios fica só na faixa
          do topo; aqui entram os fatos da conta, cada um levando à aba ou à tela que o detalha. */}
      <Card className="ft-card--hero prf-general__id">
        <div className="prf-identity">
          <span className="prf-avatar" aria-hidden>{name.charAt(0).toUpperCase()}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="prf-identity__name prf-truncate">{name}</div>
            {isDemo
              ? <div className="prf-identity__badge"><Badge variant="accent">{t('profile.identity.demoSub')}</Badge></div>
              : <div className="prf-identity__sub prf-truncate">{user?.email}</div>}
            {!isDemo && since && <div className="prf-identity__meta">{t('profile.identity.memberSince', { date: since })}</div>}
          </div>
        </div>
        <AccountFacts />
      </Card>

      <Card className="prf-general__prefs">
        <CardHeader title={t('profile.prefs.title')} subtitle={t('profile.prefs.subtitle')} />
        <div className="prf-settings">
          <div className="prf-setting prf-setting--stack">
            <div className="prf-setting__text">
              <div className="prf-setting__title">{t('profile.prefs.theme')}</div>
              <div className="prf-setting__desc">{t('profile.prefs.themeHint')}</div>
            </div>
            <ThemePicker label={t('profile.prefs.themeLabel')} value={theme} onChange={changeTheme} options={[
              { value: 'dark', label: t('profile.prefs.dark') },
              { value: 'light', label: t('profile.prefs.light') },
            ]} />
          </div>
          <SettingRow title={t('profile.prefs.language')} description={t('profile.prefs.languageHint')}>
            <Segmented label={t('profile.prefs.languageLabel')} value={lang} onChange={setLanguage}
              options={LANGUAGES.map(l => ({ value: l.code, label: <span lang={l.code === 'en' ? 'en' : 'pt-BR'}>{l.label}</span> }))} />
          </SettingRow>
        </div>
      </Card>

      <div className="prf-general__side">
        <Card>
          <CardHeader title={t('profile.security.title')} />
          <div className="prf-settings">
            <SettingRow title={t('profile.security.password')} description={isDemo ? t('profile.security.passwordDemo') : t('profile.security.passwordHint')}>
              <Button variant="secondary" icon="key" disabled={isDemo} onClick={() => setPasswordOpen(true)}>{t('profile.security.change')}</Button>
            </SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('profile.data.title')} />
          <div className="prf-settings">
            {isDemo && (
              <SettingRow title={t('profile.data.restore')} description={t('profile.data.restoreHint')}>
                <Button variant="secondary" icon="refresh" onClick={() => setRestoreOpen(true)}>{t('profile.data.restoreAction')}</Button>
              </SettingRow>
            )}
            <SettingRow title={isDemo ? t('profile.data.exitDemo') : t('profile.data.signOut')}
              description={isDemo ? t('profile.data.exitDemoHint') : t('profile.data.signOutHint')}>
              <Button variant="danger" icon="logout" loading={signingOut} onClick={signOut}>
                {isDemo ? t('profile.data.exitDemo') : t('profile.data.signOutAction')}
              </Button>
            </SettingRow>
          </div>
        </Card>
      </div>

      {!isDemo && passwordOpen && <PasswordModal onClose={() => setPasswordOpen(false)} />}

      <ConfirmDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} onConfirm={restore} danger={false}
        title={t('profile.data.restoreConfirmTitle')} message={t('profile.data.restoreConfirmText')} confirmLabel={t('profile.data.restoreAction')} />
    </div>
  )
}

// ── Fatos da conta: saldo nas contas e transações do mês, com link para o detalhe ──
function AccountFacts() {
  const { t } = useTranslation()
  const [facts, setFacts] = useState<{ accounts: number; balance: number; transactions: number } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([accountsService.list(), transactionsService.list({ ...getCurrentMonthRange(), page_size: 1 })])
      .then(([acc, tx]) => {
        if (!alive) return
        const list = acc.accounts || []
        setFacts({ accounts: list.length, balance: list.reduce((s, a) => s + a.balance, 0), transactions: tx.total ?? 0 })
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  // Sem os números, o cartão fica só com a identidade (não vale um erro aqui: cada aba tem o seu)
  if (failed) return null
  if (!facts) {
    return (
      <div className="prf-facts" aria-hidden>
        {[0, 1].map(i => (
          <span key={i} className="prf-fact prf-fact--skel"><Skeleton width={96} height={18} /><Skeleton width={120} height={12} /></span>
        ))}
      </div>
    )
  }
  const month = new Intl.DateTimeFormat(currentLocale(), { month: 'long' }).format(new Date())
  return (
    <nav className="prf-facts" aria-label={t('profile.identity.factsLabel')}>
      <Link to="/profile?tab=accounts" className="prf-fact">
        <Money value={facts.balance} className="prf-fact__value" />
        <span className="prf-fact__label">{t('profile.identity.balanceIn', { count: facts.accounts })}</span>
        <Icon name="chevronRight" size={16} className="prf-fact__chevron" />
      </Link>
      <Link to="/transactions" className="prf-fact">
        <span className="prf-fact__value ft-num">{facts.transactions}</span>
        <span className="prf-fact__label">{t('profile.identity.transactionsIn', { count: facts.transactions, month })}</span>
        <Icon name="chevronRight" size={16} className="prf-fact__chevron" />
      </Link>
    </nav>
  )
}

// ── Alterar senha (só fora da demonstração) ──
function PasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (password.length < 8) next.password = t('profile.security.tooShort')
    else if (password !== confirm) next.confirm = t('profile.security.mismatch')
    setErrors(next)
    if (next.password || next.confirm) { focusInvalid(e.currentTarget); return }
    setSaving(true)
    try {
      await authService.updatePassword(password)
      toast({ message: t('profile.security.done') })
      onClose()
    } catch {
      setErrors({ form: t('profile.security.error') })
      setSaving(false)
    }
  }

  const toggle = (
    <IconButton icon={visible ? 'eyeOff' : 'eye'} label={visible ? t('profile.security.hide') : t('profile.security.show')} onClick={() => setVisible(v => !v)} />
  )

  return (
    <Modal open onClose={onClose} title={t('profile.security.change')} description={t('profile.security.modalDescription')} width="26rem"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form="prf-password-form" loading={saving}>{t('profile.security.save')}</Button>
      </>}>
      <form id="prf-password-form" onSubmit={submit} className="prf-form" noValidate>
        <Input label={t('profile.security.newPassword')} type={visible ? 'text' : 'password'} autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} error={errors.password} hint={t('profile.security.newPasswordHint')} trailing={toggle} />
        <Input label={t('profile.security.confirm')} type={visible ? 'text' : 'password'} autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
        {errors.form && <p className="prf-form-error" role="alert">{errors.form}</p>}
      </form>
    </Modal>
  )
}
