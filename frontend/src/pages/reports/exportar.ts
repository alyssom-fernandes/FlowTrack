// ── Relatórios: exportações (PDF, Excel e CSV) ────────────
// O PDF é vetorial (jsPDF): texto selecionável, tabelas e um gráfico de
// barras desenhado com as primitivas da própria biblioteca.
import i18n from '../../i18n'
import { buildXlsx, type XlsxColumn, type XlsxValue } from '../../lib/xlsx'
import { buildCsv, downloadBlob, generatedAt as generatedAtFor } from '../../lib/export'
import { categoryLabel, currentLocale, formatCurrency, formatPercent } from '../../utils'
import type { Account, Category, Transaction } from '../../types'
import { variationTone } from '../../lib/variation'
import { shownCategoryId } from '../../lib/review'
import { axisMoney, changeText, niceTicks, type Bucket, type CategoryRow, type Granularity, type Range, type Summary, type TopRow } from './dados'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(`reports.${key}`, opts ?? {}) as string

export interface ReportModel {
  periodLabel: string
  compare: boolean  // barras e colunas do período anterior (segue o botão da tela)
  range: Range
  prevRange: Range
  rangeText: string
  prevRangeText: string
  summary: Summary
  prevSummary: Summary
  hasPrev: boolean
  granularity: Granularity
  buckets: Bucket[]
  prevBuckets: Bucket[]
  categories: CategoryRow[]
  top: TopRow[]
  transactions: Transaction[]
}

export function fileBase(r: Range) {
  return `flowtrack-${t('export.fileBase')}-${r.start}-${r.end}`
}

const generatedAt = () => generatedAtFor(currentLocale())

const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v)

// ── PDF ───────────────────────────────────────────────────
type RGB = [number, number, number]
const C = {
  ink: [17, 17, 19] as RGB, text: [44, 44, 49] as RGB, muted: [85, 85, 95] as RGB, hint: [111, 111, 120] as RGB,
  line: [228, 228, 232] as RGB, lineStrong: [201, 201, 207] as RGB, grid: [236, 236, 239] as RGB, card: [246, 246, 247] as RGB,
  wine: [157, 36, 73] as RGB, brand: [107, 31, 42] as RGB, brandGray: [80, 80, 80] as RGB,
  income: [44, 164, 112] as RGB, expense: [142, 142, 153] as RGB, // marcas: --chart-income / --chart-spend (claro): gasto em cinza, como na tela
  incomeText: [19, 132, 79] as RGB, expenseText: [198, 47, 69] as RGB, // texto: --green / --red (claro, contraste AA)
}
const hexRgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB
const tint = (c: RGB, k = 0.62): RGB => c.map(v => Math.round(v + (255 - v) * k)) as RGB

// As fontes padrão do PDF usam a tabela WinAnsi: troca espaços finos e sinais fora dela
const pdfText = (s: string) => s.replace(/[\u00A0\u2009\u202F\u2007]/g, ' ').replace(/\u2212/g, '-').replace(/[\u2018\u2019]/g, "'")

