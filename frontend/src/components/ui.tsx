import { useEffect, useId, useLayoutEffect, useRef, useState, Component, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type HTMLAttributes, type ReactNode, type CSSProperties } from 'react'
import i18n from '../i18n'
import { useToastStore } from '../store'
import { Icon, type IconName } from './icons'
import { currentLocale, formatCurrency, formatCurrencyCompact } from '../utils'
import './ui.css'

const t = (key: string, fallback: string) => (i18n.exists(key) ? i18n.t(key) : fallback)

// ── Button ────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'dangerSolid'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: IconName
  iconRight?: IconName
  block?: boolean
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon, iconRight, block, disabled, children, className = '', type = 'button', ...props }: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`ft-btn ft-btn--${variant} ft-btn--${size}${block ? ' ft-btn--block' : ''}${!children ? ' ft-btn--icon' : ''} ${className}`} {...props}>
      {loading ? <span className="ft-btn__spinner" /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  )
}

// Botão só com ícone: o rótulo vira aria-label e dica
export function IconButton({ icon, label, size = 'sm', variant = 'ghost', ...props }: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  return <Button icon={icon} size={size} variant={variant} aria-label={label} title={label} {...props} />
}

// ── Card ──────────────────────────────────────────────────
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  accent?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ children, hover = false, accent = false, padding = 'md', className = '', ...props }: CardProps) {
  return (
    <div className={`ft-card ft-card--pad-${padding}${hover ? ' ft-card--hover' : ''}${accent ? ' ft-card--accent' : ''} ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="ft-card-header">
      <div style={{ minWidth: 0 }}>
        <div className="ft-card-header__title">{icon && <Icon name={icon} size={16} style={{ color: 'var(--text-hint)' }} />}{title}</div>
        {subtitle && <div className="ft-card-header__subtitle">{subtitle}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────
export function Page({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`ft-page ${className}`} style={style}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ft-page-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="ft-page-title">{title}</h1>
        {subtitle && <p className="ft-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ft-page-header__actions">{actions}</div>}
    </header>
  )
}

export function SectionLabel({ children, action, style }: { children: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return <div className="ft-section-label" style={style}><span>{children}</span>{action}</div>
}

// ── Campos ────────────────────────────────────────────────
interface FieldProps { label?: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; htmlFor?: string; children: ReactNode; style?: CSSProperties }

export function Field({ label, hint, error, optional, htmlFor, children, style }: FieldProps) {
  return (
    <div className="ft-field" style={style}>
      {label && <label htmlFor={htmlFor} className="ft-field__label"><span>{label}{optional && <span className="ft-field__optional"> · {t('common.optionalShort', 'opcional')}</span>}</span></label>}
      {children}
      {error ? <span className="ft-field__error" role="alert">{error}</span> : hint ? <span className="ft-field__hint">{hint}</span> : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  optional?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

export function Input({ label, error, hint, optional, leading, trailing, id, className = '', style, ...props }: InputProps) {
  const auto = useId()
  const inputId = id || auto
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={inputId}>
      <div className="ft-control-wrap">
        {leading && <span className="ft-control-wrap__lead">{leading}</span>}
        <input id={inputId} aria-invalid={!!error || undefined}
          className={`ft-input${leading ? ' ft-input--lead' : ''}${trailing ? ' ft-input--trail' : ''} ${className}`} style={style} {...props} />
        {trailing && <span className="ft-control-wrap__trail">{trailing}</span>}
      </div>
    </Field>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: ReactNode; error?: string; hint?: ReactNode; optional?: boolean }

export function Select({ label, error, hint, optional, id, className = '', children, ...props }: SelectProps) {
  const auto = useId()
  const selectId = id || auto
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={selectId}>
      <select id={selectId} aria-invalid={!!error || undefined} className={`ft-select ${className}`} {...props}>{children}</select>
    </Field>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: ReactNode; error?: string; hint?: ReactNode; optional?: boolean }

export function Textarea({ label, error, hint, optional, id, className = '', ...props }: TextareaProps) {
  const auto = useId()
  const areaId = id || auto
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={areaId}>
      <textarea id={areaId} aria-invalid={!!error || undefined} className={`ft-textarea ${className}`} {...props} />
    </Field>
  )
}

// ── Modal ─────────────────────────────────────────────────
// No celular vira uma folha que sobe de baixo (ver tokens.css).
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, description, children, footer, width = '28rem' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Foco no primeiro campo (ou no próprio modal)
    requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not(:disabled), select, textarea') || ref.current
      if (target && window.matchMedia('(min-width: 600px)').matches) target.focus({ preventScroll: true })
      else ref.current?.focus({ preventScroll: true })
    })
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = overflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return (
    <div className="ft-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className="ft-modal" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} style={{ maxWidth: width }}>
        {title && (
          <div className="ft-modal__header">
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} className="ft-modal__title">{title}</h2>
              {description && <p className="ft-modal__description">{description}</p>}
            </div>
            <IconButton icon="close" label={t('common.close', 'Fechar')} onClick={onClose} style={{ marginRight: '-0.375rem', marginTop: '-0.25rem' }} />
          </div>
        )}
        <div className="ft-modal__body">{children}</div>
        {footer && <div className="ft-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}

// Confirmação (excluir, desfazer…)
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, cancelLabel, danger = true, loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; message?: ReactNode
  confirmLabel?: string; cancelLabel?: string; danger?: boolean; loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="24rem"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel || t('common.cancel', 'Cancelar')}</Button>
        <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel || t('common.confirm', 'Confirmar')}</Button>
      </>}>
      {message && <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{message}</p>}
    </Modal>
  )
}

// ── Badge ─────────────────────────────────────────────────
type Tone = 'default' | 'green' | 'red' | 'amber' | 'accent' | 'blue'
const TONES: Record<Tone, { bg: string; color: string }> = {
  default: { bg: 'var(--bg-subtle)',  color: 'var(--text-muted)' },
  green:   { bg: 'var(--green-soft)', color: 'var(--green)' },
  red:     { bg: 'var(--red-soft)',   color: 'var(--red)' },
  amber:   { bg: 'var(--amber-soft)', color: 'var(--amber)' },
  accent:  { bg: 'var(--accent-soft)', color: 'var(--accent-text)' },
  blue:    { bg: 'var(--blue-soft)',  color: 'var(--blue)' },
}

export function Badge({ children, variant = 'default', size = 'sm', dot, icon, style }: { children: ReactNode; variant?: Tone; size?: 'sm' | 'md'; dot?: boolean; icon?: IconName; style?: CSSProperties }) {
  const c = TONES[variant]
  return (
    <span className={`ft-badge ft-badge--${size}`} style={{ background: c.bg, color: c.color, ...style }}>
      {dot && <span className="ft-badge__dot" />}
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 13} />}
      {children}
    </span>
  )
}

// ── Abas ──────────────────────────────────────────────────
export interface TabItem<T extends string> { value: T; label: ReactNode; count?: number; icon?: IconName }

export function Tabs<T extends string>({ items, value, onChange, block, label }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; block?: boolean; label?: string }) {
  // Setas, Home e End trocam de aba (padrão de abas acessíveis)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex(i => i.value === value)
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    requestAnimationFrame(() => (e.currentTarget?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus())
  }
  // Indicador que desliza até a aba escolhida (mede a aba ativa; acompanha mudanças de tamanho)
  const listRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      setThumb(el ? { x: el.offsetLeft, w: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    return () => ro.disconnect()
  }, [value, items.length])
  return (
    <div ref={listRef} role="tablist" aria-label={label} className={`ft-tabs${block ? ' ft-tabs--block' : ''}`} onKeyDown={onKeyDown}>
      {thumb && <span className="ft-tabs__thumb" aria-hidden style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {items.map(item => (
        <button key={item.value} type="button" role="tab" aria-selected={item.value === value} tabIndex={item.value === value ? 0 : -1} className="ft-tab" onClick={() => onChange(item.value)}>
          {item.icon && <Icon name={item.icon} size={14} />}
          {item.label}
          {item.count !== undefined && <span className="ft-tab__count">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────
export function EmptyState({ icon = 'inbox', title, description, action, compact }: { icon?: IconName; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`ft-empty${compact ? ' ft-empty--compact' : ''}`}>
      <div className="ft-empty__icon"><Icon name={icon} size={20} /></div>
      <div className="ft-empty__title">{title}</div>
      {description && <p className="ft-empty__text">{description}</p>}
      {action && <div className="ft-empty__action">{action}</div>}
    </div>
  )
}

// ── Progresso ─────────────────────────────────────────────
// tone "spending": verde até 80%, âmbar até 100%, vermelho acima
export function ProgressBar({ value, tone = 'accent', height = 6, label, pace, color: forced }: { value: number; tone?: 'spending' | 'accent' | 'green' | 'neutral'; height?: number; label?: string; pace?: number; color?: string }) {
  // Vermelho só depois de passar do limite (em 100% exato ainda é "no limite")
  const color = tone === 'spending'
    ? value > 100 ? 'var(--red)' : value >= 80 ? 'var(--amber-fill)' : 'var(--green)'
    : tone === 'green' ? 'var(--green)' : tone === 'neutral' ? 'var(--chart-neutral)' : 'var(--accent-text)'
  return (
    <div className="ft-progress" style={{ height }} role="progressbar" aria-valuenow={Math.min(100, Math.max(0, Math.round(value)))} aria-valuetext={`${Math.round(value)}%`} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="ft-progress__bar" style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: forced ?? color }} />
      {pace !== undefined && <span className="ft-progress__pace" style={{ left: `${Math.max(0, Math.min(pace, 100))}%` }} />}
    </div>
  )
}

// ── Valores em dinheiro ───────────────────────────────────
// tone "auto": verde para entradas, vermelho para saídas
export function Money({ value, signed, compact, tone = 'none', size = 'row', style, className = '' }: { value: number; signed?: boolean; compact?: boolean; tone?: 'auto' | 'none'; size?: 'row' | 'kpi' | 'hero'; style?: CSSProperties; className?: string }) {
  const color = tone === 'auto' ? (value > 0 ? 'var(--green)' : value < 0 ? 'var(--red)' : 'var(--text-muted)') : undefined
  if (compact) {
    const text = formatCurrencyCompact(value)
    return <span className={`ft-money ft-num ${className}`} style={{ color, whiteSpace: 'nowrap', ...style }} title={formatCurrency(value)}>{text}</span>
  }
  // "R$ 2.223" + ",77": os centavos ficam menores (no destaque, elevados)
  const parts = new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'BRL', signDisplay: signed ? 'exceptZero' : 'auto', minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(value)
  const cut = parts.findIndex(p => p.type === 'decimal')
  const main = (cut === -1 ? parts : parts.slice(0, cut)).map(p => p.value).join('')
  const cents = cut === -1 ? '' : parts.slice(cut).map(p => p.value).join('')
  return (
    <span className={`ft-money ft-money--${size} ft-num ${className}`} style={{ color, whiteSpace: 'nowrap', ...style }}>
      {main}<span className="ft-money__cents">{cents}</span>
    </span>
  )
}

// ── Carregamento ──────────────────────────────────────────
export function Spinner({ size = 20, color = 'var(--accent-text)' }: { size?: number; color?: string }) {
  return (
    <span role="status" aria-busy="true" aria-label={t('common.loading', 'Carregando')} style={{ display: 'inline-block', width: size, height: size, border: '2px solid var(--border)', borderTopColor: color, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
  )
}

export function Skeleton({ width = '100%', height = 14, radius, style }: { width?: number | string; height?: number | string; radius?: string; style?: CSSProperties }) {
  return <span className="ft-skeleton" aria-hidden style={{ display: 'block', width, height, borderRadius: radius, ...style }} />
}

export function FullPageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Spinner size={28} />
    </div>
  )
}

export function PageLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50dvh' }}>
      <Spinner size={24} />
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────
export function ToastContainer() {
  const { toasts, dismiss } = useToastStore()
  if (!toasts.length) return null
  const look: Record<string, { color: string; icon: IconName }> = {
    success: { color: 'var(--green)', icon: 'checkCircle' },
    error:   { color: 'var(--red)',   icon: 'alertCircle' },
    info:    { color: 'var(--blue)',  icon: 'info' },
  }
  return (
    <div className="ft-toasts" role="status" aria-live="polite">
      {toasts.map(item => {
        const l = look[item.variant] ?? look.info
        return (
          <div key={item.id} className="ft-toast" onClick={() => dismiss(item.id)}>
            <Icon name={l.icon} size={18} style={{ color: l.color }} />
            <span style={{ flex: 1 }}>{item.message}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Error Boundary ────────────────────────────────────────
interface EBState { hasError: boolean }
export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    (window as unknown as { __anotarErro?: (tipo: string, msg: string) => void }).__anotarErro?.('react', error.stack || error.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg)', padding: '1.5rem' }}>
          <div style={{ maxWidth: '24rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div className="ft-empty__icon" style={{ color: 'var(--red)' }}><Icon name="alertCircle" size={20} /></div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>{t('common.crashTitle', 'Algo saiu do lugar')}</h1>
            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('common.crashText', 'A tela encontrou um erro inesperado. Recarregar costuma resolver; seus dados não foram perdidos.')}</p>
            <Button icon="refresh" onClick={() => window.location.reload()} style={{ marginTop: '0.5rem' }}>{t('common.reload', 'Recarregar')}</Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Marca AFN SYSTEMS (guia de marca) ─────────────────────
// size "login": AFN/SYSTEMS 13px e "by" 8px · size "sm": 10px, sem "by"
export function AfnBrand({ showBy = true, size = 'login' }: { showBy?: boolean; size?: 'login' | 'sm' | 'md' }) {
  const fs = size === 'sm' ? '10px' : '13px'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span className="pf-afn" style={{ fontSize: fs }}>AFN</span>
        <span className="pf-gap" />
        <span className="pf-sys" style={{ fontSize: fs }}>SYSTEMS</span>
      </div>
      {showBy && <span className="pf-by" style={{ fontSize: '8px' }}>by Alyssom Fernandes</span>}
    </div>
  )
}

// Logo FlowTrack com versão própria para o tema claro
export function Logo({ height = 28 }: { height?: number }) {
  return (
    <span style={{ display: 'inline-flex' }}>
      <img src="/logo.png" alt="FlowTrack" className="ft-logo-escuro" style={{ height, width: 'auto' }} />
      <img src="/logo-claro.png" alt="FlowTrack" className="ft-logo-claro" style={{ height, width: 'auto' }} />
    </span>
  )
}
