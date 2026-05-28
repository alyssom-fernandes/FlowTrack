import { api } from './api'
import type {
  Transaction, TransactionCreate, TransactionUpdate,
  TransactionFilters, PaginatedResponse
} from '../types'

export const transactionsService = {
  async list(filters: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value))
      }
    })
    const { data } = await api.get(`/api/v1/transactions?${params}`)
    return data
  },

  async get(id: string): Promise<Transaction> {
    const { data } = await api.get(`/api/v1/transactions/${id}`)
    return data
  },

  async create(payload: TransactionCreate): Promise<Transaction> {
    const { data } = await api.post('/api/v1/transactions', payload)
    return data
  },

  async update(id: string, payload: TransactionUpdate): Promise<Transaction> {
    const { data } = await api.patch(`/api/v1/transactions/${id}`, payload)
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/api/v1/transactions/${id}`)
  },

  async exportCsv(filters: { start_date?: string; end_date?: string; account_id?: string } = {}): Promise<void> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value)
    })
    const response = await api.get(`/api/v1/export/transactions?${params}`, {
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `flowtrack_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
