import { useState, type InputHTMLAttributes } from 'react'

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
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-muted)',
            fontWeight: '500',
            letterSpacing: '0.03em',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          width: '100%',
          background: 'var(--bg-input)',
          border: `0.5px solid ${error ? 'var(--red)' : focused ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 0.75rem',
          fontSize: 'var(--font-size-md)',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color var(--transition)',
          boxShadow: focused ? `0 0 0 3px var(--accent-soft)` : 'none',
          fontFamily: 'var(--font)',
          ...style,
        }}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        {...props}
      />
      {error && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</span>
      )}
      {hint && !error && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-hint)' }}>{hint}</span>
      )}
    </div>
  )
}
