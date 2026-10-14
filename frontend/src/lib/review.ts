// ── Revisão da categorização ──────────────────────────────
// "A revisar": transações sem categoria ou categorizadas pela IA com pouca confiança.
// A API (backend/app/api/v1/_helpers.py, REVIEW_CONFIDENCE) e a demonstração usam o mesmo corte.
import type { Transaction } from '../types'

export const REVIEW_CONFIDENCE = 0.85

export function needsReview(t: Pick<Transaction, 'type' | 'category_id' | 'categorized_by' | 'confidence_score'>): boolean {
  if (t.type === 'transfer') return false
  if (!t.category_id) return true
  return t.categorized_by === 'ai' && (t.confidence_score ?? 0) < REVIEW_CONFIDENCE
}
