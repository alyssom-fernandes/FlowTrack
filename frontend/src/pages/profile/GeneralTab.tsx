import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, ConfirmDialog, IconButton, Input, Modal } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useAuthStore, useToastStore } from '../../store'
import { authService } from '../../services'
import { demo } from '../../demo'
import { getTheme, applyTheme, type Theme } from '../../lib/theme'
import { LANGUAGES, setLanguage } from '../../i18n'
import { formatMonth } from '../../utils'
import { SettingRow, Segmented } from './parts'
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
    <>
      <Card>
        <div className="prf-identity">
          <span className="prf-avatar" aria-hidden>{name.charAt(0).toUpperCase()}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="prf-identity__name prf-truncate">{name}</div>
            <div className="prf-identity__sub prf-truncate">{isDemo ? t('profile.identity.demoSub') : user?.email}</div>
            {!isDemo && since && <div className="prf-identity__meta">{t('profile.identity.memberSince', { date: since })}</div>}
          </div>
        </div>
        {isDemo && (
          <p className="prf-note">
            <Icon name="info" size={16} style={{ color: 'var(--text-hint)', marginTop: '0.125rem' }} />
            <span>{t('profile.identity.demoNote')}</span>
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title={t('profile.prefs.title')} subtitle={t('profile.prefs.subtitle')} />
        <div className="prf-settings">
          <SettingRow title={t('profile.prefs.theme')} description={t('profile.prefs.themeHint')}>
            <Segmented label={t('profile.prefs.themeLabel')} value={theme} onChange={changeTheme} options={[
              { value: 'dark', label: t('profile.prefs.dark'), icon: 'moon' },
              { value: 'light', label: t('profile.prefs.light'), icon: 'sun' },
            ]} />
          </SettingRow>
          <SettingRow title={t('profile.prefs.language')} description={t('profile.prefs.languageHint')}>
            <Segmented label={t('profile.prefs.languageLabel')} value={lang} onChange={setLanguage}
              options={LANGUAGES.map(l => ({ value: l.code, label: <span lang={l.code === 'en' ? 'en' : 'pt-BR'}>{l.label}</span> }))} />
          </SettingRow>
        </div>
      </Card>

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

      {!isDemo && passwordOpen && <PasswordModal onClose={() => setPasswordOpen(false)} />}

      <ConfirmDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} onConfirm={restore} danger={false}
        title={t('profile.data.restoreConfirmTitle')} message={t('profile.data.restoreConfirmText')} confirmLabel={t('profile.data.restoreAction')} />
    </>
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
