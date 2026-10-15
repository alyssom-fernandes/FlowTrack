import { useState, type ComponentProps, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { AfnBrand, IconButton, Input, Logo } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { getTheme, applyTheme, type Theme } from '../../lib/theme'
import { LANGUAGES, setLanguage } from '../../i18n'
import { ProductPreview } from './ProductPreview'
import './login.css'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Tela dividida: apresentação do produto à esquerda, ações à direita.
// No celular vira uma coluna; a prévia da coluna da esquerda some lá (a Entrada a repete
// logo abaixo do botão da demonstração) e "compact" esconde também o texto de apresentação.
export function AuthLayout({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  useDocumentTitle()
  const { t } = useTranslation()
  return (
    <main className={`ent${compact ? ' ent--compact' : ''}`}>
      <div className="ent-brand">
        <div className="ent-logo"><Logo height={26} /></div>
        <div className="ent-hero">
          <h1 className="ent-title">{t('login.hero.title')} <span>{t('login.hero.titleMuted')}</span></h1>
          <p className="ent-lead">{t('login.hero.text')}</p>
        </div>
        <div className="ent-preview"><ProductPreview /></div>
      </div>
      <div className="ent-side">
        <div className="ent-bar"><Preferences /></div>
        <div className="ent-content">{children}</div>
        <footer className="ent-foot"><AfnBrand /></footer>
      </div>
    </main>
  )
}

function Preferences() {
  const { t, i18n } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getTheme)
  const lang = i18n.language?.startsWith('en') ? 'en' : 'pt'
  const next: Theme = theme === 'light' ? 'dark' : 'light'
  return (
    <div className="ent-prefs">
      <div className="ent-lang" role="group" aria-label={t('login.prefs.language')}>
        {LANGUAGES.map(l => (
          <button key={l.code} type="button" className="ent-lang__opt" aria-pressed={lang === l.code}
            aria-label={l.label} title={l.label} lang={l.code === 'en' ? 'en' : 'pt-BR'} onClick={() => setLanguage(l.code)}>
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>
      <IconButton icon={next === 'light' ? 'sun' : 'moon'} size="md" label={t(next === 'light' ? 'login.prefs.light' : 'login.prefs.dark')}
        onClick={() => { applyTheme(next); setTheme(next) }} />
    </div>
  )
}

export function Notice({ tone = 'neutral', icon = 'info', children }: { tone?: 'neutral' | 'red' | 'amber'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`ent-notice${tone !== 'neutral' ? ` ent-notice--${tone}` : ''}`} role={tone === 'neutral' ? 'note' : 'alert'}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  )
}

// Título de um estado (link enviado, link inválido, senha salva): ícone pequeno na linha do título,
// sem quadrado em volta, na cor do estado (âmbar no link vencido, verde no concluído, neutro no resto)
export function StatusHeading({ icon, tone, children, ref }: { icon: IconName; tone?: 'green' | 'amber'; children: ReactNode; ref?: Ref<HTMLHeadingElement> }) {
  return (
    <h2 className={`ent-heading ent-status${tone ? ` ent-status--${tone}` : ''}`} ref={ref} tabIndex={-1}>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </h2>
  )
}

// Campo de senha com botão de mostrar/ocultar
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type' | 'trailing'>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <Input {...props} type={visible ? 'text' : 'password'} autoCapitalize="none" spellCheck={false}
      trailing={
        <button type="button" className="ent-eye" onClick={() => setVisible(v => !v)}
          aria-label={t(visible ? 'login.form.hidePassword' : 'login.form.showPassword')} title={t(visible ? 'login.form.hidePassword' : 'login.form.showPassword')}>
          <Icon name={visible ? 'eyeOff' : 'eye'} size={16} />
        </button>
      } />
  )
}
