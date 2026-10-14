// ── Auditoria do DOM de cada cenário das fotos (sem IA) ──
// Refaz o caminho de cada item de scripts/fotos/itens (mesmo contexto e mesma ação das fotos) e mede:
// - falham: texto sobreposto, texto cortado ou transbordando, elemento fora da janela, contraste de texto < AA;
// - só avisam: alvo de toque < 40 px no celular e fonte < 11 px.
// Isenções de propósito: barras fixas por cima do conteúdo, dicas e menus abertos, logotipo AFN SYSTEMS,
// enfeites com aria-hidden, itens esmaecidos de propósito (.is-dim), o que fica atrás de um modal aberto
// e o que tiver data-corte-ok.
//
// Uso (com o Vite rodando):
//   node scripts/fotos/auditar-dom.mjs --base http://localhost:5173 --idioma pt
//   node scripts/fotos/auditar-dom.mjs --itens dashboard,transacoes --larguras 375
// Opções: --base URL · --idioma pt|en · --areas a,b · --itens id1,id2 · --larguras 1366,375 · --temas escuro,claro
//         --paralelo 4 · --saida pasta (padrão .fotos/auditoria)
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { esperarPronto } from './rodar.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const o = {}
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'sim'
const base = o.base || 'http://localhost:5173'
const idioma = o.idioma || 'pt'
const larguras = (o.larguras || '1366,375').split(',').map(Number)
const temas = (o.temas || 'escuro,claro').split(',')
const saida = resolve(o.saida || join(aqui, '..', '..', '..', '.fotos', 'auditoria'))
const VIEWPORT = { 1366: { width: 1366, height: 768 }, 375: { width: 375, height: 812 } }
const GRAVES = ['sobreposicao', 'corte', 'transborda', 'fora-da-janela', 'contraste']

const itens = []
for (const arq of readdirSync(join(aqui, 'itens')).filter(f => f.endsWith('.mjs')).sort()) {
  const area = arq.replace('.mjs', '')
  if (o.areas && !o.areas.split(',').includes(area)) continue
  for (const item of (await import(pathToFileURL(join(aqui, 'itens', arq)).href)).default) {
    if (o.itens && !o.itens.split(',').includes(item.id)) continue
    itens.push({ ...item, area })
  }
}

