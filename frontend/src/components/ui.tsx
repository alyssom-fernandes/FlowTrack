import { useState, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

// ── Button ────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, style, ...props }: ButtonProps) {
  const sizes = {
    sm: { fontSize: 'var(--font-size-base)', padding: '0.375rem 0.75rem', height: '1.875rem' },
    md: { fontSize: 'var(--font-size-md)',   padding: '0.5rem 1rem',      height: '2.25rem' },
    lg: { fontSize: 'var(--font-size-lg)',   padding: '0.625rem 1.25rem', height: '2.625rem' },
  }
  const variants = {
    primary:   { background: 'var(--accent)',      borderColor: 'var(--accent)',  color: '#fff' },
    secondary: { background: 'transparent',        borderColor: 'var(--border)',  color: 'var(--text-secondary)' },
    ghost:     { background: 'var(--accent-soft)', borderColor: 'transparent',    color: 'var(--accent)' },
    danger:    { background: 'transparent',        borderColor: 'var(--red)',     color: 'var(--red)' },
  }
  const isDisabled = disabled || loading
  return (
    <button disabled={isDisabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
      fontFamily: 'var(--font)', fontWeight: '500', borderRadius: 'var(--radius-md)',
      border: '0.5px solid transparent', cursor: isDisabled ? 'not-allowed' : 'pointer',
      transition: 'all var(--transition)', whiteSpace: 'nowrap', userSelect: 'none',
      opacity: isDisabled ? 0.45 : 1,
      ...sizes[size], ...variants[variant], ...style,
    }} {...props}>
      {loading
        ? <span style={{ display: 'inline-block', width: '0.875rem', height: '0.875rem', border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        : children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────────
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  accent?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({ children, hover = false, accent = false, padding = 'md', style, ...props }: CardProps) {
  const pads = { sm: '0.75rem', md: '1rem', lg: '1.5rem' }
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `0.5px solid ${accent ? 'rgba(157,36,73,0.3)' : 'var(--border)'}`,
        borderLeft: accent ? '2px solid var(--accent)' : undefined,
        borderRadius: 'var(--radius-lg)', padding: pads[padding],
        transition: hover ? 'transform var(--transition), box-shadow var(--transition), background var(--transition)' : undefined,
        cursor: hover ? 'pointer' : undefined, ...style,
      }}
      onMouseEnter={hover ? (e) => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 0 0 1px var(--accent)'; el.style.background = 'var(--bg-card-hover)' } : undefined}
      onMouseLeave={hover ? (e) => { const el = e.currentTarget; el.style.transform = ''; el.style.boxShadow = ''; el.style.background = 'var(--bg-card)' } : undefined}
      {...props}
    >{children}</div>
  )
}

// ── Input ─────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, style, id, ...props }: InputProps) {
  const [focused, setFocused] = useState(false)
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {label && <label htmlFor={inputId} style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)', fontWeight: '500', letterSpacing: '0.03em' }}>{label}</label>}
      <input id={inputId}
        style={{
          width: '100%', background: 'var(--bg-input)',
          border: `0.5px solid ${error ? 'var(--red)' : focused ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem',
          fontSize: 'var(--font-size-md)', color: 'var(--text-primary)', outline: 'none',
          transition: 'border-color var(--transition)',
          boxShadow: focused ? '0 0 0 3px var(--accent-soft)' : 'none',
          fontFamily: 'var(--font)', ...style,
        }}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        {...props}
      />
      {error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>{hint}</span>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, width = '28rem' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: width, maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '0.5px solid var(--border)' }}>
            <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>{title}</span>
            <button onClick={onClose} style={{ width: '1.75rem', height: '1.75rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', fontSize: '1.125rem', transition: 'color var(--transition)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>✕</button>
          </div>
        )}
        <div style={{ padding: '1.25rem' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────
interface BadgeProps { children: ReactNode; variant?: 'default' | 'green' | 'red' | 'amber' | 'accent'; size?: 'sm' | 'md' }

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const colors = {
    default: { bg: 'var(--bg-card-hover)', color: 'var(--text-muted)' },
    green:   { bg: 'var(--green-soft)',    color: 'var(--green)' },
    red:     { bg: 'var(--red-soft)',      color: 'var(--red)' },
    amber:   { bg: 'var(--amber-soft)',    color: 'var(--amber)' },
    accent:  { bg: 'var(--accent-soft)',   color: 'var(--accent)' },
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: size === 'sm' ? '0.125rem 0.4rem' : '0.25rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)', fontWeight: '500', letterSpacing: '0.03em', whiteSpace: 'nowrap', background: colors[variant].bg, color: colors[variant].color }}>
      {children}
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────
export function Spinner({ size = 20, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: '2px solid var(--border)', borderTopColor: color, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
  )
}

export function FullPageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Spinner size={32} />
    </div>
  )
}

// ── AFN Brand ─────────────────────────────────────────────
export function AfnBrand({ showBy = true, size = 'sm' }: { showBy?: boolean; size?: 'sm' | 'md' }) {
  const fontSize = size === 'md' ? '0.8125rem' : '0.625rem'
  const bySize   = size === 'md' ? '0.5625rem' : '0.4375rem'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1875rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize, letterSpacing: '2px', color: 'var(--brand-afn)' }}>AFN</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize, letterSpacing: '2px', color: 'var(--brand-secondary)' }}>SYSTEMS</span>
      </div>
      {showBy && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: bySize, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--brand-by)', fontWeight: '700' }}>by Alyssom Fernandes</span>}
    </div>
  )
}