export async function exportPdf(model: ReportModel) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const H = 297, L = 16, R = 194, CW = R - L, BOTTOM = H - 22
  let y = 0

  const font = (size: number, style: 'normal' | 'bold' = 'normal', color: RGB = C.text) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color)
  }
  const text = (s: string, x: number, yy: number, opts: { align?: 'left' | 'right' | 'center'; maxWidth?: number } = {}) => {
    let str = pdfText(s)
    if (opts.maxWidth) {
      while (str.length > 1 && doc.getTextWidth(str) > opts.maxWidth) str = str.slice(0, -2) + '…'
    }
    doc.text(str, x, yy, { align: opts.align ?? 'left', baseline: 'alphabetic' })
  }
  const hline = (x1: number, x2: number, yy: number, color: RGB, w = 0.2) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, yy, x2, yy) }
  const newPage = () => { doc.addPage(); y = 20 }
  const ensure = (need: number) => { if (y + need > BOTTOM) newPage() }

  // Cabeçalho
  y = 18
  // Logotipo do app (versão do tema claro); sem ele, o nome em texto
  const logo = await fetch('/logo-claro.png')
    .then(r => (r.ok ? r.blob() : null))
    .then(b => b && new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b) }))
    .catch(() => null)
  if (logo) doc.addImage(logo, 'PNG', L, y - 5.4, 26, 6.5)
  else { font(15, 'bold', C.wine); text('FlowTrack', L, y) }
  font(8.5, 'normal', C.hint); text(t('print.generated', { date: generatedAt() }), R, y, { align: 'right' })
  hline(L, R, y + 4, C.line, 0.3)
  y = 34
  font(18, 'bold', C.ink); text(t('pdf.docTitle'), L, y)
  y += 7
  font(10, 'normal', C.text); text(`${model.periodLabel} · ${model.rangeText}`, L, y)
  if (model.compare) { y += 5; font(8.5, 'normal', C.muted); text(t('compare.with', { range: model.prevRangeText }), L, y) }

  // Resumo: um número dominante (o que sobrou) e receitas e gastos como apoio, como no app
  // (a grade de 4 cartões iguais era o visual padrão de painel)
  y += 7
  const s = model.summary, p = model.prevSummary
  const delta = (d: number | null, good: boolean, pp: boolean, x: number, yy: number, maxW: number) => {
    if (!model.hasPrev || d === null) { font(7, 'normal', C.hint); text(model.hasPrev ? t('kpi.noBase') : t('kpi.noPrev'), x, yy, { maxWidth: maxW }); return }
    const flat = Math.abs(d) < 0.05
    // Mesma régua da tela: cor de estado só a partir de ±5%
    const tone = variationTone(d, good)
    const color = tone === 'good' ? C.incomeText : tone === 'bad' ? C.expenseText : C.muted
    doc.setFillColor(...color)
    if (!flat) {
      if (d > 0) doc.triangle(x, yy - 0.2, x + 2.4, yy - 0.2, x + 1.2, yy - 2.3, 'F')
      else doc.triangle(x, yy - 2.3, x + 2.4, yy - 2.3, x + 1.2, yy - 0.2, 'F')
    }
    const v = flat ? '0%' : pp ? t('kpi.pp', { value: formatPercent(Math.abs(d), 1, false).replace(/\s?%/, '') }) : changeText(d)
    font(7.5, 'bold', color); text(v, x + (flat ? 0 : 3.4), yy)
    const vw = doc.getTextWidth(pdfText(v))
    font(7, 'normal', C.hint); text(t('pdf.vsPrev'), x + (flat ? 0 : 3.4) + vw + 1.5, yy, { maxWidth: Math.max(8, maxW - vw - 5) })
  }
  {
    const bandH = 30
    doc.setFillColor(...C.card); doc.roundedRect(L, y, CW, bandH, 2, 2, 'F')
    const lx = L + 6
    font(8, 'normal', C.muted); text(t('kpi.left'), lx, y + 7.5)
    font(22, 'bold', s.balance < 0 ? C.expenseText : C.ink); text(formatCurrency(s.balance), lx, y + 17.5)
    const of = s.savingsRate === null ? t('kpi.noIncome') : t('kpi.ofIncome', { pct: formatPercent(s.savingsRate, 1, false) })
    font(8, 'normal', C.muted); text(of, lx, y + 24.5)
    const ow = doc.getTextWidth(pdfText(of))
    delta(s.savingsRate !== null && p.savingsRate !== null ? s.savingsRate - p.savingsRate : null, true, true, lx + ow + 3, y + 24.5, 40)
    const colW = 42
    const cols = [
      { label: t('kpi.income'), value: s.income, d: pct(pctOf(s.income, p.income)), good: true },
      { label: t('kpi.expense'), value: s.expense, d: pct(pctOf(s.expense, p.expense)), good: false },
    ]
    cols.forEach((c, i) => {
      const x = R - 6 - colW * (cols.length - i)
      font(8, 'normal', C.muted); text(c.label, x, y + 7.5)
      font(12, 'bold', C.ink); text(formatCurrency(c.value), x, y + 15.5)
      delta(c.d, c.good, false, x, y + 22, colW - 2)
    })
    y += bandH + 11
  }

  // Gráfico mensal: gasto em barra neutra, receita como traço sobre a barra, sobra rotulada em cima
  // e o mês corrente com contorno vinho (o par verde/cinza lado a lado era o desenho antigo)
  const section = (title: string, sub?: string) => {
    font(11, 'bold', C.ink); text(title, L, y)
    if (sub) { font(8, 'normal', C.hint); text(sub, R, y, { align: 'right' }) }
    y += 4
  }
  const flowTitle = model.granularity === 'week' ? t('flow.titleWeek') : t('flow.titleMonth')
  ensure(84)
  section(flowTitle)
  // Legenda
  {
    font(7.5, 'normal', C.muted)
    const items: { label: string; draw: (x: number, yy: number) => void }[] = [
      { label: t('legend.expense'), draw: (x, yy) => { doc.setFillColor(...C.expense); doc.roundedRect(x, yy - 2.4, 2.6, 2.6, 0.5, 0.5, 'F') } },
      { label: t('legend.incomeTick'), draw: (x, yy) => { doc.setDrawColor(...C.income); doc.setLineWidth(0.7); doc.line(x - 0.4, yy - 1.1, x + 3, yy - 1.1) } },
    ]
    if (model.compare) items.push({ label: t('legend.previousShort'), draw: (x, yy) => { doc.setFillColor(...tint(C.expense, 0.55)); doc.roundedRect(x, yy - 2.4, 2.6, 2.6, 0.5, 0.5, 'F') } })
    let lx = R
    for (const it of items.slice().reverse()) {
      const w = doc.getTextWidth(pdfText(it.label))
      lx -= w
      font(7.5, 'normal', C.muted); text(it.label, lx, y - 4)
      lx -= 4.2
      it.draw(lx, y - 4)
      lx -= 5
    }
  }
  {
    const top = y + 6, chartH = 54, base = top + chartH
    const all = [...model.buckets.flatMap(b => [b.income, b.expense]), ...(model.compare ? model.prevBuckets.flatMap(b => [b.income, b.expense]) : [])]
    const ticks = niceTicks(Math.max(0, ...all))
    const yMax = ticks[ticks.length - 1] || 1
    font(7, 'normal', C.hint)
    const axisW = Math.max(...ticks.map(v => doc.getTextWidth(pdfText(axisMoney(v))))) + 3
    const x0 = L + axisW, pw = R - x0
    const yy = (v: number) => base - (v / yMax) * chartH
    ticks.forEach((v, i) => {
      hline(x0, R, yy(v), i === 0 ? C.lineStrong : C.grid, i === 0 ? 0.3 : 0.15)
      font(7, 'normal', C.hint); text(axisMoney(v), x0 - 2, yy(v) + 1, { align: 'right' })
    })
    const now = new Date()
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const n = model.buckets.length, band = pw / Math.max(1, n)
    const per = model.compare ? 2 : 1, gap = 1
    const bw = Math.max(0.8, Math.min(model.compare ? 6 : 9, (band * 0.6 - gap * (per - 1)) / per))
    const gw = bw * per + gap * (per - 1)
    const every = Math.max(1, Math.ceil(11 / band))
    model.buckets.forEach((b, i) => {
      let x = x0 + i * band + (band - gw) / 2
      const pb = model.prevBuckets[i]
      const items = model.compare
        ? [{ inc: pb?.income ?? 0, exp: pb?.expense ?? 0, faded: true }, { inc: b.income, exp: b.expense, faded: false }]
        : [{ inc: b.income, exp: b.expense, faded: false }]
      items.forEach(it => {
        const h = (it.exp / yMax) * chartH
        const r = Math.min(0.8, bw / 2, h / 2)
        if (h > 0.2) {
          doc.setFillColor(...(it.faded ? tint(C.expense, 0.55) : C.expense))
          doc.roundedRect(x, base - h, bw, h, r, r, 'F'); doc.rect(x, base - Math.min(h, 1), bw, Math.min(h, 1), 'F')
          if (!it.faded && b.key === nowKey) { doc.setDrawColor(...C.wine); doc.setLineWidth(0.35); doc.roundedRect(x, base - h, bw, h, r, r, 'S') }
        }
        if (it.inc > 0) {
          doc.setDrawColor(...(it.faded ? tint(C.income, 0.5) : C.income)); doc.setLineWidth(0.7)
          doc.line(x - 0.8, yy(it.inc), x + bw + 0.8, yy(it.inc))
        }
        if (!it.faded && !b.future && (it.inc > 0 || it.exp > 0) && band >= 11) {
          const net = it.inc - it.exp
          font(6.5, 'bold', net < 0 ? C.expenseText : C.text)
          text(axisMoney(net, true), x + bw / 2, Math.min(yy(it.inc), base - h) - 1.8, { align: 'center' })
        }
        x += bw + gap
      })
      if (i % every === 0) { font(7, 'normal', C.muted); text(b.label + (b.yearMark ? ` ${b.yearMark.slice(2)}` : ''), x0 + (i + 0.5) * band, base + 4.5, { align: 'center' }) }
    })
    y = base + 13
  }

  // Tabelas
  type Cell = string | { text: string; color?: RGB; bold?: boolean; swatch?: RGB }
  interface Col { header: string; width: number; align?: 'left' | 'right' }
  const table = (cols: Col[], rows: Cell[][], totals?: Cell[]) => {
    const rowH = 6.4
    const header = () => {
      font(7.5, 'bold', C.muted)
      let x = L
      cols.forEach(c => { text(c.header, c.align === 'right' ? x + c.width - 1 : x + 1, y + 4, { align: c.align === 'right' ? 'right' : 'left' }); x += c.width })
      hline(L, R, y + 6, C.lineStrong, 0.3)
      y += 6
    }
    const drawRow = (cells: Cell[], bold = false) => {
      let x = L
      cells.forEach((cell, i) => {
        const c = cols[i]
        const v = typeof cell === 'string' ? { text: cell } : cell
        font(8.5, bold || v.bold ? 'bold' : 'normal', v.color ?? C.text)
        let tx = c.align === 'right' ? x + c.width - 1 : x + 1
        if (v.swatch) { doc.setFillColor(...v.swatch); doc.roundedRect(tx, y + 2.2, 2.4, 2.4, 0.5, 0.5, 'F'); tx += 4 }
        text(v.text, tx, y + 4.4, { align: c.align === 'right' ? 'right' : 'left', maxWidth: c.width - 2 - (v.swatch ? 4 : 0) })
        x += c.width
      })
      y += rowH
    }
    header()
    rows.forEach((r, i) => {
      if (y + rowH > BOTTOM) { newPage(); header() }
      drawRow(r)
      if (i < rows.length - 1) hline(L, R, y, C.grid, 0.15)
    })
    if (totals) {
      if (y + rowH > BOTTOM) { newPage(); header() }
      hline(L, R, y, C.ink, 0.3)
      drawRow(totals, true)
    }
    y += 9
  }
  const changeCell = (v: number | null, goodWhenUp: boolean): Cell => {
    if (v === null || !Number.isFinite(v)) return { text: '—', color: C.hint }
    const flat = Math.abs(v) < 0.05
    const tone = variationTone(v, goodWhenUp)
    // Uma casa fixa com sinal; de +100% para cima, múltiplo ("×5,9")
    const text = flat ? '0%' : v >= 100 ? changeText(v) : `${v > 0 ? '+' : '−'}${changeText(v)}`
    return { text, color: tone === 'good' ? C.incomeText : tone === 'bad' ? C.expenseText : C.muted }
  }

  if (model.categories.length) {
    ensure(30)
    section(t('categories.title'), t('categories.summary', { count: model.categories.length, total: formatCurrency(s.expense) }))
    y += 1
    const cols: Col[] = model.compare
      ? [{ header: t('table.category'), width: 62 }, { header: t('table.count'), width: 22, align: 'right' }, { header: t('table.value'), width: 30, align: 'right' }, { header: t('table.share'), width: 18, align: 'right' }, { header: t('table.previous'), width: 26, align: 'right' }, { header: t('table.change'), width: 20, align: 'right' }]
      : [{ header: t('table.category'), width: 96 }, { header: t('table.count'), width: 24, align: 'right' }, { header: t('table.value'), width: 34, align: 'right' }, { header: t('table.share'), width: 24, align: 'right' }]
    const rows: Cell[][] = model.categories.map(c => {
      const base: Cell[] = [{ text: c.name, swatch: hexRgb(c.printHex) }, String(c.count), formatCurrency(c.value), formatPercent(c.share, 1, false)]
      return model.compare ? [...base, c.prev ? formatCurrency(c.prev) : '—', c.prev ? changeCell(c.change, false) : { text: t('categories.new'), color: C.hint }] : base
    })
    const totalCount = model.categories.reduce((a, c) => a + c.count, 0)
    const totals: Cell[] = [t('table.total'), String(totalCount), formatCurrency(s.expense), formatPercent(100, 0, false)]
    table(cols, rows, model.compare ? [...totals, formatCurrency(model.prevSummary.expense), changeCell(pctOf(s.expense, model.prevSummary.expense), false)] : totals)
  }

  {
    ensure(30)
    section(model.granularity === 'week' ? t('table.byWeek') : t('table.byMonth'))
    y += 1
    const cols: Col[] = [{ header: model.granularity === 'week' ? t('table.week') : t('table.month'), width: 52 }, { header: t('table.income'), width: 32, align: 'right' }, { header: t('table.expense'), width: 32, align: 'right' }, { header: t('table.balance'), width: 34, align: 'right' }, { header: t('table.savings'), width: 28, align: 'right' }]
    const rows: Cell[][] = model.buckets.map(b => {
      const bal = b.income - b.expense
      return [b.longLabel, formatCurrency(b.income), formatCurrency(b.expense), { text: formatCurrency(bal), color: bal < 0 ? C.expenseText : C.text }, b.income > 0 ? formatPercent((bal / b.income) * 100, 1, false) : '—']
    })
    table(cols, rows, [t('table.total'), formatCurrency(s.income), formatCurrency(s.expense), { text: formatCurrency(s.balance), color: s.balance < 0 ? C.expenseText : C.ink }, s.savingsRate === null ? '—' : formatPercent(s.savingsRate, 1, false)])
  }

  if (model.top.length) {
    ensure(30)
    section(t('top.title'), t('top.subtitle'))
    y += 1
    const cols: Col[] = [{ header: '#', width: 8 }, { header: t('table.description'), width: 70 }, { header: t('table.category'), width: 40 }, { header: t('table.count'), width: 26, align: 'right' }, { header: t('table.value'), width: 34, align: 'right' }]
    table(cols, model.top.map((r, i) => [{ text: String(i + 1), color: C.hint }, r.description, r.category, String(r.count), formatCurrency(r.value)]))
  }

  ensure(8)
  font(7.5, 'normal', C.hint); text(t('kpi.transfersNote'), L, y - 3)

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    hline(L, R, H - 14, C.line, 0.3)
    const fy = H - 9
    doc.setFont('courier', 'bold'); doc.setFontSize(8)
    doc.setTextColor(...C.brand); doc.text('AFN', L, fy, { charSpace: 0.45 })
    const fx = L + doc.getTextWidth('AFN') + 0.45 * 3 + 1.2
    doc.setTextColor(...C.brandGray); doc.text('SYSTEMS', fx, fy, { charSpace: 0.45 })
    font(7.5, 'normal', C.hint); text(t('pdf.page', { current: i, total: pages }), R, fy, { align: 'right' })
  }

  doc.setProperties({ title: `FlowTrack — ${t('pdf.docTitle')} — ${pdfText(model.rangeText)}`, subject: model.periodLabel, author: 'FlowTrack', creator: 'FlowTrack · AFN SYSTEMS', keywords: 'flowtrack, finanças, relatório' })
  downloadBlob(doc.output('blob'), `${fileBase(model.range)}.pdf`)
}

