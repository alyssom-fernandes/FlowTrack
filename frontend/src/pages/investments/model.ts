// Tipos de investimento, ordem fixa (do mais conservador ao mais arriscado) e fatias da distribuição
import type { Investment, InvestmentType } from '../../types'

export const TYPE_ORDER: InvestmentType[] = [
  'tesouro_direto', 'renda_fixa', 'cdb', 'lci_lca',
  'fundo_imobiliario', 'renda_variavel', 'acoes', 'criptomoeda', 'outro',
]

export interface Slice {
  key: InvestmentType
  value: number
  invested: number
  count: number
  share: number   // 0–100
  color: string
}

// Cores por tipo na ordem fixa, só entre os tipos presentes (--chart-1…7);
// a partir do 8º tipo, tudo cai em "outro" (--chart-8, cinza).
export function allocation(list: Investment[]): Slice[] {
  const total = list.reduce((s, i) => s + Math.max(0, i.current_value), 0)
  const present = TYPE_ORDER.filter(type => list.some(i => i.type === type))
  const hued: InvestmentType[] = present.filter(type => type !== 'outro').slice(0, 7)
  const groupOf = (type: InvestmentType): InvestmentType => (hued.includes(type) ? type : 'outro')

  const slices = new Map<InvestmentType, Slice>()
  for (const inv of list) {
    const key = groupOf(inv.type)
    const s = slices.get(key) ?? { key, value: 0, invested: 0, count: 0, share: 0, color: '' }
    s.value += Math.max(0, inv.current_value)
    s.invested += inv.total_invested
    s.count += 1
    slices.set(key, s)
  }
  return [...hued, 'outro' as InvestmentType]
    .filter(key => slices.has(key))
    .map(key => {
      const s = slices.get(key)!
      const idx = hued.indexOf(key)
      return { ...s, share: total > 0 ? (s.value / total) * 100 : 0, color: idx >= 0 ? `var(--chart-${idx + 1})` : 'var(--chart-8)' }
    })
}

export function colorByType(slices: Slice[]): (type: InvestmentType) => string {
  return type => slices.find(s => s.key === type)?.color ?? 'var(--chart-8)'
}

// Posição de cada segmento da barra: 2px de respiro entre eles e no mínimo 3px por fatia
export function layoutBar(values: number[], width: number, gap = 2, minW = 3): { x: number; w: number }[] {
  const total = values.reduce((a, b) => a + b, 0)
  const shown = values.filter(v => v > 0).length
  const usable = Math.max(0, width - gap * Math.max(0, shown - 1))
  const raw = values.map(v => (total > 0 ? (v / total) * usable : 0))
  const small = raw.filter(w => w > 0 && w < minW).length
  const bigTotal = raw.filter(w => w >= minW).reduce((a, b) => a + b, 0)
  const scale = bigTotal > 0 ? (usable - small * minW) / bigTotal : 0
  const out: { x: number; w: number }[] = []
  let x = 0
  for (const w of raw) {
    const rw = w <= 0 ? 0 : w < minW ? minW : w * scale
    out.push({ x, w: rw })
    if (rw > 0) x += rw + gap
  }
  return out
}
