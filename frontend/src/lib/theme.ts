// ── Tema claro/escuro ─────────────────────────────────────
// O index.html aplica o tema salvo antes do React carregar (sem piscar).
export type Theme = 'dark' | 'light'
const KEY = 'ft-theme'

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem(KEY, theme) } catch { /* ignora */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f5f7' : '#0b0b0c')
}
