// PageFooter — rendered at the bottom of each page content area
// Matches AlertSignal reference: flowtrack | AFN SYSTEMS
// Uses JetBrains Mono, same style as reference design

export function PageFooter() {
  return (
    <footer style={{
      borderTop: '0.5px solid var(--border)',
      padding: '0.875rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      marginTop: 'auto',
    }}>
      {/* AFN SYSTEMS */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontWeight: '700',
          fontSize: '0.625rem',
          letterSpacing: '2px',
          color: '#c44a5a',
          WebkitTextStroke: '0.3px rgba(196,74,90,0.4)',
        }}>AFN</span>
        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontWeight: '700',
          fontSize: '0.625rem',
          letterSpacing: '1.5px',
          color: 'rgba(255,255,255,0.28)',
        }}>SYSTEMS</span>
      </div>

      {/* pipe separator */}
      <span style={{
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: '0.8125rem',
        color: 'rgba(255,255,255,0.15)',
        margin: '0 0.125rem',
      }}>|</span>

      {/* FlowTrack */}
      <span style={{
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontWeight: '700',
        fontSize: '0.6875rem',
        letterSpacing: '0.3px',
        color: 'rgba(255,255,255,0.28)',
      }}>
        FlowTrack
      </span>
    </footer>
  )
}
