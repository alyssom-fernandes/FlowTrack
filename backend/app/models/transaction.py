from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum
import uuid


class CategorizedByEnum(str, Enum):
    rule = "rule"
    cache = "cache"
    ai = "ai"
    manual = "manual"


class SyncStatusEnum(str, Enum):
    synced = "synced"
    pending = "pending"
    failed = "failed"


class TransactionCreate(BaseModel):
    account_id: str
    category_id: Optional[str] = None
    description: str
    amount: float = Field(..., description="Negative = debit, positive = credit")
    currency: str = "BRL"
    transaction_date: date
    type: str = "debit"
    is_recurring: bool = False
    installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    transaction_date: Optional[date] = None
    type: Optional[str] = None
    is_recurring: Optional[bool] = None
    notes: Optional[str] = None
    categorized_by: Optional[CategorizedByEnum] = None


class TransactionResponse(BaseModel):
    id: str
    user_id: str
    account_id: str
    category_id: Optional[str] = None
    description: str
    description_normalized: Optional[str] = None
    amount: float
    currency: str
    transaction_date: date
    type: str
    is_recurring: bool
    installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    categorized_by: Optional[CategorizedByEnum] = None
    confidence_score: Optional[float] = None
    import_batch_id: Optional[str] = None
    parser_version: Optional[str] = None
    sync_status: SyncStatusEnum
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TransactionFilters(BaseModel):
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    type: Optional[str] = None
    search: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)
