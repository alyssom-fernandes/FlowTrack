// ── Cor estável por categoria ─────────────────────────────
// A mesma categoria tem a mesma cor em todas as telas, nos dois temas,
// no PDF e no Excel. As padrão usam a paleta validada (tokens --cat-*);
// as criadas pela pessoa usam a cor que ela escolheu.
import type { Category } from '../types'

// Ordem fixa: é nela que as categorias aparecem lado a lado nos gráficos
// (a separação entre vizinhas foi validada nesta ordem, inclusive para daltonismo).
export const DEFAULT_CATEGORY_ORDER = [
  'Moradia', 'Alimentação', 'Lazer', 'Transporte', 'Saúde', 'Educação', 'Assinaturas', 'Vestuário', 'Outros',
] as const

const SLOT: Record<string, string> = {
  Moradia: '--cat-1', Alimentação: '--cat-2', Lazer: '--cat-3', Transporte: '--cat-4', Saúde: '--cat-5',
  Educação: '--cat-6', Assinaturas: '--cat-7', Vestuário: '--cat-8', Outros: '--cat-other',
  Receita: '--chart-income', Investimentos: '--accent-text', Transferência: '--chart-neutral',
}

// Valores do tema claro, para o que não lê CSS (PDF e Excel)
export const CATEGORY_PRINT_HEX: Record<string, string> = {
  Moradia: '#2a78d6', Alimentação: '#eb6834', Lazer: '#1baf7a', Transporte: '#eda100', Saúde: '#e87ba4',
  Educação: '#008300', Assinaturas: '#4a3aa7', Vestuário: '#e34948', Outros: '#8e8e99',
  Receita: '#2ca470', Investimentos: '#9D2449', Transferência: '#8e8e99',
}

type CategoryLike = Pick<Category, 'name' | 'color'> & { is_default?: boolean }

const isDefault = (cat: CategoryLike) => cat.is_default !== false && cat.name in SLOT

/** Cor para usar em CSS (var(--cat-n) nas padrão, hex nas criadas pela pessoa). */
export function categoryColor(cat?: CategoryLike | null): string {
  if (!cat) return 'var(--chart-neutral)'
  return isDefault(cat) ? `var(${SLOT[cat.name]})` : cat.color || 'var(--chart-neutral)'
}

/** Cor em hex do tema claro, para PDF e Excel. */
export function categoryPrintHex(cat?: CategoryLike | null): string {
  if (!cat) return '#8e8e99'
  return isDefault(cat) ? CATEGORY_PRINT_HEX[cat.name] : cat.color || '#8e8e99'
}

/** Posição da categoria na ordem fixa dos gráficos (as criadas pela pessoa vêm antes de "Outros"). */
export function categoryRank(cat?: CategoryLike | null): number {
  if (!cat) return 1000
  const i = (DEFAULT_CATEGORY_ORDER as readonly string[]).indexOf(cat.name)
  if (i === -1 || !isDefault(cat)) return DEFAULT_CATEGORY_ORDER.length - 1 + 0.5
  return i
}
