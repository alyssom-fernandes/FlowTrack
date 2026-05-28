// Normalizes transaction description for merchant cache lookup
// Must match backend logic in transactions.py
export function normalizeDescription(description: string): string {
  return description
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

// Generates a simple client-side dedup key (full hash done on backend)
export function makeDedupKey(
  accountId: string,
  date: string,
  amount: number,
  descriptionNormalized: string
): string {
  return `${accountId}|${date}|${amount.toFixed(2)}|${descriptionNormalized}`
}
