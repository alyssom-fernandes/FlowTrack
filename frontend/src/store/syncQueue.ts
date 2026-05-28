import Dexie, { type EntityTable } from 'dexie'
import type { SyncQueueItem } from '../types'

class SyncQueueDB extends Dexie {
  queue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('FlowTrackSync')
    this.version(1).stores({
      queue: 'id, action, entity, status, next_retry_at',
    })
  }
}

export const syncDB = new SyncQueueDB()

export const syncQueueService = {
  async add(item: Omit<SyncQueueItem, 'id' | 'retry_count' | 'max_retries' | 'next_retry_at' | 'status' | 'created_at'>): Promise<void> {
    await syncDB.queue.add({
      ...item,
      id: crypto.randomUUID(),
      retry_count: 0,
      max_retries: 3,
      next_retry_at: new Date(),
      status: 'pending',
      created_at: new Date(),
    })
  },

  async getPending(): Promise<SyncQueueItem[]> {
    const now = new Date()
    return syncDB.queue
      .where('status')
      .anyOf(['pending', 'retrying'])
      .filter((item) => item.next_retry_at <= now)
      .toArray()
  },

  async markDone(id: string): Promise<void> {
    await syncDB.queue.delete(id)
  },

  async markFailed(id: string, retryCount: number): Promise<void> {
    if (retryCount >= 3) {
      await syncDB.queue.update(id, { status: 'failed' })
    } else {
      const delay = Math.min(60_000 * Math.pow(3, retryCount), 86_400_000)
      await syncDB.queue.update(id, {
        status: 'retrying',
        retry_count: retryCount + 1,
        next_retry_at: new Date(Date.now() + delay),
      })
    }
  },

  async getFailedCount(): Promise<number> {
    return syncDB.queue.where('status').equals('failed').count()
  },

  async getPendingCount(): Promise<number> {
    return syncDB.queue.where('status').anyOf(['pending', 'retrying']).count()
  },

  async clearFailed(): Promise<void> {
    await syncDB.queue.where('status').equals('failed').delete()
  },
}