const round2 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100)

function pctOf(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

// ── Transações (Excel e CSV) ──────────────────────────────
function transactionColumns(): XlsxColumn[] {
  return [
    { header: t('table.date'), type: 'date', width: 12 },
    { header: t('table.description'), width: 40 },
    { header: t('table.category'), width: 20 },
    { header: t('table.account'), width: 20 },
    { header: t('table.type'), width: 16 },
    { header: t('table.value'), type: 'currency', width: 16 },
  ]
}

function transactionRows(txs: Transaction[], categories: Category[], accounts: Account[]): XlsxValue[][] {
  const cat = new Map(categories.map(c => [c.id, c]))
  const acc = new Map(accounts.map(a => [a.id, a.name]))
  const noCat = i18n.t('common.noCategory') as string
  return txs
    .slice()
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.description.localeCompare(b.description))
    .map(tx => [
      tx.transaction_date,
      tx.description,
      categoryLabel(cat.get(shownCategoryId(tx, categories) ?? ''), noCat),
      acc.get(tx.account_id) ?? '',
      tx.type === 'transfer' ? t('table.typeTransfer') : tx.amount >= 0 ? t('table.typeIncome') : t('table.typeExpense'),
      tx.amount,
    ])
}

export function exportCsv(model: ReportModel, categories: Category[], accounts: Account[]) {
  const blob = buildCsv(transactionColumns(), transactionRows(model.transactions, categories, accounts), currentLocale())
  downloadBlob(blob, `${fileBase(model.range)}.csv`)
}

