// ── Gerador de .xlsx sem dependência ──────────────────────
// Monta uma planilha OOXML de verdade (abre no Excel, LibreOffice e
// Google Planilhas) com título, cabeçalho formatado, moeda, datas,
// larguras de coluna, cabeçalho congelado, filtro e linha de totais.
// O .zip é gravado sem compressão (método "store"), o que basta aqui.

export type XlsxCellType = 'text' | 'currency' | 'number' | 'integer' | 'date' | 'percent'
export type XlsxValue = string | number | Date | null | undefined

export interface XlsxColumn {
  header: string
  type?: XlsxCellType
  width?: number // em caracteres
}

export interface XlsxSheet {
  name: string
  title?: string
  subtitle?: string
  columns: XlsxColumn[]
  rows: XlsxValue[][]
  totals?: XlsxValue[] // linha final em negrito (use '' nas colunas sem total)
}

// Índices de estilo (cellXfs em styles.xml)
const S = { text: 0, header: 1, currency: 2, date: 3, percent: 4, bold: 5, boldCurrency: 6, title: 7, muted: 8, number: 9, integer: 10, boldNumber: 11 }

// Escapa o XML e remove caracteres de controle, que o formato não aceita
const esc = (s: string) => Array.from(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))
  .filter(ch => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13 }).join('')

function colName(i: number): string {
  let n = i + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// Data → número de série do Excel (dias desde 1899-12-30, sem fuso)
function excelDate(v: Date | string): number {
  const d = typeof v === 'string' ? new Date(v.length <= 10 ? v + 'T00:00:00' : v) : v
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return utc / 86_400_000 + 25569
}

function cell(ref: string, value: XlsxValue, type: XlsxCellType | undefined, style?: number): string {
  if (value === null || value === undefined || value === '') return ''
  const t = type || 'text'
  if (t === 'date' && (value instanceof Date || typeof value === 'string')) {
    return `<c r="${ref}" s="${style ?? S.date}"><v>${excelDate(value)}</v></c>`
  }
  if (typeof value === 'number' && t !== 'text') {
    const st = style ?? (t === 'currency' ? S.currency : t === 'percent' ? S.percent : t === 'integer' ? S.integer : S.number)
    const v = t === 'percent' ? value / 100 : value
    return `<c r="${ref}" s="${st}"><v>${Number.isFinite(v) ? v : 0}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr" s="${style ?? S.text}"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`
}

function sheetXml(sheet: XlsxSheet): string {
  const rows: string[] = []
  let r = 1
  if (sheet.title) { rows.push(`<row r="${r}" ht="22" customHeight="1">${cell(`A${r}`, sheet.title, 'text', S.title)}</row>`); r++ }
  if (sheet.subtitle) { rows.push(`<row r="${r}">${cell(`A${r}`, sheet.subtitle, 'text', S.muted)}</row>`); r++ }
  if (sheet.title || sheet.subtitle) r++ // linha em branco
  const headerRow = r
  rows.push(`<row r="${r}" ht="20" customHeight="1">${sheet.columns.map((c, i) => cell(`${colName(i)}${r}`, c.header, 'text', S.header)).join('')}</row>`)
  r++
  for (const row of sheet.rows) {
    rows.push(`<row r="${r}">${sheet.columns.map((c, i) => cell(`${colName(i)}${r}`, row[i], c.type)).join('')}</row>`)
    r++
  }
  const lastDataRow = r - 1
  if (sheet.totals) {
    rows.push(`<row r="${r}">${sheet.columns.map((c, i) => {
      const v = sheet.totals![i]
      const st = typeof v === 'number' ? (c.type === 'currency' ? S.boldCurrency : S.boldNumber) : S.bold
      return cell(`${colName(i)}${r}`, v, typeof v === 'number' ? (c.type === 'percent' ? 'percent' : c.type || 'number') : 'text', st)
    }).join('')}</row>`)
  }
  const lastCol = colName(sheet.columns.length - 1)
  const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(10, Math.min(48, c.header.length + 4))}" customWidth="1"/>`).join('')
  const filter = sheet.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastDataRow}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${filter}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
<numFmt numFmtId="167" formatCode="#,##0.00"/>
</numFmts>
<fonts count="5">
<font><sz val="11"/><color rgb="FF1F1F23"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1F1F23"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF9D2449"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6F6F78"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF9D2449"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE4E4E8"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9D2449"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="167" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha'
  let n = 2
  while (used.has(base.toLowerCase())) { base = `${base.slice(0, 28)} ${n++}` }
  used.add(base.toLowerCase())
  return base
}

export function buildXlsx(sheets: XlsxSheet[], meta: { title?: string; author?: string } = {}): Blob {
  const used = new Set<string>()
  const names = sheets.map(s => safeSheetName(s.name, used))
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(meta.title || 'FlowTrack')}</dc:title><dc:creator>${esc(meta.author || 'FlowTrack')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
</cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ]
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ── ZIP (store) ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStore(files: [string, string][]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const entries = files.map(([name, content]) => ({ name: enc.encode(name), data: enc.encode(content) }))
  const d = new Date()
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  let size = 22
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let p = 0
  const central: { offset: number; crc: number; e: (typeof entries)[number] }[] = []
  for (const e of entries) {
    const crc = crc32(e.data)
    central.push({ offset: p, crc, e })
    view.setUint32(p, 0x04034b50, true); view.setUint16(p + 4, 20, true); view.setUint16(p + 6, 0x0800, true)
    view.setUint16(p + 8, 0, true); view.setUint16(p + 10, dosTime, true); view.setUint16(p + 12, dosDate, true)
    view.setUint32(p + 14, crc, true); view.setUint32(p + 18, e.data.length, true); view.setUint32(p + 22, e.data.length, true)
    view.setUint16(p + 26, e.name.length, true); view.setUint16(p + 28, 0, true)
    out.set(e.name, p + 30); out.set(e.data, p + 30 + e.name.length)
    p += 30 + e.name.length + e.data.length
  }
  const cdStart = p
  for (const { offset, crc, e } of central) {
    view.setUint32(p, 0x02014b50, true); view.setUint16(p + 4, 20, true); view.setUint16(p + 6, 20, true); view.setUint16(p + 8, 0x0800, true)
    view.setUint16(p + 10, 0, true); view.setUint16(p + 12, dosTime, true); view.setUint16(p + 14, dosDate, true)
    view.setUint32(p + 16, crc, true); view.setUint32(p + 20, e.data.length, true); view.setUint32(p + 24, e.data.length, true)
    view.setUint16(p + 28, e.name.length, true); view.setUint16(p + 30, 0, true); view.setUint16(p + 32, 0, true)
    view.setUint16(p + 34, 0, true); view.setUint16(p + 36, 0, true); view.setUint32(p + 38, 0, true); view.setUint32(p + 42, offset, true)
    out.set(e.name, p + 46)
    p += 46 + e.name.length
  }
  view.setUint32(p, 0x06054b50, true); view.setUint16(p + 4, 0, true); view.setUint16(p + 6, 0, true)
  view.setUint16(p + 8, entries.length, true); view.setUint16(p + 10, entries.length, true)
  view.setUint32(p + 12, p - cdStart, true); view.setUint32(p + 16, cdStart, true); view.setUint16(p + 20, 0, true)
  return out
}
