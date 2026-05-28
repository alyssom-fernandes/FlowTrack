import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  accent?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({
  children,
  hover = false,
  accent = false,
  padding = 'md',
  style,
  ...props
}: CardProps) {
  const paddings = {
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `0.5px solid ${accent ? 'rgba(157,36,73,0.3)' : 'var(--border)'}`,
        borderLeft: accent ? '2px solid var(--accent)' : undefined,
        borderRadius: 'var(--radius-lg)',
        padding: paddings[padding],
        transition: hover ? 'transform var(--transition), border-color var(--transition), background var(--transition)' : undefined,
        cursor: hover ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        const el = e.currentTarget
        el.style.transform = 'translateY(-2px)'
        el.style.borderColor = 'var(--accent)'
        el.style.background = 'var(--bg-card-hover)'
      } : undefined}
      onMouseLeave={hover ? (e) => {
        const el = e.currentTarget
        el.style.transform = ''
        el.style.borderColor = accent ? 'rgba(157,36,73,0.3)' : 'var(--border)'
        el.style.background = 'var(--bg-card)'
      } : undefined}
      {...props}
    >
      {children}
    </div>
  )
}
