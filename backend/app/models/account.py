from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    bank_name: str = Field(..., min_length=1, max_length=100)
    bank_color: str = "#9D2449"
    account_type: str = "checking"
    currency: str = "BRL"
    balance: float = 0.0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_color: Optional[str] = None
    account_type: Optional[str] = None
    balance: Optional[float] = None
    is_active: Optional[bool] = None


class AccountResponse(BaseModel):
    id: str
    user_id: str
    name: str
    bank_name: str
    bank_color: str
    account_type: str
    currency: str
    balance: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AccountListResponse(BaseModel):
    accounts: list[AccountResponse]
    total: int
