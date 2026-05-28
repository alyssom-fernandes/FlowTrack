import { useState, useEffect } from 'react'
import { syncQueueService } from '../store/syncQueue'
import { transactionsService } from '../services/transactions'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)

  const processQueue = async () => {
    if (!navigator.onLine || isSyncing) return

    // Verify actual connectivity with a lightweight request
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/health`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      return // Not actually online
    }

    const pending = await syncQueueService.getPending()
    if (pending.length === 0) return

    setIsSyncing(true)
    for (const item of pending) {
      try {
        if (item.entity === 'transaction') {
          if (item.action === 'create') {
            await transactionsService.create(item.data as Parameters<typeof transactionsService.create>[0])
          } else if (item.action === 'update' && item.data.id) {
            await transactionsService.update(
              item.data.id as string,
              item.data as Parameters<typeof transactionsService.update>[1]
            )
          } else if (item.action === 'delete' && item.data.id) {
            await transactionsService.remove(item.data.id as string)
          }
        }
        await syncQueueService.markDone(item.id)
      } catch {
        await syncQueueService.markFailed(item.id, item.retry_count)
      }
    }
    setIsSyncing(false)
  }

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      processQueue()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Process queue on mount if online
    if (navigator.onLine) processQueue()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, isSyncing }
}
