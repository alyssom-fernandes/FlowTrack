import { useEffect, type ReactNode } from 'react'

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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: width,
          maxHeight: '90dvh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontSize: '1.125rem',
                transition: 'color var(--transition)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{ padding: '1.25rem' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
