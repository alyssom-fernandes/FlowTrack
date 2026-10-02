// ── Apoio do Perfil: paleta, contraste e leitura de valores ──

// Paleta para contas e categorias: tons médios que funcionam nos dois temas
export const PALETTE = [
  '#9D2449', '#e06c75', '#e09c4c', '#e5c07b', '#98c379', '#4caf7d',
  '#56b6c2', '#61afef', '#6c7ee1', '#c678dd', '#b07a5a', '#8b8b96',
]

export const DEFAULT_COLOR = PALETTE[0]

// Texto escuro ou claro sobre uma cor de fundo (luminância relativa)
export function readableOn(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.45 ? '#111113' : '#ffffff'
}

export function sameColor(a?: string, b?: string): boolean {
  return (a || '').toLowerCase() === (b || '').toLowerCase()
}

// Cores únicas, mantendo a ordem
export function uniqueColors(list: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of list) {
    if (!c) continue
    const k = c.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(c) }
  }
  return out
}

// Aceita "1.250,50", "1,250.50", "1250.5", "-89,90" e "R$ 10"; null se inválido.
// Um único separador seguido de exatamente 3 dígitos é tratado como milhar.
export function parseAmount(raw: string): number | null {
  if (!raw.trim()) return 0
  if (/[^\d\s,.\-R$]/.test(raw)) return null
  let s = raw.replace(/[^\d,.-]/g, '')
  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')
  if (!s || !/\d/.test(s)) return null
  const seps = s.match(/[.,]/g) || []
  let normalized = s
  if (seps.length) {
    const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
    const after = s.slice(last + 1)
    const kinds = new Set(seps)
    const decimal = kinds.size > 1 || (seps.length === 1 && after.length !== 3)
    normalized = decimal
      ? s.slice(0, last).replace(/[.,]/g, '') + '.' + after
      : s.replace(/[.,]/g, '')
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round((negative ? -value : value) * 100) / 100
}

// Depois da validação, leva o foco ao primeiro campo com erro
export function focusInvalid(form: EventTarget | null) {
  requestAnimationFrame(() => (form as HTMLElement | null)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}
