// ============================================================
// FlowTrack — TypeScript Types
// ============================================================

// ── Auth ──────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  created_at: string
}

// ── Account ───────────────────────────────────────────────
export interface Account {
  id: string
  user_id: string
  name: string
  bank_name: string
  bank_color: string
  account_type: 'checking' | 'savings' | 'credit' | 'investment'
  currency: string
  balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AccountCreate {
  name: string
  bank_name: string
  bank_color?: string
  account_type?: string
  currency?: string
  balance?: number
}

// ── Transaction ───────────────────────────────────────────
export type CategorizedBy = 'rule' | 'cache' | 'ai' | 'manual'
export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id?: string
  description: string
  description_normalized?: string
  amount: number
  currency: string
  transaction_date: string
  type: 'debit' | 'credit' | 'transfer'
  is_recurring: boolean
  installment_current?: number
  installment_total?: number
  categorized_by?: CategorizedBy
  confidence_score?: number
  import_batch_id?: string
  parser_version?: string
  sync_status: SyncStatus
  notes?: string
  created_at: string
  updated_at: string
}

export interface TransactionCreate {
  account_id: string
  category_id?: string
  description: string
  amount: number
  currency?: string
  transaction_date: string
  type?: string
  is_recurring?: boolean
  installment_current?: number
  installment_total?: number
  notes?: string
}

export interface TransactionUpdate {
  category_id?: string
  description?: string
  amount?: number
  transaction_date?: string
  type?: string
  is_recurring?: boolean
  notes?: string
  categorized_by?: CategorizedBy
}

export interface TransactionFilters {
  account_id?: string
  category_id?: string
  start_date?: string
  end_date?: string
  type?: string
  search?: string
  page?: number
  page_size?: number
}

export interface PaginatedResponse<T> {
  transactions?: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── Category ──────────────────────────────────────────────
export interface Category {
  id: string
  user_id?: string
  name: string
  icon?: string
  color: string
  is_default: boolean
  created_at: string
}

// ── Goal ──────────────────────────────────────────────────
export type GoalType = 'spending_limit' | 'savings_target'

export interface Goal {
  id: string
  user_id: string
  category_id?: string
  name: string
  type: GoalType
  target_amount: number
  current_amount: number
  currency: string
  period: 'monthly' | 'yearly' | 'custom'
  start_date: string
  end_date?: string
  is_active: boolean
  progress_percent: number
  created_at: string
  updated_at: string
}

export interface GoalCreate {
  category_id?: string
  name: string
  type: GoalType
  target_amount: number
  currency?: string
  period?: string
  start_date: string
  end_date?: string
}

// ── Investment ────────────────────────────────────────────
export type InvestmentType =
  | 'renda_fixa' | 'renda_variavel' | 'fundo_imobiliario'
  | 'tesouro_direto' | 'cdb' | 'lci_lca' | 'acoes'
  | 'criptomoeda' | 'outro'

export interface Investment {
  id: string
  user_id: string
  account_id?: string
  name: string
  type: InvestmentType
  institution?: string
  total_invested: number
  current_value: number
  currency: string
  profitability: number
  profitability_percent: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface InvestmentCreate {
  account_id?: string
  name: string
  type?: InvestmentType
  institution?: string
  total_invested?: number
  current_value?: number
  currency?: string
  notes?: string
}

// ── Sync Queue (offline) ──────────────────────────────────
export type SyncAction = 'create' | 'update' | 'delete'
export type SyncItemStatus = 'pending' | 'retrying' | 'failed'

export interface SyncQueueItem {
  id: string
  action: SyncAction
  entity: 'transaction' | 'account' | 'goal' | 'investment'
  data: Record<string, unknown>
  retry_count: number
  max_retries: number
  next_retry_at: Date
  status: SyncItemStatus
  created_at: Date
}

// ── API ───────────────────────────────────────────────────
export interface ApiError {
  detail: string
  status?: number
}

// ── Dashboard ─────────────────────────────────────────────
export interface DashboardMetrics {
  total_balance: number
  total_income: number
  total_expenses: number
  period: string
}

// ── Bank list ─────────────────────────────────────────────
export interface BankOption {
  name: string
  color: string
}

export const BANK_LIST: BankOption[] = [
  { name: 'Nubank',        color: '#820ad1' },
  { name: 'Sicredi',       color: '#008000' },
  { name: 'Itaú',          color: '#EC7000' },
  { name: 'Bradesco',      color: '#CC092F' },
  { name: 'Santander',     color: '#EC0000' },
  { name: 'Caixa',         color: '#0070AF' },
  { name: 'Banco do Brasil', color: '#FFDD00' },
  { name: 'Inter',         color: '#FF7A00' },
  { name: 'Sicoob',        color: '#007A3D' },
  { name: 'C6 Bank',       color: '#242424' },
  { name: 'Mercado Pago',  color: '#009EE3' },
  { name: 'Will Bank',     color: '#FFDD00' },
  { name: 'XP',            color: '#000000' },
  { name: 'BTG',           color: '#0A0A0A' },
  { name: 'Neon',          color: '#00D4AA' },
  { name: 'PagBank',       color: '#00A859' },
  { name: 'Outro',         color: '#9D2449' },
]
