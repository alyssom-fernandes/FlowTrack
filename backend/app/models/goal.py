from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum


class GoalTypeEnum(str, Enum):
    spending_limit = "spending_limit"
    savings_target = "savings_target"


class GoalCreate(BaseModel):
    category_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=100)
    type: GoalTypeEnum
    target_amount: float = Field(..., gt=0)
    currency: str = "BRL"
    period: str = "monthly"
    start_date: date
    end_date: Optional[date] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    period: Optional[str] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class GoalResponse(BaseModel):
    id: str
    user_id: str
    category_id: Optional[str] = None
    name: str
    type: GoalTypeEnum
    target_amount: float
    current_amount: float
    currency: str
    period: str
    start_date: date
    end_date: Optional[date] = None
    is_active: bool
    progress_percent: float = 0.0
    created_at: datetime
    updated_at: datetime


class GoalListResponse(BaseModel):
    goals: list[GoalResponse]
    total: int
