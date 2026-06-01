import { useState, useEffect } from 'react'
import { authService, supabase } from '../services'
import { Button, Input, Spinner } from '../components/ui'

type Status = 'loading' | 'ready' | 'done' | 'invalid'

export function ResetPassword() {
  const [status, setStatus] = useState<Status>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready')
    })

    // Supabase can exchange the PKCE code before the event fires; check session too
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus('ready')
      else setStatus(prev => prev === 'loading' ? 'invalid' : prev)
    })

    const timeout = setTimeout(() => {
      setStatus(prev => prev === 'loading' ? 'invalid' : prev)
    }, 8000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setSaving(true); setError('')
    try {
      await authService.updatePassword(password)
      setStatus('done')
    } catch {
      setError('Erro ao atualizar a senha. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '22rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="FlowTrack" className="ft-logo" style={{ height: '1.75rem', margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)' }}>
            {status === 'done' ? 'Senha atualizada' : 'Redefinir senha'}
          </p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem' }}>

          {status === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
              <Spinner size={24} />
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Verificando link...</p>
            </div>
          )}

          {status === 'invalid' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="square" style={{ margin: '0 auto' }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Link inválido ou expirado. Solicite um novo link de redefinição.
              </p>
              <Button onClick={() => window.location.href = '/login'} style={{ width: '100%' }}>
                Voltar ao login
              </Button>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <Input
                label="Nova senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
              <Input
                label="Confirmar senha"
                type="password"
                placeholder="Repita a nova senha"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--red)' }}>{error}</p>}
              <Button type="submit" loading={saving} style={{ width: '100%', marginTop: '0.25rem' }}>
                Salvar nova senha
              </Button>
            </form>
          )}

          {status === 'done' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="square" style={{ margin: '0 auto' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)' }}>
                Sua senha foi atualizada. Você já pode fazer login.
              </p>
              <Button onClick={() => window.location.href = '/login'} style={{ width: '100%' }}>
                Ir para o login
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
