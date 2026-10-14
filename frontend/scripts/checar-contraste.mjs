// Contraste e tamanho das pílulas e selos, medidos no navegador (demonstração, temas escuro e claro).
// Para cada elemento: cor do texto contra o fundo efetivo (fundos semitransparentes compostos até o
// primeiro opaco), tamanho e peso da fonte. Falha se algum texto ficar abaixo de 4,5:1 ou de 12 px.
//
// Uso (com o Vite rodando): node scripts/checar-contraste.mjs [--base http://localhost:5173]
import { chromium } from '@playwright/test'

const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5173'
const ROTAS = ['/dashboard', '/transactions', '/transactions?review=1', '/goals', '/goals?aba=orcamentos', '/investments', '/reports', '/profile', '/profile?tab=categories']
const SELETORES = ['.ft-budget__status', '.ft-pace__status', '.ft-catpill', '.tx-cat__chip', '.tx-ai', '.ft-badge', '.inv-result', '.tx-tag', '.tx-pill', '.tx-chip', '.tx-review-chip']

const browser = await chromium.launch()
let falhas = 0
for (const tema of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addInitScript(t => {
    localStorage.setItem('ft-theme', t)
    localStorage.setItem('ft-lang', 'pt')
    sessionStorage.setItem('ft-demo', '1')
  }, tema)
  const page = await context.newPage()
  const pior = new Map()
  for (const rota of ROTAS) {
    await page.goto(base + rota, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    const medidas = await page.evaluate(sels => {
      const parse = c => {
        const m = c.match(/rgba?\(([^)]+)\)/) || c.match(/color\(srgb ([^)]+)\)/)
        if (!m) return null
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
        const srgb = c.startsWith('color(')
        return { r: srgb ? p[0] * 255 : p[0], g: srgb ? p[1] * 255 : p[1], b: srgb ? p[2] * 255 : p[2], a: p[3] ?? 1 }
      }
      const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
      const fundo = el => {
        const camadas = []
        for (let e = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor)
          if (c && c.a > 0) { camadas.push(c); if (c.a >= 1) break }
        }
        let cor = { r: 255, g: 255, b: 255, a: 1 }
        for (let i = camadas.length - 1; i >= 0; i--) cor = over(camadas[i], cor)
        return cor
      }
      const lum = c => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
      }
      const out = []
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          if (!el.offsetParent || !el.textContent.trim()) continue
          const cs = getComputedStyle(el)
          let texto = parse(cs.color)
          if (!texto) continue
          const bg = fundo(el)
          texto = over(texto, bg)
          const [a, b] = [lum(texto), lum(bg)].sort((x, y) => y - x)
          out.push({ sel, texto: el.textContent.trim().slice(0, 28), razao: (a + 0.05) / (b + 0.05), px: parseFloat(cs.fontSize), peso: Number(cs.fontWeight) })
        }
      }
      return out
    }, SELETORES)
    for (const m of medidas) {
      const atual = pior.get(m.sel)
      if (!atual || m.razao < atual.razao || m.px < atual.px) pior.set(m.sel, { ...m, rota, minPx: Math.min(m.px, atual?.minPx ?? 99) })
    }
  }
  console.log(`\n== tema ${tema}`)
  for (const [sel, m] of pior) {
    const ok = m.razao >= 4.5 && m.minPx >= 12
    if (!ok) falhas++
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${sel.padEnd(20)} pior ${m.razao.toFixed(2)}:1 em "${m.texto}" (${m.rota}) · menor fonte ${m.minPx}px · peso ${m.peso}`)
  }
  await context.close()
}
await browser.close()
console.log(falhas ? `\n${falhas} com problema` : '\nTudo com 4,5:1 ou mais e fonte de 12 px ou mais')
process.exitCode = falhas ? 1 : 0
