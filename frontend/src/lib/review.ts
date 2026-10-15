// ── Revisão da categorização ──────────────────────────────
// "A revisar": transações sem categoria ou categorizadas pela IA com pouca confiança.
// A API (backend/app/api/v1/_helpers.py, REVIEW_CONFIDENCE) e a demonstração usam o mesmo corte.
import type { Category, Transaction } from '../types'

export const REVIEW_CONFIDENCE = 0.85

export function needsReview(t: Pick<Transaction, 'type' | 'category_id' | 'categorized_by' | 'confidence_score'>): boolean {
  if (t.type === 'transfer') return false
  if (!t.category_id) return true
  return t.categorized_by === 'ai' && (t.confidence_score ?? 0) < REVIEW_CONFIDENCE
}

// "Outros" dado pela IA não é sugestão de verdade: na tela conta como sem categoria
// (o worker do backend, app/integrations/claude_api.py, já não grava essa resposta)
export const FALLBACK_CATEGORY = 'Outros'

export function isAiFallback(t: Pick<Transaction, 'categorized_by'>, cat: Pick<Category, 'name' | 'is_default'> | undefined): boolean {
  return !!cat && t.categorized_by === 'ai' && cat.is_default && cat.name === FALLBACK_CATEGORY
}

/** A categoria que vale na tela: a da transação, menos o "Outros" que a IA deu por falta de opção. */
export function shownCategory(t: Pick<Transaction, 'category_id' | 'categorized_by'>, categories: Category[]): Category | undefined {
  const cat = t.category_id ? categories.find(c => c.id === t.category_id) : undefined
  return isAiFallback(t, cat) ? undefined : cat
}

/** O id que vale nos totais por categoria (Relatórios, fluxo, PDF, planilhas): a mesma regra da tela. */
export function shownCategoryId(t: Pick<Transaction, 'category_id' | 'categorized_by'>, categories: Category[]): string | undefined {
  return shownCategory(t, categories)?.id
}