// Roda dentro da página
function medir({ mobile }) {
  const W = window.innerWidth
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = str => {
    if (!str || str === 'transparent') return [0, 0, 0, 0]
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const blend = (fg, bg) => { const a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1] }
  const nome = el => {
    const c = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''
    const cls = c.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }
  const caminho = el => { const p = []; let e = el; for (let i = 0; e && e !== document.body && i < 3; i++, e = e.parentElement) p.unshift(nome(e)); return p.join(' > ') }
  const visivel = el => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || (r.width <= 1 && r.height <= 1)) return false
    const fechado = el.closest('details:not([open])')
    if (fechado && !el.closest('summary') && el !== fechado) return false
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    const s = getComputedStyle(el)
    return !(s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)')
  }
  const fixo = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true } return false }
  const textoProprio = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()
  const todos = [...document.querySelectorAll('body *')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName))
  const achados = []
  const add = (tipo, el, extra = {}) => {
    const r = el.getBoundingClientRect()
    achados.push({ tipo, onde: caminho(el), texto: (textoProprio(el) || el.textContent || '').trim().slice(0, 60), caixa: [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)], ...extra })
  }

  // Texto cortado ou transbordando (rolagem própria e reticências de propósito não contam)
  for (const el of todos) {
    if (!visivel(el) || el.closest('svg') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.closest('[data-corte-ok]')) continue
    if (!el.textContent.trim()) continue
    const s = getComputedStyle(el)
    const sobra = el.scrollWidth - el.clientWidth
    if (el.clientWidth > 0 && sobra > 1 && !['auto', 'scroll'].includes(s.overflowX) && s.textOverflow !== 'ellipsis') {
      if (['hidden', 'clip'].includes(s.overflowX)) add('corte', el, { sobra })
      else if (textoProprio(el)) add('transborda', el, { sobra })
    }
  }

  // Texto sobreposto: com modal aberto só vale o modal; dicas, menus e avisos ficam por cima de propósito
  const modal = [...document.querySelectorAll('.ft-modal, [role="dialog"], [role="alertdialog"]')].find(visivel)
  const camada = el => el.closest('.ft-chart-tip, .rp-tip, .inv-tip, [role="menu"], [role="tooltip"], .ft-toast, .ft-toasts')
  const cortadoPorPai = (el, r) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e)
      if ([s.overflowX, s.overflowY].some(v => ['hidden', 'clip', 'auto', 'scroll'].includes(v))) {
        const p = e.getBoundingClientRect()
        if (r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom) return true
      }
    }
    return false
  }
  const caixas = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!n.textContent.trim() || !el || !visivel(el) || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue
    if ((modal && !modal.contains(el) && !camada(el)) || fixo(el)) continue
    const range = document.createRange(); range.selectNodeContents(n)
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2 || cortadoPorPai(el, r)) continue
      caixas.push({ el, r, t: n.textContent.trim().slice(0, 40), c: camada(el), bloco: el.closest('h1, h2, h3, h4, p, li, td, th, button, a, label') })
    }
  }
  for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
    const a = caixas[i], b = caixas[j]
    if (a.el === b.el || a.c !== b.c || (a.bloco && a.bloco === b.bloco)) continue
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
    const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
    if (ix > 3 && iy > 4) achados.push({ tipo: 'sobreposicao', onde: `${caminho(a.el)}  ×  ${caminho(b.el)}`, texto: `"${a.t}" × "${b.t}"`, caixa: [Math.round(Math.min(a.r.left, b.r.left) + scrollX), Math.round(Math.min(a.r.top, b.r.top) + scrollY), Math.round(Math.abs(a.r.left - b.r.right)), Math.round(Math.abs(a.r.top - b.r.bottom))] })
  }

  // Fora da janela na horizontal (sem contêiner que role ou corte)
  for (const el of todos) {
    if (!visivel(el)) continue
    const r = el.getBoundingClientRect()
    if ((r.right <= W + 1 && r.left >= -1) || r.right <= 0 || getComputedStyle(el).position === 'fixed') continue
    let contido = false
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(e).overflowX)) { contido = true; break }
    if (!contido) add('fora-da-janela', el, { direita: Math.round(r.right) })
  }

  // Contraste de texto (AA) e fonte mínima
  for (const el of todos) {
    const proprio = textoProprio(el)
    if (!proprio || !visivel(el)) continue
    const s = getComputedStyle(el)
    const px = parseFloat(s.fontSize)
    if (px < 11) add('fonte-pequena', el, { px })
    if (el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"], .is-dim, .pf-afn, .pf-sys') || !/[\p{L}\p{N}]/u.test(proprio)) continue
    if (modal && !modal.contains(el) && !camada(el)) continue // coberto pelo fundo escurecido do modal
    let fg = rgba(s.color)
    if (el.tagName.toLowerCase() === 'text' && s.fill && s.fill !== 'none') fg = rgba(s.fill)
    let op = 1, bg = null
    const pilha = []
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const es = getComputedStyle(e)
      op *= Number(es.opacity)
      const c = rgba(es.backgroundColor)
      if (c[3] > 0) pilha.push(c)
      if (c[3] >= 0.99) { bg = c; break }
    }
    let fundo = bg || rgba(getComputedStyle(document.documentElement).backgroundColor)
    if (fundo[3] === 0) fundo = [255, 255, 255, 1]
    for (let k = pilha.length - 1; k >= 0; k--) if (pilha[k] !== bg) fundo = blend(pilha[k], fundo)
    const cr = ratio(blend([fg[0], fg[1], fg[2], fg[3] * op], fundo), fundo)
    const minimo = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5
    if (cr < minimo - 0.01) add('contraste', el, { razao: Math.round(cr * 100) / 100, minimo, px })
  }

  // Alvo de toque no celular (link dentro de parágrafo não conta)
  if (mobile) {
    for (const el of todos.filter(e => e.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]') && visivel(e))) {
      if (el.tagName === 'A' && el.closest('p')) continue
      const r = (el.closest('label') || el).getBoundingClientRect()
      if (r.height < 40 || r.width < 40) add('alvo-pequeno', el, { w: Math.round(r.width), h: Math.round(r.height) })
    }
  }
  return achados
}

