// Auxiliares da entrada: motivo do erro do Supabase, rede, validação e foco
// Traduz o erro do Supabase num motivo que a tela sabe explicar
export type AuthFailure = 'credentials' | 'network' | 'unconfirmed' | 'rate' | 'samePassword' | 'weakPassword' | 'unknown'

export function authFailure(err: unknown): AuthFailure {
  const e = (err ?? {}) as { name?: string; code?: string; status?: number; message?: string }
  const msg = (e.message || '').toLowerCase()
  if (e.code === 'auth-unavailable' || e.code === 'timeout') return 'network'
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.status === 0 || (e.status ?? 0) >= 500) return 'network'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'network'
  if (e.code === 'invalid_credentials' || msg.includes('invalid login')) return 'credentials'
  if (e.code === 'email_not_confirmed') return 'unconfirmed'
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return 'rate'
  if (e.code === 'same_password') return 'samePassword'
  if (e.code === 'weak_password') return 'weakPassword'
  if (e.status === 400) return 'credentials'
  return 'unknown'
}

// Confere se o servidor de login responde antes de chamar o Supabase, que registra
// a falha de rede no console. Resposta opaca (no-cors) já basta: só a rede importa.
export async function reachServer(): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return
  try { await fetch(`${base}/auth/v1/health`, { mode: 'no-cors', cache: 'no-store' }) }
  catch { throw Object.assign(new Error('offline'), { code: 'auth-unavailable' }) }
}

// Servidor fora do ar às vezes não responde nem com erro: desiste depois de um tempo
export function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)
    promise.then(v => { clearTimeout(id); resolve(v) }, e => { clearTimeout(id); reject(e) })
  })
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

// Leva o foco ao primeiro campo com erro
export const focusField = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())
