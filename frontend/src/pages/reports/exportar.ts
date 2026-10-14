// ── Relatórios: exportações (PDF, Excel e CSV) ────────────
// O PDF é vetorial (jsPDF): texto selecionável, tabelas e um gráfico de
// barras desenhado com as primitivas da própria biblioteca.
import i18n from '../../i18n'
import { buildXlsx, type XlsxColumn, type XlsxValue } from '../../lib/xlsx'
import { buildCsv, downloadBlob, generatedAt as generatedAtFor } from '../../lib/export'
import { categoryLabel, currentLocale, formatCurrency, formatPercent } from '../../utils'
import type { Account, Category, Transaction } from '../../types'
import { axisMoney, niceTicks, type Bucket, type CategoryRow, type Granularity, type Range, type Summary, type TopRow } from './dados'

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
// Mesma ordem das cores dos gráficos no tema claro
// Mesma ordem de --chart-1..8 no tema claro (paleta validada)
const SERIES: RGB[] = [[42, 120, 214], [235, 104, 52], [27, 175, 122], [237, 161, 0], [232, 123, 164], [0, 131, 0], [74, 58, 167], [142, 142, 153]]
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
  font(15, 'bold', C.wine); text('FlowTrack', L, y)
  font(8.5, 'normal', C.hint); text(t('print.generated', { date: generatedAt() }), R, y, { align: 'right' })
  hline(L, R, y + 4, C.line, 0.3)
  y = 34
  font(18, 'bold', C.ink); text(t('pdf.docTitle'), L, y)
  y += 7
  font(10, 'normal', C.text); text(`${model.periodLabel} · ${model.rangeText}`, L, y)
  if (model.compare) { y += 5; font(8.5, 'normal', C.muted); text(t('compare.with', { range: model.prevRangeText }), L, y) }

  // Cartões de resumo
  y += 7
  const cardW = (CW - 3 * 4) / 4, cardH = 25
  const s = model.summary, p = model.prevSummary
  const cards: { label: string; value: string; delta: number | null; good: boolean; pp?: boolean; dot?: RGB }[] = [
    { label: t('kpi.income'), value: formatCurrency(s.income), delta: pct(pctOf(s.income, p.income)), good: true, dot: C.income },
    { label: t('kpi.expense'), value: formatCurrency(s.expense), delta: pct(pctOf(s.expense, p.expense)), good: false, dot: C.expense },
    { label: t('kpi.balance'), value: formatCurrency(s.balance), delta: pct(pctOf(s.balance, p.balance)), good: true },
    { label: t('kpi.savings'), value: s.savingsRate === null ? '—' : formatPercent(s.savingsRate, 1, false), delta: s.savingsRate !== null && p.savingsRate !== null ? s.savingsRate - p.savingsRate : null, good: true, pp: true },
  ]
  cards.forEach((c, i) => {
    const x = L + i * (cardW + 4)
    doc.setFillColor(...C.card); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
    if (c.dot) { doc.setFillColor(...c.dot); doc.roundedRect(x + 4, y + 4.3, 2.2, 2.2, 0.4, 0.4, 'F') }
    font(7.5, 'normal', C.muted); text(c.label, x + (c.dot ? 7.6 : 4), y + 6.5)
    let size = 13
    font(size, 'bold', C.ink)
    while (size > 9 && doc.getTextWidth(pdfText(c.value)) > cardW - 8) { size -= 0.5; doc.setFontSize(size) }
    text(c.value, x + 4, y + 14)
    if (!model.hasPrev || c.delta === null) {
      font(7, 'normal', C.hint); text(model.hasPrev ? t('kpi.noBase') : t('kpi.noPrev'), x + 4, y + 20.5, { maxWidth: cardW - 8 })
    } else {
      const flat = Math.abs(c.delta) < 0.05
      const color = flat ? C.muted : (c.delta > 0) === c.good ? C.incomeText : C.expenseText
      doc.setFillColor(...color)
      const tx = x + 4, ty = y + 20.5
      if (!flat) {
        if (c.delta > 0) doc.triangle(tx, ty - 0.2, tx + 2.4, ty - 0.2, tx + 1.2, ty - 2.3, 'F')
        else doc.triangle(tx, ty - 2.3, tx + 2.4, ty - 2.3, tx + 1.2, ty - 0.2, 'F')
      }
      const v = flat ? '0%' : c.pp ? t('kpi.pp', { value: formatPercent(Math.abs(c.delta), 1, false).replace(/\s?%/, '') }) : formatPercent(Math.abs(c.delta), Math.abs(c.delta) >= 100 ? 0 : 1, false)
      font(7.5, 'bold', color); text(v, tx + (flat ? 0 : 3.4), ty)
      const vw = doc.getTextWidth(pdfText(v))
      font(7, 'normal', C.hint); text(t('pdf.vsPrev'), tx + (flat ? 0 : 3.4) + vw + 1.5, ty, { maxWidth: cardW - 12 - vw })
    }
  })
  y += cardH + 11

  // Gráfico de barras
  const section = (title: string, sub?: string) => {
    font(11, 'bold', C.ink); text(title, L, y)
    if (sub) { font(8, 'normal', C.hint); text(sub, R, y, { align: 'right' }) }
    y += 4
  }
  const flowTitle = model.granularity === 'week' ? t('flow.titleWeek') : t('flow.titleMonth')
  ensure(80)
  section(flowTitle)
  // Legenda
  {
    const items: [string, RGB][] = [[t('legend.income'), C.income], [t('legend.expense'), C.expense]]
    if (model.compare) items.push([t('legend.previousShort'), tint(C.text, 0.55)])
    font(7.5, 'normal', C.muted)
    let lx = R
    for (const [label, color] of items.slice().reverse()) {
      const w = doc.getTextWidth(pdfText(label))
      lx -= w
      text(label, lx, y - 4)
      lx -= 4
      doc.setFillColor(...color); doc.roundedRect(lx, y - 6.4, 2.6, 2.6, 0.5, 0.5, 'F')
      lx -= 5
    }
  }
  {
    const top = y + 3, chartH = 54, base = top + chartH
    const all = [...model.buckets.flatMap(b => [b.income, b.expense]), ...(model.compare ? model.prevBuckets.flatMap(b => [b.income, b.expense]) : [])]
    const ticks = niceTicks(Math.max(0, ...all))
    const yMax = ticks[ticks.length - 1] || 1
    font(7, 'normal', C.hint)
    const axisW = Math.max(...ticks.map(v => doc.getTextWidth(pdfText(axisMoney(v))))) + 3
    const x0 = L + axisW, pw = R - x0
    const yy = (v: number) => base - (v / yMax) * chartH
    ticks.forEach((v, i) => {
      hline(x0, R, yy(v), i === 0 ? C.lineStrong : C.grid, i === 0 ? 0.3 : 0.15)
      text(axisMoney(v), x0 - 2, yy(v) + 1, { align: 'right' })
    })
    const n = model.buckets.length, band = pw / Math.max(1, n)
    const per = model.compare ? 4 : 2, gap = 0.5, pairGap = model.compare ? 1 : 0
    const bw = Math.max(0.6, Math.min(model.compare ? 4 : 6, (band * 0.7 - gap * (per - 1) - pairGap) / per))
    const gw = bw * per + gap * (per - 1) + pairGap
    const every = Math.max(1, Math.ceil(11 / band))
    model.buckets.forEach((b, i) => {
      let x = x0 + i * band + (band - gw) / 2
      const pb = model.prevBuckets[i]
      const bars: [number, RGB][] = model.compare
        ? [[pb?.income ?? 0, tint(C.income)], [b.income, C.income], [pb?.expense ?? 0, tint(C.expense)], [b.expense, C.expense]]
        : [[b.income, C.income], [b.expense, C.expense]]
      bars.forEach(([v, color], j) => {
        const h = (v / yMax) * chartH
        if (h > 0.2) { doc.setFillColor(...color); doc.roundedRect(x, base - h, bw, h, Math.min(0.8, bw / 2, h / 2), Math.min(0.8, bw / 2, h / 2), 'F'); doc.rect(x, base - Math.min(h, 1), bw, Math.min(h, 1), 'F') }
        x += bw + gap + (model.compare && j === 1 ? pairGap : 0)
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
    return { text: flat ? '0%' : formatPercent(v, 1, true), color: flat ? C.muted : (v > 0) === goodWhenUp ? C.incomeText : C.expenseText }
  }

  if (model.categories.length) {
    ensure(30)
    section(t('categories.title'), t('categories.summary', { count: model.categories.length, total: formatCurrency(s.expense) }))
    y += 1
    const cols: Col[] = model.compare
      ? [{ header: t('table.category'), width: 62 }, { header: t('table.count'), width: 22, align: 'right' }, { header: t('table.value'), width: 30, align: 'right' }, { header: t('table.share'), width: 18, align: 'right' }, { header: t('table.previous'), width: 26, align: 'right' }, { header: t('table.change'), width: 20, align: 'right' }]
      : [{ header: t('table.category'), width: 96 }, { header: t('table.count'), width: 24, align: 'right' }, { header: t('table.value'), width: 34, align: 'right' }, { header: t('table.share'), width: 24, align: 'right' }]
    const rows: Cell[][] = model.categories.map((c, i) => {
      const base: Cell[] = [{ text: c.name, swatch: model.categories.length <= 6 || i < 5 ? hexRgb(c.printHex) : SERIES[7] }, String(c.count), formatCurrency(c.value), formatPercent(c.share, 1, false)]
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
    let fx = L + doc.getTextWidth('AFN') + 0.45 * 3 + 1.2
    doc.setTextColor(...C.brandGray); doc.text('SYSTEMS', fx, fy, { charSpace: 0.45 })
    fx += doc.getTextWidth('SYSTEMS') + 0.45 * 7 + 2.4
    doc.text('|', fx, fy); fx += doc.getTextWidth('|') + 2.4
    doc.text('FlowTrack', fx, fy, { charSpace: 0.1 })
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
      tx.category_id && cat.has(tx.category_id) ? categoryLabel(cat.get(tx.category_id), noCat) : noCat,
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
