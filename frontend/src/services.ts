import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import type { Account, AccountCreate, Transaction, TransactionCreate, TransactionUpdate, TransactionFilters, PaginatedResponse } from './types'

// ── Supabase ──────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase environment variables')
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Axios client ──────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) { await supabase.auth.signOut(); window.location.href = '/login' }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────
export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },
  async signInDemo() {
    return authService.signIn(
      import.meta.env.VITE_DEMO_EMAIL || 'demo@flowtrack.app',
      import.meta.env.VITE_DEMO_PASSWORD || 'demo123456'
    )
  },
  onAuthStateChange(callback: (session: unknown) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => callback(session))
  },
}

// ── Accounts ──────────────────────────────────────────────
export const accountsService = {
  async list(): Promise<{ accounts: Account[]; total: number }> {
    const { data } = await api.get('/api/v1/accounts')
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

// ── Transactions ──────────────────────────────────────────
export const transactionsService = {
  async list(filters: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.append(k, String(v)) })
    const { data } = await api.get(`/api/v1/transactions?${params}`)
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
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
    const response = await api.get(`/api/v1/export/transactions?${params}`, { responseType: 'blob' })
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
