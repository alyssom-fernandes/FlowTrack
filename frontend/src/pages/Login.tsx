import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services'
import { useAuthStore } from '../store'
import { Button, Input, AfnBrand } from '../components/ui'

export function Login() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, [user])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setError(''); setLoading(true)
    try { await authService.signIn(email, password); navigate('/dashboard', { replace: true }) }
    catch { setError('E-mail ou senha incorretos.') }
    finally { setLoading(false) }
  }

  const handleDemo = async () => {
    setError(''); setDemoLoading(true)
    try { await authService.signInDemo(); navigate('/dashboard', { replace: true }) }
    catch { setError('Modo demo temporariamente indisponível.') }
    finally { setDemoLoading(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '22rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Logo + headline */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo.png" alt="FlowTrack" className="ft-logo" style={{ height: '1.75rem', width: 'auto' }} />
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)' }}>Controle financeiro inteligente</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* CTA principal — Demo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Button loading={demoLoading} onClick={handleDemo} style={{ width: '100%' }}>
              Ver demonstração →
            </Button>
            <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', letterSpacing: '0.03em' }}>
              Sem cadastro &nbsp;·&nbsp; Dados resetam semanalmente
            </p>
          </div>

          {/* Divisor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', letterSpacing: '0.05em' }}>ou</span>
            <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
          </div>

          {/* Toggle: Já tenho conta */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', textAlign: 'center', padding: '0.25rem', fontFamily: 'var(--font)', transition: 'color var(--transition)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Já tenho conta &nbsp;→
            </button>
          ) : (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <Input label="E-mail" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <Input label="Senha" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)', textAlign: 'center' }}>{error}</p>}
              <Button type="submit" variant="ghost" loading={loading} style={{ width: '100%' }}>Entrar</Button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--text-hint)', textAlign: 'center', fontFamily: 'var(--font)', padding: '0' }}
              >
                ← Voltar
              </button>
            </form>
          )}

          <div style={{ paddingTop: '0.75rem', borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
            <AfnBrand size="md" />
          </div>
        </div>

      </div>
    </div>
  )
}
