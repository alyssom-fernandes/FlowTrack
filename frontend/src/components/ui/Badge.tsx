import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'green' | 'red' | 'amber' | 'accent'
  size?: 'sm' | 'md'
}

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const colors = {
    default: { bg: 'var(--bg-card-hover)', color: 'var(--text-muted)' },
    green:   { bg: 'var(--green-soft)',    color: 'var(--green)' },
    red:     { bg: 'var(--red-soft)',      color: 'var(--red)' },
    amber:   { bg: 'var(--amber-soft)',    color: 'var(--amber)' },
    accent:  { bg: 'var(--accent-soft)',   color: 'var(--accent)' },
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '0.125rem 0.4rem' : '0.25rem 0.6rem',
        borderRadius: 'var(--radius-sm)',
        fontSize: size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
        fontWeight: '500',
        letterSpacing: '0.03em',
        background: colors[variant].bg,
        color: colors[variant].color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
