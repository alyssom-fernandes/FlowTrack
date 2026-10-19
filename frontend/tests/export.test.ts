// CSV exportado no navegador: texto com cara de fórmula ganha apóstrofo; números e datas não mudam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, csvSafe } from '../src/lib/export.ts'
import type { XlsxColumn } from '../src/lib/xlsx.ts'

test('csvSafe neutraliza = + - @ tab e CR no início', () => {
  for (const s of ['=1+1', '+55', '-cmd', '@SUM(A1)', '\tx', '\rx']) assert.equal(csvSafe(s), `'${s}`)
  for (const s of ['MERCADO EXEMPLO', '', 'a=b', '1-2']) assert.equal(csvSafe(s), s)
})

test('buildCsv protege a descrição e mantém o valor negativo como número', async () => {
  const columns: XlsxColumn[] = [
    { header: 'Data', type: 'date' },
    { header: 'Descrição' },
    { header: 'Valor', type: 'currency' },
  ]
  const rows = [['2026-10-02', '=HYPERLINK("http://exemplo.invalid")', -50], ['2026-10-03', 'MERCADO EXEMPLO', 12.5]]
  const text = (await buildCsv(columns, rows, 'pt-BR').text()).replace(/^\uFEFF/, '')
  const lines = text.split('\r\n')
  assert.equal(lines[0], 'Data;Descrição;Valor')
  assert.equal(lines[1], `02/10/2026;"'=HYPERLINK(""http://exemplo.invalid"")";-50,00`)
  assert.equal(lines[2], '03/10/2026;MERCADO EXEMPLO;12,50')
})

test('em inglês usa vírgula e ponto decimal, com a mesma proteção', async () => {
  const text = (await buildCsv([{ header: 'Description' }, { header: 'Amount', type: 'currency' }], [['@cmd', -1.5]], 'en-US').text()).replace(/^\uFEFF/, '')
  assert.equal(text.split('\r\n')[1], "'@cmd,-1.50")
})
