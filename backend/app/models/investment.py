from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class InvestmentTypeEnum(str, Enum):
    renda_fixa = "renda_fixa"
    renda_variavel = "renda_variavel"
    fundo_imobiliario = "fundo_imobiliario"
    tesouro_direto = "tesouro_direto"
    cdb = "cdb"
    lci_lca = "lci_lca"
    acoes = "acoes"
    criptomoeda = "criptomoeda"
    outro = "outro"


class InvestmentCreate(BaseModel):
    account_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=100)
    type: InvestmentTypeEnum = InvestmentTypeEnum.outro
    institution: Optional[str] = None
    total_invested: float = Field(default=0.0, ge=0)
    current_value: float = Field(default=0.0, ge=0)
    currency: str = "BRL"
    notes: Optional[str] = None


class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[InvestmentTypeEnum] = None
    institution: Optional[str] = None
    total_invested: Optional[float] = None
    current_value: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class InvestmentResponse(BaseModel):
    id: str
    user_id: str
    account_id: Optional[str] = None
    name: str
    type: InvestmentTypeEnum
    institution: Optional[str] = None
    total_invested: float
    current_value: float
    currency: str
    profitability: float = 0.0
    profitability_percent: float = 0.0
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class InvestmentListResponse(BaseModel):
    investments: list[InvestmentResponse]
    total: int
    total_invested: float
    total_current_value: float
    total_profitability: float
    total_profitability_percent: float
