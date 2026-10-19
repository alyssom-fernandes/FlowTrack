// ── Fila offline (lógica) ─────────────────────────────────
// O armazenamento é a tabela do Dexie (store.ts); aqui ficam as regras, sem depender do IndexedDB,
// para que os testes rodem com uma tabela em memória (frontend/tests/syncQueue.test.ts).
// ADR 0003: fila no aparelho, enviada quando o app volta a ficar online.
import type { SyncQueueItem } from '../types'

/** O pedaço da tabela do Dexie que a fila usa. */
export interface QueueTable {
  add(item: SyncQueueItem): Promise<unknown>
  update(id: string, changes: Partial<SyncQueueItem>): Promise<unknown>
  delete(id: string): Promise<unknown>
  clear(): Promise<unknown>
  toArray(): Promise<SyncQueueItem[]>
}

export type NewQueueItem = Pick<SyncQueueItem, 'entity' | 'action' | 'data' | 'user_id'>

export const MAX_RETRIES = 3

export function createSyncQueue(table: QueueTable, now: () => Date = () => new Date()) {
  const active = (i: SyncQueueItem) => i.status === 'pending' || i.status === 'retrying'
  return {
    async add(item: NewQueueItem): Promise<void> {
      await table.add({ ...item, id: crypto.randomUUID(), retry_count: 0, max_retries: MAX_RETRIES, next_retry_at: now(), status: 'pending', created_at: now() })
    },
    /** Itens deste usuário que já podem ser reenviados. Os de outra pessoa no mesmo aparelho nunca saem. */
    async getPending(userId: string): Promise<SyncQueueItem[]> {
      const t = now()
      return (await table.toArray()).filter(i => i.user_id === userId && active(i) && i.next_retry_at <= t)
    },
    async markDone(id: string): Promise<void> { await table.delete(id) },
    async markFailed(id: string, retryCount: number): Promise<void> {
      if (retryCount >= MAX_RETRIES) {
        await table.update(id, { status: 'failed' })
      } else {
        // 1 min → 3 min → 9 min
        const delay = Math.min(60_000 * Math.pow(3, retryCount), 86_400_000)
        await table.update(id, { status: 'retrying', retry_count: retryCount + 1, next_retry_at: new Date(now().getTime() + delay) })
      }
    },
    async getPendingCount(userId: string): Promise<number> { return (await table.toArray()).filter(i => i.user_id === userId && active(i)).length },
    async getFailedCount(userId: string): Promise<number> { return (await table.toArray()).filter(i => i.user_id === userId && i.status === 'failed').length },
    /** Ao sair da conta: os lançamentos pendentes não ficam no aparelho para a próxima pessoa. */
    async clear(): Promise<void> { await table.clear() },
  }
}

export type SyncQueue = ReturnType<typeof createSyncQueue>

/**
 * Reenvia os itens pendentes do usuário. `send` precisa enviar direto, sem enfileirar de novo:
 * se ele mesmo pusesse o item na fila ao falhar, cada tentativa criaria uma cópia nova.
 * Devolve quantos itens foram enviados.
 */
export async function flushQueue(queue: SyncQueue, userId: string, send: (item: SyncQueueItem) => Promise<void>): Promise<number> {
  let sent = 0
  for (const item of await queue.getPending(userId)) {
    try {
      await send(item)
      await queue.markDone(item.id)
      sent++
    } catch {
      await queue.markFailed(item.id, item.retry_count)
    }
  }
  return sent
}
