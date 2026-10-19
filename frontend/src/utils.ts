import { useState, useEffect } from 'react'
import { transactionsService } from './services'
import { syncQueueService, useAuthStore } from './store'
import { flushQueue } from './lib/syncQueue'
import { demo } from './demo'
import i18n from './i18n'

// ── Formatters ────────────────────────────────────────────
// Seguem o idioma escolhido (pt-BR ou en-US); a moeda continua sendo o real.
export function currentLocale(): string {
  return i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'
}

export function formatCurrency(value: number, currency = 'BRL', locale = currentLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

// "R$ 16,4 mil" / "R$16.4K" — só para valores grandes; abaixo de mil mostra o valor inteiro
export function formatCurrencyCompact(value: number, locale = currentLocale()): string {
  if (Math.abs(value) < 10_000) return formatCurrency(value, 'BRL', locale)
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

// Com sinal explícito: "+R$ 89,31" / "-R$ 37,50"
export function formatSignedCurrency(value: number, locale = currentLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function formatNumber(value: number, decimals = 0, locale = currentLocale()): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const d = dateStr.length > 10 ? new Date(dateStr) : new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat(currentLocale(), options || { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

// "2 de out." / "Oct 2"
export function formatDateShort(dateStr: string): string {
  return formatDate(dateStr, { day: 'numeric', month: 'short' })
}

// "2026-10" → "out." / "outubro de 2026" / "out. 2026"
export function formatMonth(key: string, style: 'short' | 'long' | 'shortYear' = 'short'): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const opts: Intl.DateTimeFormatOptions = style === 'long' ? { month: 'long', year: 'numeric' } : style === 'shortYear' ? { month: 'short', year: '2-digit' } : { month: 'short' }
  return new Intl.DateTimeFormat(currentLocale(), opts).format(d).replace(/\.$/, '')
}

// Nomes das categorias padrão (vêm do banco em português)
const DEFAULT_CATEGORY_EN: Record<string, string> = {
  'Alimentação': 'Food', 'Transporte': 'Transport', 'Moradia': 'Housing', 'Saúde': 'Health', 'Educação': 'Education',
  'Lazer': 'Leisure', 'Vestuário': 'Clothing', 'Assinaturas': 'Subscriptions', 'Investimentos': 'Investments',
  'Receita': 'Income', 'Transferência': 'Transfer', 'Outros': 'Other',
}

export function categoryLabel(cat?: { name: string; is_default?: boolean } | null, fallback = ''): string {
  if (!cat) return fallback
  if (currentLocale() === 'en-US' && cat.is_default !== false) return DEFAULT_CATEGORY_EN[cat.name] ?? cat.name
  return cat.name
}

// Para onde cada alerta leva (links que as telas aceitam)
export function alertHref(alert: { category: string; message: string; subject?: string }): string | null {
  if (alert.category === 'uncategorized') return '/transactions?category_id=none&period=this_month'
  if (alert.category === 'account') return '/profile?tab=accounts'
  if (alert.category === 'budget') return '/goals?aba=orcamentos'
  if (alert.category === 'goal') return '/goals'
  if (alert.category === 'recurring') return alert.subject ? `/transactions?search=${encodeURIComponent(alert.subject)}` : '/transactions'
  return null
}

// "há 2 horas" / "2 hours ago"
export function formatRelative(isoDate: string): string {
  const diff = (new Date(isoDate).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Infinity]]
  let v = diff
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit)
    v /= size
  }
  return formatDate(isoDate)
}

export function toISODate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getCurrentMonthRange() {
  const now = new Date()
  return {
    start_date: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end_date: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

export function formatPercent(value: number, decimals = 1, signed = true): string {
  return new Intl.NumberFormat(currentLocale(), { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: signed ? 'exceptZero' : 'auto' }).format(value / 100)
}

export function truncate(text: string, max = 30): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ── Normalizers ───────────────────────────────────────────
export function normalizeDescription(description: string): string {
  return description.toUpperCase().trim().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').slice(0, 100)
}

// ── useOnlineStatus hook ──────────────────────────────────
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)

  const processQueue = async () => {
    if (!navigator.onLine || isSyncing || demo.isActive()) return
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/health`, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    } catch { return }

    // Só os itens de quem está conectado; os de outra conta neste aparelho ficam de fora
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const pending = await syncQueueService.getPending(userId)
    if (pending.length === 0) return
    setIsSyncing(true)
    try {
      // createDirect: um reenvio que falha só reagenda o item, sem criar outro na fila
      await flushQueue(syncQueueService, userId, async (item) => {
        if (item.entity !== 'transaction') return
        if (item.action === 'create') await transactionsService.createDirect(item.data as unknown as Parameters<typeof transactionsService.createDirect>[0])
        else if (item.action === 'update' && item.data.id) await transactionsService.update(item.data.id as string, item.data as unknown as Parameters<typeof transactionsService.update>[1])
        else if (item.action === 'delete' && item.data.id) await transactionsService.remove(item.data.id as string)
      })
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); processQueue() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (navigator.onLine) processQueue()
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { isOnline, isSyncing }
}
