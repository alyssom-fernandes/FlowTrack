// Fila offline (src/lib/syncQueue.ts) com uma tabela em memória no lugar do IndexedDB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSyncQueue, flushQueue, type QueueTable } from '../src/lib/syncQueue.ts'
import type { SyncQueueItem } from '../src/types.ts'

function memoryTable(): QueueTable & { rows: SyncQueueItem[] } {
  const rows: SyncQueueItem[] = []
  return {
    rows,
    async add(item) { rows.push({ ...item }) },
    async update(id, changes) { const r = rows.find(x => x.id === id); if (r) Object.assign(r, changes) },
    async delete(id) { const i = rows.findIndex(x => x.id === id); if (i >= 0) rows.splice(i, 1) },
    async clear() { rows.splice(0, rows.length) },
    async toArray() { return rows.map(r => ({ ...r })) },
  }
}

const ALICE = 'user-alice', BOB = 'user-bob'
const payload = (description: string) => ({ description, amount: -10, account_id: 'acc-1', transaction_date: '2026-10-10' })

function setup() {
  let clock = new Date('2026-10-10T12:00:00Z')
  const table = memoryTable()
  const queue = createSyncQueue(table, () => clock)
  return { table, queue, advance: (ms: number) => { clock = new Date(clock.getTime() + ms) } }
}

test('cada item guarda o dono e getPending só devolve os do usuário', async () => {
  const { queue } = setup()
  await queue.add({ entity: 'transaction', action: 'create', user_id: ALICE, data: payload('MERCADO EXEMPLO') })
  await queue.add({ entity: 'transaction', action: 'create', user_id: BOB, data: payload('LOJA EXEMPLO') })
  const pending = await queue.getPending(ALICE)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].user_id, ALICE)
  assert.equal(pending[0].data.description, 'MERCADO EXEMPLO')
  assert.equal(await queue.getPendingCount(BOB), 1)
})

test('reenvio que falha por rede não duplica o item: só reagenda', async () => {
  const { table, queue, advance } = setup()
  await queue.add({ entity: 'transaction', action: 'create', user_id: ALICE, data: payload('MERCADO EXEMPLO') })
  const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
  const send = async () => { throw networkError }

  assert.equal(await flushQueue(queue, ALICE, send), 0)
  assert.equal(table.rows.length, 1)
  assert.equal(table.rows[0].status, 'retrying')
  assert.equal(table.rows[0].retry_count, 1)
  // Antes do novo horário o item não é reenviado
  assert.equal((await queue.getPending(ALICE)).length, 0)

  advance(60_000)
  await flushQueue(queue, ALICE, send)
  assert.equal(table.rows.length, 1)
  assert.equal(table.rows[0].retry_count, 2)
})

test('depois de 3 tentativas o item fica como falho e sai dos pendentes', async () => {
  const { table, queue, advance } = setup()
  await queue.add({ entity: 'transaction', action: 'create', user_id: ALICE, data: payload('MERCADO EXEMPLO') })
  const send = async () => { throw new Error('rede') }
  for (let i = 0; i < 4; i++) { await flushQueue(queue, ALICE, send); advance(86_400_000) }
  assert.equal(table.rows.length, 1)
  assert.equal(table.rows[0].status, 'failed')
  assert.equal(await queue.getFailedCount(ALICE), 1)
  assert.equal((await queue.getPending(ALICE)).length, 0)
})

test('envio bem-sucedido tira o item da fila e não toca nos de outra pessoa', async () => {
  const { table, queue } = setup()
  await queue.add({ entity: 'transaction', action: 'create', user_id: ALICE, data: payload('MERCADO EXEMPLO') })
  await queue.add({ entity: 'transaction', action: 'create', user_id: BOB, data: payload('LOJA EXEMPLO') })
  const sent: string[] = []
  assert.equal(await flushQueue(queue, ALICE, async (item) => { sent.push(String(item.data.description)) }), 1)
  assert.deepEqual(sent, ['MERCADO EXEMPLO'])
  assert.deepEqual(table.rows.map(r => r.user_id), [BOB])
})

test('clear (ao sair da conta) apaga a fila do aparelho', async () => {
  const { table, queue } = setup()
  await queue.add({ entity: 'transaction', action: 'create', user_id: ALICE, data: payload('MERCADO EXEMPLO') })
  await queue.clear()
  assert.equal(table.rows.length, 0)
})