export function exportXlsx(model: ReportModel, categories: Category[], accounts: Account[]) {
  const s = model.summary, p = model.prevSummary
  const subtitle = `${model.periodLabel} · ${model.rangeText} · ${t('print.generated', { date: generatedAt() })}`
  const title = `FlowTrack — ${t('pdf.docTitle')}`
  const flowRows = model.buckets.map(b => [b.longLabel, b.income, b.expense, round2(b.income - b.expense), b.income > 0 ? round2(((b.income - b.expense) / b.income) * 100) : null])
  const sheets = [
    {
      name: t('xlsx.summary'), title, subtitle,
      columns: [
        { header: t('xlsx.period'), width: 22 }, { header: t('xlsx.start'), type: 'date' as const, width: 12 }, { header: t('xlsx.end'), type: 'date' as const, width: 12 },
        { header: t('table.income'), type: 'currency' as const, width: 16 }, { header: t('table.expense'), type: 'currency' as const, width: 16 }, { header: t('table.balance'), type: 'currency' as const, width: 16 },
        { header: t('kpi.savings'), type: 'percent' as const, width: 18 }, { header: t('table.count'), type: 'integer' as const, width: 13 },
      ],
      rows: [
        [t('xlsx.current'), model.range.start, model.range.end, s.income, s.expense, s.balance, round2(s.savingsRate), s.count],
        ...(model.hasPrev ? [[t('xlsx.previous'), model.prevRange.start, model.prevRange.end, p.income, p.expense, p.balance, round2(p.savingsRate), p.count]] : []),
      ] as XlsxValue[][],
    },
    {
      name: t('categories.title'), title: t('categories.title'), subtitle,
      columns: [
        { header: t('table.category'), width: 26 }, { header: t('table.count'), type: 'integer' as const, width: 13 }, { header: t('table.value'), type: 'currency' as const, width: 16 },
        { header: t('table.share'), type: 'percent' as const, width: 12 }, { header: t('table.previous'), type: 'currency' as const, width: 18 }, { header: t('table.change'), type: 'percent' as const, width: 12 },
      ],
      rows: model.categories.map(c => [c.name, c.count, c.value, round2(c.share), c.prev || null, c.prev ? round2(c.change) : null]),
      totals: [t('table.total'), model.categories.reduce((a, c) => a + c.count, 0), s.expense, 100, model.hasPrev ? p.expense : '', model.hasPrev ? round2(pctOf(s.expense, p.expense)) ?? '' : ''],
    },
    {
      name: model.granularity === 'week' ? t('table.byWeek') : t('table.byMonth'), title: model.granularity === 'week' ? t('table.byWeek') : t('table.byMonth'), subtitle,
      columns: [
        { header: model.granularity === 'week' ? t('table.week') : t('table.month'), width: 24 }, { header: t('table.income'), type: 'currency' as const, width: 16 },
        { header: t('table.expense'), type: 'currency' as const, width: 16 }, { header: t('table.balance'), type: 'currency' as const, width: 16 }, { header: t('table.savings'), type: 'percent' as const, width: 14 },
      ],
      rows: flowRows as XlsxValue[][],
      totals: [t('table.total'), s.income, s.expense, s.balance, round2(s.savingsRate) ?? ''],
    },
    {
      name: t('xlsx.transactions'), title: t('xlsx.transactions'), subtitle: `${subtitle} · ${t('xlsx.transfersNote')}`,
      columns: transactionColumns(),
      rows: transactionRows(model.transactions, categories, accounts),
      totals: [t('xlsx.netTotal'), '', '', '', '', s.balance],
    },
  ]
  downloadBlob(buildXlsx(sheets, { title, author: 'FlowTrack', locale: currentLocale() }), `${fileBase(model.range)}.xlsx`)
}
