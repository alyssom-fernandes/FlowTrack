import { PageFooter } from '../components/layout/PageFooter'

export function Reports() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: 'var(--text-primary)' }}>
          Reports
        </h1>
      </div>
      <PageFooter />
    </div>
  )
}
