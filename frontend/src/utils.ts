import { useState, useEffect } from 'react'
import { transactionsService } from './services'
import { syncQueueService } from './store'

// ── Formatters ────────────────────────────────────────────
export function formatCurrency(value: number, currency = 'BRL', locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`
  return formatCurrency(value)
}

export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', options || { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr + 'T00:00:00'))
}

export function formatDateShort(dateStr: string): string {
  return formatDate(dateStr, { day: '2-digit', month: 'short' })
}

export function toISODate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]
}

export function getCurrentMonthRange() {
  const now = new Date()
  return {
    start_date: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end_date: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
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
    if (!navigator.onLine || isSyncing) return
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/health`, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    } catch { return }

    const pending = await syncQueueService.getPending()
    if (pending.length === 0) return
    setIsSyncing(true)
    for (const item of pending) {
      try {
        if (item.entity === 'transaction') {
          if (item.action === 'create') await transactionsService.create(item.data as Parameters<typeof transactionsService.create>[0])
          else if (item.action === 'update' && item.data.id) await transactionsService.update(item.data.id as string, item.data as Parameters<typeof transactionsService.update>[1])
          else if (item.action === 'delete' && item.data.id) await transactionsService.remove(item.data.id as string)
        }
        await syncQueueService.markDone(item.id)
      } catch { await syncQueueService.markFailed(item.id, item.retry_count) }
    }
    setIsSyncing(false)
  }

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); processQueue() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (navigator.onLine) processQueue()
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  return { isOnline, isSyncing }
}
