// ── Leitura de extratos em CSV ────────────────────────────
// Separador detectado (; , tab |), campos entre aspas, datas em vários
// formatos e valores com vírgula ou ponto decimal.
import type { ParsedTransaction } from '../../types'
import { parseAmount } from './shared'

export interface CsvTable { headers: string[]; rows: string[][] }

function detectDelimiter(firstLine: string): string {
  const count = (d: string) => {
    let n = 0, quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) n++
    }
    return n
  }
  return [';', ',', '\t', '|'].reduce((best, d) => (count(d) > count(best) ? d : best), ',')
}

export function parseCsv(raw: string): CsvTable {
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const delim = detectDelimiter(text.split(/\r?\n/, 1)[0] || '')
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(field.trim()); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim()); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field.trim())
  if (row.some(v => v !== '')) rows.push(row)
  const [headers = [], ...data] = rows
  // Cabeçalhos repetidos ou vazios ganham um nome único
  const seen = new Map<string, number>()
  const unique = headers.map((h, i) => {
    const base = h || `Col. ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base} (${n})` : base
  })
  return { headers: unique, rows: data }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export interface CsvMapping { date: string; desc: string; amount: string; credit: string; debit: string; split: boolean }

export function guessMapping(headers: string[]): CsvMapping {
  const lower = headers.map(norm)
  const find = (pats: RegExp[]) => headers.find((_, i) => pats.some(p => p.test(lower[i]))) || ''
  const date = find([/^data/, /\bdate\b/, /\bdt\b/, /lancamento/, /posted/])
  const desc = find([/descri/, /hist/, /\bmemo\b/, /complemento/, /titulo/, /title/, /estabelecimento/, /payee/, /details/])
  const amount = find([/^valor/, /^amount/, /^value/, /quantia/, /montante/])
  const credit = find([/credito/, /\bcredit\b/, /entrada/])
  const debit = find([/debito/, /\bdebit\b/, /saida/])
  const split = !!(credit && debit && !amount)
  return { date, desc, amount, credit: split ? credit : '', debit: split ? debit : '', split }
}

// Decide se as datas com barra estão em dia/mês ou mês/dia olhando a coluna toda
export function dateOrder(values: string[]): 'dmy' | 'mdy' {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/)
    if (!m) continue
    if (Number(m[1]) > 12) return 'dmy'
    if (Number(m[2]) > 12) return 'mdy'
  }
  return 'dmy'
}

export function parseDate(raw: string, order: 'dmy' | 'mdy' = 'dmy'): string | null {
  const s = raw.trim()
  let y: number, m: number, d: number
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (match) { y = +match[1]; m = +match[2]; d = +match[3] }
  else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    const a = +match[1], b = +match[2]
    y = match[3].length === 2 ? 2000 + +match[3] : +match[3]
    if (order === 'mdy') { m = a; d = b } else { d = a; m = b }
  } else if ((match = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +match[1]; m = +match[2]; d = +match[3] }
  else return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Valores como "(45,90)" ou "45,90 D" também são saídas
export function parseCsvAmount(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN
  const negative = /^\(.*\)$/.test(s) || /\s?D$/i.test(s)
  const v = parseAmount(s.replace(/[()]/g, '').replace(/\s?[CD]$/i, ''))
  return negative ? -Math.abs(v) : v
}

export type RowIssue = 'date' | 'description' | 'amount'
export interface CsvRowResult { tx?: ParsedTransaction; issue?: RowIssue; raw: string[] }

export function interpret(table: CsvTable, map: CsvMapping): CsvRowResult[] {
  const col = (name: string) => table.headers.indexOf(name)
  const iDate = col(map.date), iDesc = col(map.desc), iAmt = col(map.amount), iCred = col(map.credit), iDeb = col(map.debit)
  const order = dateOrder(table.rows.map(r => r[iDate] ?? ''))
  return table.rows.map(r => {
    const date = iDate >= 0 ? parseDate(r[iDate] ?? '', order) : null
    if (!date) return { issue: 'date', raw: r }
    const description = (iDesc >= 0 ? r[iDesc] ?? '' : '').trim()
    if (!description) return { issue: 'description', raw: r }
    let amount: number
    if (map.split) {
      const c = iCred >= 0 ? parseCsvAmount(r[iCred] ?? '') : NaN
      const d = iDeb >= 0 ? parseCsvAmount(r[iDeb] ?? '') : NaN
      amount = Number.isFinite(c) && c !== 0 ? Math.abs(c) : Number.isFinite(d) && d !== 0 ? -Math.abs(d) : NaN
    } else amount = iAmt >= 0 ? parseCsvAmount(r[iAmt] ?? '') : NaN
    if (!Number.isFinite(amount) || amount === 0) return { issue: 'amount', raw: r }
    amount = Math.round(amount * 100) / 100
    return { tx: { description: description.slice(0, 200), amount, transaction_date: date, type: amount > 0 ? 'credit' : 'debit' }, raw: r }
  })
}
