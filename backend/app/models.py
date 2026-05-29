from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────
class CategorizedByEnum(str, Enum):
    rule = "rule"; cache = "cache"; ai = "ai"; manual = "manual"

class SyncStatusEnum(str, Enum):
    synced = "synced"; pending = "pending"; failed = "failed"

class GoalTypeEnum(str, Enum):
    spending_limit = "spending_limit"; savings_target = "savings_target"

class InvestmentTypeEnum(str, Enum):
    renda_fixa = "renda_fixa"; renda_variavel = "renda_variavel"
    fundo_imobiliario = "fundo_imobiliario"; tesouro_direto = "tesouro_direto"
    cdb = "cdb"; lci_lca = "lci_lca"; acoes = "acoes"
    criptomoeda = "criptomoeda"; outro = "outro"


# ── Account ───────────────────────────────────────────────
class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    bank_name: str = Field(..., min_length=1, max_length=100)
    bank_color: str = "#9D2449"
    account_type: str = "checking"
    currency: str = "BRL"
    balance: float = 0.0

class AccountUpdate(BaseModel):
    name: Optional[str] = None; bank_name: Optional[str] = None
    bank_color: Optional[str] = None; account_type: Optional[str] = None
    balance: Optional[float] = None; is_active: Optional[bool] = None

class AccountResponse(BaseModel):
    id: str; user_id: str; name: str; bank_name: str; bank_color: str
    account_type: str; currency: str; balance: float; is_active: bool
    created_at: datetime; updated_at: datetime

class AccountListResponse(BaseModel):
    accounts: list[AccountResponse]; total: int


# ── Transaction ───────────────────────────────────────────
class TransactionCreate(BaseModel):
    account_id: str; category_id: Optional[str] = None
    description: str
    amount: float = Field(..., description="Negative = debit, positive = credit")
    currency: str = "BRL"; transaction_date: date; type: str = "debit"
    is_recurring: bool = False; installment_current: Optional[int] = None
    installment_total: Optional[int] = None; notes: Optional[str] = None

class TransactionUpdate(BaseModel):
    category_id: Optional[str] = None; description: Optional[str] = None
    amount: Optional[float] = None; transaction_date: Optional[date] = None
    type: Optional[str] = None; is_recurring: Optional[bool] = None
    notes: Optional[str] = None; categorized_by: Optional[CategorizedByEnum] = None

class TransactionResponse(BaseModel):
    id: str; user_id: str; account_id: str; category_id: Optional[str] = None
    description: str; description_normalized: Optional[str] = None
    amount: float; currency: str; transaction_date: date; type: str
    is_recurring: bool; installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    categorized_by: Optional[CategorizedByEnum] = None
    confidence_score: Optional[float] = None
    import_batch_id: Optional[str] = None; parser_version: Optional[str] = None
    sync_status: SyncStatusEnum; notes: Optional[str] = None
    created_at: datetime; updated_at: datetime

class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]; total: int
    page: int; page_size: int; total_pages: int


# ── Goal ──────────────────────────────────────────────────
class GoalCreate(BaseModel):
    category_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=100)
    type: GoalTypeEnum; target_amount: float = Field(..., gt=0)
    currency: str = "BRL"; period: str = "monthly"
    start_date: date; end_date: Optional[date] = None

class GoalUpdate(BaseModel):
    name: Optional[str] = None; target_amount: Optional[float] = None
    current_amount: Optional[float] = None; period: Optional[str] = None
    end_date: Optional[date] = None; is_active: Optional[bool] = None

class GoalResponse(BaseModel):
    id: str; user_id: str; category_id: Optional[str] = None
    name: str; type: GoalTypeEnum; target_amount: float
    current_amount: float; currency: str; period: str
    start_date: date; end_date: Optional[date] = None
    is_active: bool; progress_percent: float = 0.0
    created_at: datetime; updated_at: datetime

class GoalListResponse(BaseModel):
    goals: list[GoalResponse]; total: int


# ── Investment ────────────────────────────────────────────
class InvestmentCreate(BaseModel):
    account_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=100)
    type: InvestmentTypeEnum = InvestmentTypeEnum.outro
    institution: Optional[str] = None
    total_invested: float = Field(default=0.0, ge=0)
    current_value: float = Field(default=0.0, ge=0)
    currency: str = "BRL"; notes: Optional[str] = None

class InvestmentUpdate(BaseModel):
    name: Optional[str] = None; type: Optional[InvestmentTypeEnum] = None
    institution: Optional[str] = None; total_invested: Optional[float] = None
    current_value: Optional[float] = None; notes: Optional[str] = None
    is_active: Optional[bool] = None

class InvestmentResponse(BaseModel):
    id: str; user_id: str; account_id: Optional[str] = None
    name: str; type: InvestmentTypeEnum; institution: Optional[str] = None
    total_invested: float; current_value: float; currency: str
    profitability: float = 0.0; profitability_percent: float = 0.0
    notes: Optional[str] = None; is_active: bool
    created_at: datetime; updated_at: datetime

class InvestmentListResponse(BaseModel):
    investments: list[InvestmentResponse]; total: int
    total_invested: float; total_current_value: float
    total_profitability: float; total_profitability_percent: float
