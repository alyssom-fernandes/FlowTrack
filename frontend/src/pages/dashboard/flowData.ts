// Dados do fluxo do dinheiro (sem React): o que entrou, de onde veio e para onde foi
import type { Category, Transaction } from '../../types'
import { categoryColor, categoryRank } from '../../lib/categoryColor'
import { categoryLabel } from '../../utils'

// ── Dados ─────────────────────────────────────────────────
export type Node = { key: string; label: string; value: number; color: string; icon?: string; href?: string; kind: 'category' | 'none' | 'others' | 'left'; count?: number }
export type Source = { key: string; label: string; value: number }
export type FlowData = { income: number; expense: number; nodes: Node[]; deficit: number; sources: Source[] }

const MAX_NODES = 8
const MAX_SOURCES = 3

/**
 * O que entrou se divide nas categorias de gasto e no que sobrou.
 * `periodQuery` vai nos links das categorias (o Dashboard usa o mês; Relatórios, o período escolhido).
 */
export function buildFlow(transactions: Transaction[], categories: Category[], t: (k: string, o?: Record<string, unknown>) => string, periodQuery = 'period=this_month'): FlowData {
  const flows = transactions.filter(tx => tx.type !== 'transfer')
  const income = flows.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0)
  const byCat = new Map<string, number>()
  for (const tx of flows) if (tx.amount < 0) byCat.set(tx.category_id || 'none', (byCat.get(tx.category_id || 'none') || 0) - tx.amount)
  const expense = [...byCat.values()].reduce((s, v) => s + v, 0)

  // Fontes de renda: as maiores pela descrição ("Salário", "Freelance…") e o resto em "Outras receitas"
  const bySource = new Map<string, Source>()
  for (const tx of flows) {
    if (tx.amount <= 0) continue
    const key = tx.description.trim().toLocaleLowerCase()
    const cur = bySource.get(key) ?? { key, label: tx.description.trim(), value: 0 }
    cur.value += tx.amount
    bySource.set(key, cur)
  }
  // (as de menos de 5% do que entrou também vão para "Outras receitas")
  const ranked = [...bySource.values()].sort((x, y) => y.value - x.value)
  const main = ranked.filter((x, i) => i < MAX_SOURCES - 1 && x.value >= income * 0.05)
  const restSources = ranked.slice(main.length)
  const sources = restSources.length > 1 || (restSources.length === 1 && main.length === MAX_SOURCES - 1 && ranked.length > MAX_SOURCES)
    ? [...main, { key: '__others__', label: t('dashboard.flow.otherIncome'), value: restSources.reduce((s, x) => s + x.value, 0) }]
    : [...main, ...restSources]

  let nodes: Node[] = [...byCat.entries()].map(([id, value]) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return { key: 'none', label: t('dashboard.flow.uncategorized'), value, color: 'var(--text-hint)', kind: 'none' as const, href: `/transactions?category_id=none&${periodQuery}` }
    return { key: cat.id, label: categoryLabel(cat), value, color: categoryColor(cat), icon: cat.icon, kind: 'category' as const, href: `/transactions?category_id=${cat.id}&${periodQuery}` }
  })
  // Fiapos não ajudam: categorias com menos de 3% do total (e a "Outros") viram um nó só, em cinza.
  // Com muitas categorias, as menores também entram nele.
  const base = Math.max(income, expense) || 1
  const isOutros = (n: Node) => n.kind === 'category' && categories.find(c => c.id === n.key)?.name === 'Outros'
  const small = (n: Node) => n.kind === 'category' && (n.value / base < 0.03 || isOutros(n))
  let rest = nodes.filter(small)
  let keep = nodes.filter(n => !small(n))
  if (keep.length > MAX_NODES - 1) {
    const sorted = [...keep].sort((a, b) => b.value - a.value)
    rest = [...rest, ...sorted.slice(MAX_NODES - 1)]
    keep = sorted.slice(0, MAX_NODES - 1)
  }
  if (rest.length === 1) keep.push(rest[0])
  else if (rest.length > 1) keep.push({ key: 'others', label: t('dashboard.flow.others', { count: rest.length }), value: rest.reduce((s, n) => s + n.value, 0), color: 'var(--cat-other)', kind: 'others', count: rest.length })
  nodes = keep
  // Ordem fixa (a das cores validadas), sem categoria e "Outras" no fim
  const rank = (n: Node) => n.kind === 'none' ? 2000 : n.kind === 'others' ? 1500 : categoryRank(categories.find(c => c.id === n.key))
  nodes.sort((a, b) => rank(a) - rank(b))

  const left = income - expense
  if (left > 0) nodes.push({ key: 'left', label: t('dashboard.flow.left'), value: left, color: 'var(--accent)', kind: 'left' })
  return { income, expense, nodes, deficit: Math.max(0, -left), sources }
}
