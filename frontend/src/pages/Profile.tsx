import { PageFooter } from '../components/layout'

export function Profile() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '1.5rem' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: 'var(--text-primary)' }}>Profile</h1>
      </div>
      <PageFooter />
    </div>
  )
}
