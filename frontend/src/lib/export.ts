// ── CSV e download de arquivos ────────────────────────────
// CSV no padrão que o Excel brasileiro abre direto: ponto e vírgula,
// vírgula decimal, data dd/mm/aaaa e BOM UTF-8 (acentos corretos).
// Em inglês usa vírgula como separador e ponto decimal.
import type { XlsxColumn, XlsxValue } from './xlsx'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildCsv(columns: XlsxColumn[], rows: XlsxValue[][], locale: string): Blob {
  const pt = !locale.startsWith('en')
  const sep = pt ? ';' : ','
  const num = (v: number, decimals: number) => {
    const s = v.toFixed(decimals)
    return pt ? s.replace('.', ',') : s
  }
  const fmt = (v: XlsxValue, type: XlsxColumn['type']): string => {
    if (v === null || v === undefined) return ''
    if (type === 'date' && (typeof v === 'string' || v instanceof Date)) {
      const d = typeof v === 'string' ? new Date(v.length <= 10 ? v + 'T00:00:00' : v) : v
      const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0')
      return pt ? `${dd}/${mm}/${d.getFullYear()}` : `${d.getFullYear()}-${mm}-${dd}`
    }
    if (typeof v === 'number') return type === 'integer' ? String(Math.round(v)) : num(v, 2)
    return String(v)
  }
  const quote = (s: string) => (s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [columns.map(c => quote(c.header)).join(sep), ...rows.map(r => columns.map((c, i) => quote(fmt(r[i], c.type))).join(sep))]
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

// "14 de outubro de 2026 às 10:32": a mesma data de geração em todas as exportações
export function generatedAt(locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())
}

// "flowtrack-transacoes-2026-10-02" / "flowtrack-transactions-2026-10-02"
export function exportFileName(base: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `flowtrack-${base}-${stamp}`
}
