// Entrada (login) e redefinição de senha, fora da demonstração.
// O Supabase do projeto foi desativado: as respostas do servidor são simuladas
// com page.route para fotografar cada estado (erro, link enviado, senha salva).
// "Verificando o link…" dura menos que a espera do roteiro: conferido à parte.
import { readFileSync } from 'node:fs'

const SUPABASE_URL = (() => {
  for (const arq of ['.env.local', '.env']) {
    try {
      const m = readFileSync(new URL(`../../../${arq}`, import.meta.url), 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)
      if (m) return m[1].trim()
    } catch { /* tenta o próximo */ }
  }
  return ''
})()
const STORAGE_KEY = `sb-${(SUPABASE_URL.match(/https?:\/\/([^.]+)\./) || [])[1] || 'local'}-auth-token`

const EMAIL = /^(e-mail|email)$/i
const SENHA = /^(senha|password)$/i

// O login confere antes se o servidor responde (GET /auth/v1/health)
const servidorNoAr = page => page.route('**/auth/v1/health**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

const esqueci = page => page.getByRole('button', { name: /esqueci a senha|forgot password/i }).click()

async function entrar(page) {
  await page.getByLabel(EMAIL).fill('ana@exemplo.com')
  await page.getByLabel(SENHA).fill('senha-errada')
  await page.getByRole('button', { name: /^(entrar|sign in)$/i }).click()
  await page.locator('.ent-notice').waitFor()
}

// Simula a versão publicada sem as variáveis do Supabase
async function semServidor(page) {
  await page.route('**/src/services.ts*', async route => {
    // Sem cabeçalhos condicionais: um 304 traria o arquivo original do cache
    const headers = { ...route.request().headers() }
    delete headers['if-none-match']
    delete headers['if-modified-since']
    const res = await route.fetch({ headers })
    const body = (await res.text()).replace(/realAuthAvailable\s*=\s*!!supabase/, 'realAuthAvailable = false')
    await route.fulfill({ response: res, body })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.ent-content > *').first().waitFor()
}

// Sessão de recuperação falsa (como a que o link do e-mail cria) para abrir o formulário
async function sessaoDeRecuperacao(page) {
  await page.evaluate(({ key }) => {
    const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    const exp = Math.floor(Date.now() / 1000) + 3600
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'ana@exemplo.com', app_metadata: {}, user_metadata: {}, created_at: '2025-03-01T12:00:00Z' }
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated', email: user.email })}.assinatura`
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }))
  }, { key: STORAGE_KEY })
  await servidorNoAr(page)
  await page.route('**/auth/v1/user**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'ana@exemplo.com', app_metadata: {}, user_metadata: {}, created_at: '2025-03-01T12:00:00Z', updated_at: new Date().toISOString() }),
  }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByLabel(/^(nova senha|new password)$/i).waitFor()
}

export default [
  // Entrada
  { id: 'entrada', rota: '/login', semDemo: true },
  {
    id: 'entrada-validacao', rota: '/login', semDemo: true, acao: async page => {
      await page.getByRole('button', { name: /^(entrar|sign in)$/i }).click()
    },
  },
  {
    id: 'entrada-erro-senha', rota: '/login', semDemo: true, acao: async page => {
      await servidorNoAr(page)
      await page.route('**/auth/v1/token**', route => route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      }))
      await entrar(page)
      await page.getByRole('button', { name: /mostrar senha|show password/i }).click()
    },
  },
  {
    id: 'entrada-erro-rede', rota: '/login', semDemo: true, acao: async page => {
      await page.route('**/auth/v1/**', route => route.abort('internetdisconnected'))
      await entrar(page)
    },
  },
  { id: 'entrada-sem-servidor', rota: '/login', semDemo: true, acao: semServidor },

  // Esqueci a senha
  { id: 'entrada-esqueci', rota: '/login', semDemo: true, acao: esqueci },
  {
    id: 'entrada-esqueci-validacao', rota: '/login', semDemo: true, acao: async page => {
      await esqueci(page)
      await page.getByLabel(EMAIL).fill('ana@exemplo')
      await page.getByRole('button', { name: /enviar link|send link/i }).click()
    },
  },
  {
    id: 'entrada-esqueci-erro', rota: '/login', semDemo: true, acao: async page => {
      await page.route('**/auth/v1/**', route => route.abort('internetdisconnected'))
      await esqueci(page)
      await page.getByLabel(EMAIL).fill('ana@exemplo.com')
      await page.getByRole('button', { name: /enviar link|send link/i }).click()
      await page.locator('.ent-notice').waitFor()
    },
  },
  {
    id: 'entrada-enviado', rota: '/login', semDemo: true, acao: async page => {
      await servidorNoAr(page)
      await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
      await esqueci(page)
      await page.getByLabel(EMAIL).fill('ana.souza@exemplo.com')
      await page.getByRole('button', { name: /enviar link|send link/i }).click()
      await page.getByRole('heading', { name: /confira o seu e-mail|check your email/i }).waitFor()
    },
  },

  // Redefinir senha
  { id: 'redefinir-senha', rota: '/reset-password', semDemo: true },
  { id: 'redefinir-senha-expirado', rota: '/reset-password?error=access_denied&error_code=otp_expired', semDemo: true },
  { id: 'redefinir-senha-sem-servidor', rota: '/reset-password', semDemo: true, acao: semServidor },
  { id: 'redefinir-senha-form', rota: '/reset-password', semDemo: true, acao: sessaoDeRecuperacao },
  {
    id: 'redefinir-senha-validacao', rota: '/reset-password', semDemo: true, acao: async page => {
      await sessaoDeRecuperacao(page)
      await page.getByLabel(/^(nova senha|new password)$/i).fill('flow2026track')
      await page.getByLabel(/^(repita a nova senha|repeat new password)$/i).fill('flow2026trak')
      await page.getByRole('button', { name: /salvar nova senha|save new password/i }).click()
    },
  },
  {
    id: 'redefinir-senha-concluido', rota: '/reset-password', semDemo: true, acao: async page => {
      await sessaoDeRecuperacao(page)
      await page.getByLabel(/^(nova senha|new password)$/i).fill('flow2026track')
      await page.getByLabel(/^(repita a nova senha|repeat new password)$/i).fill('flow2026track')
      await page.getByRole('button', { name: /salvar nova senha|save new password/i }).click()
      await page.getByRole('heading', { name: /senha atualizada|password updated/i }).waitFor()
    },
  },
]
