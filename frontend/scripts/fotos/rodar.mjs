// ── Fotos de todas as telas, no modo demonstração ─────────
// Cada item (tela, modal, aba, estado vazio…) é fotografado em
// 1366×768 e 375×812, nos temas escuro e claro. Depois de cada foto
// o roteiro lê errosRegistrados() e falha se houver algum erro.
//
// Uso (com o Vite rodando):
//   node scripts/fotos/rodar.mjs --saida ../.fotos/antes
//   node scripts/fotos/rodar.mjs --areas dashboard --temas claro --larguras 375
//   node scripts/fotos/rodar.mjs --itens transacoes-nova --idioma en
//
// Opções: --base URL (padrão http://localhost:5173) · --areas a,b · --itens id1,id2
//         --larguras 1366,375 · --temas escuro,claro · --idioma pt|en · --escala 1|2
//         --paralelo 4 · --saida pasta
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

function opcoes() {
  const args = process.argv.slice(2)
  const o = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { o[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'sim' }
  }
  return {
    base: o.base || 'http://localhost:5173',
    areas: o.areas ? o.areas.split(',') : null,
    itens: o.itens ? o.itens.split(',') : null,
    larguras: (o.larguras || '1366,375').split(',').map(Number),
    temas: (o.temas || 'escuro,claro').split(','),
    idioma: o.idioma || 'pt',
    escala: Number(o.escala || 1),
    paralelo: Number(o.paralelo || 4),
    saida: resolve(o.saida || join(aqui, '..', '..', '..', '.fotos', 'ultima')),
  }
}

const VIEWPORT = { 1366: { width: 1366, height: 768 }, 375: { width: 375, height: 812 } }

async function carregarItens(o) {
  const pasta = join(aqui, 'itens')
  const lista = []
  for (const arq of readdirSync(pasta).filter(f => f.endsWith('.mjs')).sort()) {
    const area = arq.replace('.mjs', '')
    if (o.areas && !o.areas.includes(area)) continue
    const mod = await import(pathToFileURL(join(pasta, arq)).href)
    for (const item of mod.default) {
      if (o.itens && !o.itens.includes(item.id)) continue
      lista.push({ ...item, area })
    }
  }
  return lista
}

// Espera a tela assentar: fontes, nada carregando, sem animação pendente
export async function esperarPronto(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
}

async function fotografar(browser, o, item, largura, tema) {
  const mobile = largura < 768
  const context = await browser.newContext({
    viewport: VIEWPORT[largura] || { width: largura, height: 800 },
    deviceScaleFactor: o.escala,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    locale: o.idioma === 'en' ? 'en-US' : 'pt-BR',
    colorScheme: tema === 'claro' ? 'light' : 'dark',
  })
  await context.addInitScript(({ tema, idioma, demo, vazio }) => {
    try {
      localStorage.setItem('ft-theme', tema === 'claro' ? 'light' : 'dark')
      localStorage.setItem('ft-lang', idioma)
      if (demo) sessionStorage.setItem('ft-demo', '1')
      if (vazio) sessionStorage.setItem('ft-demo-vazio', '1')
    } catch { /* ignora */ }
  }, { tema, idioma: o.idioma, demo: !item.semDemo, vazio: !!item.vazio })
  const page = await context.newPage()
  const nome = `${item.id}__${largura}__${tema}${o.idioma !== 'pt' ? '__' + o.idioma : ''}.png`
  let falha = null
  try {
    await page.goto(o.base + item.rota, { waitUntil: 'domcontentloaded' })
    await esperarPronto(page)
    if (item.acao) {
      await item.acao(page, { largura, tema, mobile, idioma: o.idioma })
      await esperarPronto(page)
    }
    if (item.inteira !== false) await page.evaluate(() => document.documentElement.classList.add('ft-foto-inteira'))
    await page.screenshot({ path: join(o.saida, nome), fullPage: item.inteira !== false, animations: 'disabled' })
  } catch (e) {
    falha = String(e && e.message ? e.message : e).split('\n')[0]
    await page.screenshot({ path: join(o.saida, nome), fullPage: false }).catch(() => {})
  }
  const erros = await page.evaluate(() => (window.errosRegistrados ? window.errosRegistrados() : [{ tipo: 'roteiro', mensagem: 'errosRegistrados() não existe' }])).catch(() => [])
  // Tela mais larga que a janela = rolagem horizontal (quase sempre um defeito no celular)
  const largo = await page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth <= window.innerWidth + 1) return null
    const culpado = [...document.querySelectorAll('body *')].find(el => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed')
    return `${doc.scrollWidth}px > ${window.innerWidth}px${culpado ? ` (ex.: <${culpado.tagName.toLowerCase()} class="${culpado.className}">)` : ''}`
  }).catch(() => null)
  if (largo && !item.permitirRolagemHorizontal) erros.push({ tipo: 'layout', mensagem: `rolagem horizontal: ${largo}` })
  await context.close()
  return { arquivo: nome, id: item.id, area: item.area, largura, tema, falha, erros }
}

async function main() {
  const o = opcoes()
  mkdirSync(o.saida, { recursive: true })
  const itens = await carregarItens(o)
  const tarefas = []
  for (const item of itens) {
    for (const largura of o.larguras) {
      if (item.somente === 'desktop' && largura < 768) continue
      if (item.somente === 'mobile' && largura >= 768) continue
      for (const tema of o.temas) tarefas.push({ item, largura, tema })
    }
  }
  const browser = await chromium.launch()
  const resultados = []
  let proxima = 0
  async function trabalhador() {
    while (proxima < tarefas.length) {
      const t = tarefas[proxima++]
      const r = await fotografar(browser, o, t.item, t.largura, t.tema)
      resultados.push(r)
      const marca = r.falha ? 'FALHOU' : r.erros.length ? `${r.erros.length} ERRO(S)` : 'ok'
      console.log(`${marca.padEnd(10)} ${r.arquivo}${r.falha ? ' — ' + r.falha : ''}`)
      for (const e of r.erros) console.log(`           [${e.tipo}] ${e.mensagem}`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, o.paralelo) }, trabalhador))
  await browser.close()
  resultados.sort((a, b) => a.arquivo.localeCompare(b.arquivo))
  const comErro = resultados.filter(r => r.falha || r.erros.length)
  // Rodada parcial (--itens, --areas, uma largura ou um tema) atualiza o relatório da pasta em vez de apagar o resto da matriz
  const arqRel = join(o.saida, 'relatorio.json')
  let todas = resultados
  if ((o.itens || o.areas || o.larguras.length < 2 || o.temas.length < 2) && existsSync(arqRel)) {
    const novos = new Set(resultados.map(r => r.arquivo))
    todas = [...JSON.parse(readFileSync(arqRel, 'utf8')).fotos.filter(f => !novos.has(f.arquivo)), ...resultados].sort((a, b) => a.arquivo.localeCompare(b.arquivo))
  }
  const comErroTodas = todas.filter(r => r.falha || r.erros.length)
  writeFileSync(arqRel, JSON.stringify({ base: o.base, idioma: o.idioma, total: todas.length, comErro: comErroTodas.length, fotos: todas }, null, 2))
  console.log(`\n${resultados.length} fotos em ${o.saida} · ${comErro.length} com erro ou falha${todas !== resultados ? ` (relatório da pasta: ${todas.length} fotos, ${comErroTodas.length} com erro)` : ''}`)
  process.exit(comErro.length ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
