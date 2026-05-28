import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

const styles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    fontFamily: 'var(--font)',
    fontWeight: '500',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid transparent',
    cursor: 'pointer',
    transition: 'all var(--transition)',
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  },
  sizes: {
    sm: { fontSize: 'var(--font-size-base)', padding: '0.375rem 0.75rem', height: '1.875rem' },
    md: { fontSize: 'var(--font-size-md)', padding: '0.5rem 1rem', height: '2.25rem' },
    lg: { fontSize: 'var(--font-size-lg)', padding: '0.625rem 1.25rem', height: '2.625rem' },
  },
  variants: {
    primary: {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: '#ffffff',
    },
    secondary: {
      background: 'transparent',
      borderColor: 'var(--border)',
      color: 'var(--text-secondary)',
    },
    ghost: {
      background: 'var(--accent-soft)',
      borderColor: 'transparent',
      color: 'var(--accent)',
    },
    danger: {
      background: 'transparent',
      borderColor: 'var(--red)',
      color: 'var(--red)',
    },
  },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      style={{
        ...styles.base,
        ...styles.sizes[size],
        ...styles.variants[variant],
        opacity: isDisabled ? 0.45 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <span style={{ display: 'inline-block', width: '0.875rem', height: '0.875rem', border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      ) : children}
    </button>
  )
}
