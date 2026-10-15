// ── Exportação no navegador (CSV e Excel), respeitando os filtros ──
import i18n from '../../i18n'
import { buildCsv, downloadBlob, exportFileName, generatedAt } from '../../lib/export'
import { buildXlsx, type XlsxColumn, type XlsxValue } from '../../lib/xlsx'
import { categoryLabel, currentLocale, formatDate } from '../../utils'
import type { Account, Category, Transaction } from '../../types'
import { fetchAll, NO_CATEGORY, periodRange, sumFlows, type Filters } from './shared'
import { shownCategoryId } from '../../lib/review'

export type ExportFormat = 'csv' | 'xlsx'

const tr = (key: string, opts?: Record<string, unknown>) => i18n.t(`transactions.export.${key}`, opts ?? {})

// "Período: 01/09/2026 a 30/09/2026 · Conta: Nubank · Gerado em 02/10/2026"
export function describeFilters(f: Filters, accounts: Account[], categories: Category[]): string {
  const { start, end } = periodRange(f)
  const period = start && end ? tr('range', { from: formatDate(start), to: formatDate(end) })
    : start ? tr('since', { date: formatDate(start) })
    : end ? tr('until', { date: formatDate(end) })
    : tr('allTime')
  const parts = [tr('period', { value: period })]
  const acc = accounts.find(a => a.id === f.account_id)
  if (acc) parts.push(tr('account', { value: acc.name }))
  if (f.category_id === NO_CATEGORY) parts.push(tr('category', { value: tr('uncategorized') }))
  else {
    const cat = categories.find(c => c.id === f.category_id)
    if (cat) parts.push(tr('category', { value: categoryLabel(cat) }))
  }
  if (f.type) parts.push(tr('type', { value: tr(f.type === 'credit' ? 'typeCredit' : f.type === 'debit' ? 'typeDebit' : 'typeTransfer') }))
  if (f.tag) parts.push(tr('tag', { value: `#${f.tag}` }))
  if (f.search.trim()) parts.push(tr('search', { value: f.search.trim() }))
  parts.push(tr('generated', { date: generatedAt(currentLocale()) }))
  return parts.join(' · ')
}

export async function exportTransactions(format: ExportFormat, filters: Filters, accounts: Account[], categories: Category[]): Promise<number> {
  const txs: Transaction[] = await fetchAll(filters)
  if (!txs.length) return 0
  const accName = new Map(accounts.map(a => [a.id, a.name]))
  const catById = new Map(categories.map(c => [c.id, c]))
  const columns: XlsxColumn[] = [
    { header: tr('colDate'), type: 'date', width: 12 },
    { header: tr('colDescription'), type: 'text', width: 40 },
    { header: tr('colCategory'), type: 'text', width: 18 },
    { header: tr('colAccount'), type: 'text', width: 20 },
    { header: tr('colType'), type: 'text', width: 14 },
    { header: tr('colAmount'), type: 'currency', width: 16 },
    { header: tr('colTags'), type: 'text', width: 20 },
    { header: tr('colNotes'), type: 'text', width: 36 },
  ]
  const typeName = (t: Transaction) => tr(t.type === 'transfer' ? 'typeTransfer' : t.amount > 0 ? 'typeCredit' : 'typeDebit')
  const rows: XlsxValue[][] = txs.map(t => {
    // Mesma regra da lista: o "Outros" que a IA deu por falta de opção sai como sem categoria
    const cat = catById.get(shownCategoryId(t, categories) ?? '')
    return [
      t.transaction_date,
      t.description,
      cat ? categoryLabel(cat) : tr('uncategorized'),
      accName.get(t.account_id) ?? '',
      typeName(t),
      t.amount,
      (t.tags || []).map(tag => `#${tag}`).join(', '),
      t.notes ?? '',
    ]
  })
  const name = exportFileName(tr('fileBase'))

  if (format === 'csv') {
    downloadBlob(buildCsv(columns, rows, currentLocale()), `${name}.csv`)
    return txs.length
  }

  const flows = sumFlows(txs)
  const blob = buildXlsx([{
    name: tr('sheetName'),
    title: tr('sheetTitle'),
    subtitle: describeFilters(filters, accounts, categories),
    columns,
    rows,
    // Totais em células numéricas (dá para usar em fórmulas); transferências ficam fora
    totals: [
      [tr('totalIncome'), '', '', '', '', flows.income, '', ''],
      [tr('totalExpense'), '', '', '', '', -flows.expense, '', ''],
      [tr('net'), '', '', '', '', flows.net, '', ''],
    ],
  }], { title: tr('sheetTitle'), author: 'FlowTrack', locale: currentLocale() })
  downloadBlob(blob, `${name}.xlsx`)
  return txs.length
}
