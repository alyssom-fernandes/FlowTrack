interface SpinnerProps {
  size?: number
  color?: string
}

export function Spinner({ size = 20, color = 'var(--accent)' }: SpinnerProps) {
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          border: '2px solid var(--border)',
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
          flexShrink: 0,
        }}
      />
    </>
  )
}

export function FullPageSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      background: 'var(--bg)',
    }}>
      <Spinner size={32} />
    </div>
  )
}
