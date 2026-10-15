// ── Variação contra o período anterior ────────────────────
// A cor de estado só aparece quando a mudança importa: abaixo de ±5% a seta fica neutra
// (um gasto +2,0% não é estouro). Acima disso, verde ou vermelho conforme a direção boa da grandeza.
// Vale para porcentagem e para pontos percentuais (taxa de economia).
export const VARIATION_THRESHOLD = 5

export type VariationDir = 'up' | 'down' | 'flat'
export type VariationTone = 'good' | 'bad' | 'neutral'

export function variationDir(value: number): VariationDir {
  return Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down'
}

export function variationTone(value: number, upIsGood: boolean): VariationTone {
  if (!Number.isFinite(value) || Math.abs(value) < VARIATION_THRESHOLD) return 'neutral'
  return (value > 0) === upIsGood ? 'good' : 'bad'
}
