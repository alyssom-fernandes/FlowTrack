import { create } from 'zustand'
import Dexie, { type EntityTable } from 'dexie'
import type { User, SyncQueueItem, Alert } from './types'
import { createSyncQueue } from './lib/syncQueue'

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
  error: boolean
  load: () => Promise<void>
  clear: () => void
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  count: 0,
  loading: false,
  error: false,
  load: async () => {
    set({ loading: true })
    try {
      const { alertsService } = await import('./services')
      const res = await alertsService.list()
      set({ alerts: res.alerts, count: res.total, loading: false, error: false })
    } catch {
      set({ loading: false, error: true })
    }
  },
  clear: () => set({ alerts: [], count: 0, error: false }),
}))

// Regras da fila em lib/syncQueue.ts; cada item guarda o user_id de quem o criou
export const syncQueueService = createSyncQueue(syncDB.queue)
