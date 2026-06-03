import { create } from 'zustand'
import Dexie, { type EntityTable } from 'dexie'
import type { User, SyncQueueItem, Alert } from './types'

// ── Auth Store ────────────────────────────────────────────
interface AuthState {
  user: User | null
  isLoading: boolean
  isDemo: boolean
  setUser: (user: User | null) => void
  setLoading: (v: boolean) => void
  setDemo: (v: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isDemo: false,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setDemo: (isDemo) => set({ isDemo }),
  clear: () => set({ user: null, isDemo: false, isLoading: false }),
}))

// ── Sync Queue (IndexedDB via Dexie) ──────────────────────
class SyncQueueDB extends Dexie {
  queue!: EntityTable<SyncQueueItem, 'id'>
  constructor() {
    super('FlowTrackSync')
    this.version(1).stores({ queue: 'id, action, entity, status, next_retry_at' })
  }
}

export const syncDB = new SyncQueueDB()

// ── Toast Store ───────────────────────────────────────────
interface ToastItem {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: ToastItem[]
  toast: (opts: { message: string; variant?: ToastItem['variant'] }) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  toast: ({ message, variant = 'success' }) => {
    const id = crypto.randomUUID()
    set(s => ({ toasts: [...s.toasts, { id, message, variant }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3000)
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

// ── Alerts Store ──────────────────────────────────────────
interface AlertsState {
  alerts: Alert[]
  count: number
  loading: boolean
  load: () => Promise<void>
  clear: () => void
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  count: 0,
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const { alertsService } = await import('./services')
      const res = await alertsService.list()
      set({ alerts: res.alerts, count: res.total, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  clear: () => set({ alerts: [], count: 0 }),
}))

export const syncQueueService = {
  async add(item: Omit<SyncQueueItem, 'id' | 'retry_count' | 'max_retries' | 'next_retry_at' | 'status' | 'created_at'>): Promise<void> {
    await syncDB.queue.add({ ...item, id: crypto.randomUUID(), retry_count: 0, max_retries: 3, next_retry_at: new Date(), status: 'pending', created_at: new Date() })
  },
  async getPending(): Promise<SyncQueueItem[]> {
    const now = new Date()
    return syncDB.queue.where('status').anyOf(['pending', 'retrying']).filter((i) => i.next_retry_at <= now).toArray()
  },
  async markDone(id: string): Promise<void> { await syncDB.queue.delete(id) },
  async markFailed(id: string, retryCount: number): Promise<void> {
    if (retryCount >= 3) {
      await syncDB.queue.update(id, { status: 'failed' })
    } else {
      const delay = Math.min(60_000 * Math.pow(3, retryCount), 86_400_000)
      await syncDB.queue.update(id, { status: 'retrying', retry_count: retryCount + 1, next_retry_at: new Date(Date.now() + delay) })
    }
  },
  async getPendingCount(): Promise<number> { return syncDB.queue.where('status').anyOf(['pending', 'retrying']).count() },
  async getFailedCount(): Promise<number> { return syncDB.queue.where('status').equals('failed').count() },
}
