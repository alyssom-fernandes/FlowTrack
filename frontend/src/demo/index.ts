// ── Modo demonstração ─────────────────────────────────────
// Ligado por sessão (sessionStorage): vale até a aba ser fechada.
// Quando ativo, o axios usa o adaptador abaixo em vez da rede.
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { handleDemoRequest, loadDb, resetDb } from './backend'
import { DEMO_EMAIL } from './seed'

const FLAG_KEY = 'ft-demo'

export const demo = {
  isActive(): boolean {
    try { return sessionStorage.getItem(FLAG_KEY) === '1' } catch { return false }
  },
  start() {
    try { sessionStorage.setItem(FLAG_KEY, '1') } catch { /* ignora */ }
    loadDb()
  },
  stop() {
    try { sessionStorage.removeItem(FLAG_KEY) } catch { /* ignora */ }
    resetDb()
  },
  // Volta os dados fictícios ao estado inicial sem sair da demonstração
  restart() {
    resetDb()
    loadDb()
  },
  session() {
    const user = loadDb().user
    return { access_token: 'demo', token_type: 'bearer', user: { id: user.id, email: user.email, created_at: user.created_at } }
  },
  email: DEMO_EMAIL,
}

export const demoAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  let body: unknown = config.data
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* mantém texto */ } }
  const url = (config.url || '').replace(/^https?:\/\/[^/]+/, '')
  const query = config.params ? new URLSearchParams(config.params as Record<string, string>).toString() : ''
  const fullUrl = query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url
  const { status, data } = await handleDemoRequest(config.method || 'get', fullUrl, body)
  const response = { data, status, statusText: String(status), headers: new AxiosHeaders(), config, request: null }
  if (status >= 200 && status < 300) return response
  throw new AxiosError((data as { detail?: string })?.detail || `HTTP ${status}`, status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, null, response)
}