async function auditar(browser, item, largura, tema) {
  const mobile = largura < 768
  const context = await browser.newContext({
    viewport: VIEWPORT[largura], isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce',
    locale: idioma === 'en' ? 'en-US' : 'pt-BR', colorScheme: tema === 'claro' ? 'light' : 'dark',
  })
  await context.addInitScript(({ tema, idioma, demo, vazio }) => {
    try {
      localStorage.setItem('ft-theme', tema === 'claro' ? 'light' : 'dark')
      localStorage.setItem('ft-lang', idioma)
      if (demo) sessionStorage.setItem('ft-demo', '1')
      if (vazio) sessionStorage.setItem('ft-demo-vazio', '1')
    } catch { /* ignora */ }
  }, { tema, idioma, demo: !item.semDemo, vazio: !!item.vazio })
  const page = await context.newPage()
  const id = `${item.id}__${largura}__${tema}${idioma !== 'pt' ? '__' + idioma : ''}`
  let falha = null, achados = []
  try {
    await page.goto(base + item.rota, { waitUntil: 'domcontentloaded' })
    await esperarPronto(page)
    if (item.acao) { await item.acao(page, { largura, tema, mobile, idioma }); await esperarPronto(page) }
    if (item.inteira !== false) await page.evaluate(() => document.documentElement.classList.add('ft-foto-inteira'))
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
    achados = await page.evaluate(medir, { mobile })
  } catch (e) { falha = String(e && e.message ? e.message : e).split('\n')[0] }
  await context.close()
  return { id, item: item.id, area: item.area, largura, tema, idioma, falha, achados }
}

const tarefas = []
for (const item of itens) for (const largura of larguras) {
  if ((item.somente === 'desktop' && largura < 768) || (item.somente === 'mobile' && largura >= 768)) continue
  for (const tema of temas) tarefas.push({ item, largura, tema })
}
mkdirSync(saida, { recursive: true })
const browser = await chromium.launch()
const res = []
let prox = 0
await Promise.all(Array.from({ length: Number(o.paralelo || 4) }, async () => {
  while (prox < tarefas.length) {
    const t = tarefas[prox++]
    const r = await auditar(browser, t.item, t.largura, t.tema)
    res.push(r)
    const graves = r.achados.filter(a => GRAVES.includes(a.tipo))
    console.log(`${(r.falha ? 'FALHOU' : graves.length ? `${graves.length} GRAVE(S)` : 'ok').padEnd(11)} ${r.id}${r.falha ? ' — ' + r.falha : ''}`)
    for (const a of graves) console.log(`            [${a.tipo}] ${a.onde} "${a.texto}"${a.razao ? ` ${a.razao}:1` : ''}`)
  }
}))
await browser.close()
res.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(join(saida, `dom-${idioma}.json`), JSON.stringify(res, null, 1))
// Resumo: um item por (tipo, elemento), com quantos cenários
const resumo = new Map()
for (const r of res) for (const a of r.achados) {
  const k = `${a.tipo} | ${a.onde}`
  const v = resumo.get(k) ?? { n: 0, ex: r.id, texto: a.texto }
  v.n++; resumo.set(k, v)
}
const graves = [...resumo].filter(([k]) => GRAVES.includes(k.split(' | ')[0]))
const avisos = [...resumo].filter(([k]) => !GRAVES.includes(k.split(' | ')[0]))
console.log(`\n${res.length} cenários · ${res.filter(r => r.falha).length} falhas de roteiro · ${graves.length} achados graves distintos · ${avisos.length} avisos distintos`)
for (const [k, v] of graves) console.log(`  GRAVE ${k} "${v.texto}" (${v.n}×, ex.: ${v.ex})`)
for (const [k, v] of avisos.slice(0, 40)) console.log(`  aviso ${k} "${v.texto}" (${v.n}×)`)
process.exit(res.some(r => r.falha) || graves.length ? 1 : 0)
