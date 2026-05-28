// AFN SYSTEMS brand — matches reference design exactly
// Login/Sidebar: AFN SYSTEMS + by Alyssom Fernandes
// Footer (mobile): AFN SYSTEMS only, no "by" line

interface AfnBrandProps {
  showBy?: boolean  // show "by Alyssom Fernandes" line
  size?: 'sm' | 'md'
}

export function AfnBrand({ showBy = true, size = 'sm' }: AfnBrandProps) {
  const fontSize = size === 'md' ? '0.8125rem' : '0.625rem'
  const bySize   = size === 'md' ? '0.5625rem' : '0.4375rem'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1875rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontWeight: '700',
          fontSize,
          letterSpacing: '2px',
          color: '#c44a5a',
          WebkitTextStroke: '0.3px rgba(196,74,90,0.4)',
        }}>AFN</span>
        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontWeight: '700',
          fontSize,
          letterSpacing: '2px',
          color: 'rgba(255,255,255,0.28)',
        }}>SYSTEMS</span>
      </div>
      {showBy && (
        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: bySize,
          letterSpacing: '1.4px',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.2)',
          fontWeight: '700',
        }}>by Alyssom Fernandes</span>
      )}
    </div>
  )
}
