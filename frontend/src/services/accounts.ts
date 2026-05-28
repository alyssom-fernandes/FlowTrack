import { api } from './api'
import type { Account, AccountCreate } from '../types'

export const accountsService = {
  async list(): Promise<{ accounts: Account[]; total: number }> {
    const { data } = await api.get('/api/v1/accounts')
    return data
  },

  async get(id: string): Promise<Account> {
    const { data } = await api.get(`/api/v1/accounts/${id}`)
    return data
  },

  async create(payload: AccountCreate): Promise<Account> {
    const { data } = await api.post('/api/v1/accounts', payload)
    return data
  },

  async update(id: string, payload: Partial<AccountCreate>): Promise<Account> {
    const { data } = await api.patch(`/api/v1/accounts/${id}`, payload)
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/api/v1/accounts/${id}`)
  },
}
