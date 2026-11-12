from datetime import date, datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints


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
    name: str | None = None; bank_name: str | None = None
    bank_color: str | None = None; account_type: str | None = None
    balance: float | None = None; is_active: bool | None = None

class AccountResponse(BaseModel):
    id: str; user_id: str; name: str; bank_name: str; bank_color: str
    account_type: str; currency: str; balance: float; is_active: bool
    created_at: datetime; updated_at: datetime

class AccountListResponse(BaseModel):
    accounts: list[AccountResponse]; total: int


# ── Transaction ───────────────────────────────────────────
class TransactionCreate(BaseModel):
    account_id: str; category_id: str | None = None
    description: str = Field(..., min_length=1, max_length=300)
    amount: float = Field(..., description="Negative = debit, positive = credit")
    currency: str = "BRL"; transaction_date: date; type: str = "debit"
    is_recurring: bool = False; installment_current: int | None = None
    installment_total: int | None = None; notes: str | None = Field(None, max_length=1000)
    tags: list[str] | None = Field(None, max_length=20)

class TransactionUpdate(BaseModel):
    account_id: str | None = None; category_id: str | None = None
    description: str | None = None; amount: float | None = None
    transaction_date: date | None = None; type: str | None = None
    is_recurring: bool | None = None; notes: str | None = None
    categorized_by: CategorizedByEnum | None = None
    tags: list[str] | None = None

class TransactionResponse(BaseModel):
    id: str; user_id: str; account_id: str; category_id: str | None = None
    description: str; description_normalized: str | None = None
    amount: float; currency: str; transaction_date: date; type: str
    is_recurring: bool; installment_current: int | None = None
    installment_total: int | None = None
    categorized_by: CategorizedByEnum | None = None
    confidence_score: float | None = None
    import_batch_id: str | None = None; parser_version: str | None = None
    sync_status: SyncStatusEnum; notes: str | None = None
    tags: list[str] | None = None
    created_at: datetime; updated_at: datetime

class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]; total: int
    page: int; page_size: int; total_pages: int


# ── Goal ──────────────────────────────────────────────────
# Identidade da meta de economia: a cor é o nome de um token da paleta validada (o tema
# decide o tom), e o ícone é um nome de glifo no padrão lucide (components/glyphs.tsx)
GoalColor = Literal["accent", "cat-1", "cat-2", "cat-3", "cat-5", "cat-6", "cat-7"]
GoalIcon = Annotated[str, StringConstraints(max_length=40, pattern=r"^[a-z][a-z-]*$")]

class GoalCreate(BaseModel):
    category_id: str | None = None
    name: str = Field(..., min_length=1, max_length=100)
    type: GoalTypeEnum; target_amount: float = Field(..., gt=0)
    currency: str = "BRL"; period: str = "monthly"
    start_date: date; end_date: date | None = None
    color: GoalColor | None = None
    icon: GoalIcon | None = None

class GoalUpdate(BaseModel):
    name: str | None = None; target_amount: float | None = None
    period: str | None = None
    end_date: date | None = None; is_active: bool | None = None
    color: GoalColor | None = None
    icon: GoalIcon | None = None

class GoalResponse(BaseModel):
    id: str; user_id: str; category_id: str | None = None
    name: str; type: GoalTypeEnum; target_amount: float
    current_amount: float; currency: str; period: str
    start_date: date; end_date: date | None = None
    is_active: bool; progress_percent: float = 0.0
    # Linhas antigas guardam o que o banco tiver; só a entrada é validada
    color: str | None = None; icon: str | None = None
    created_at: datetime; updated_at: datetime

class GoalListResponse(BaseModel):
    goals: list[GoalResponse]; total: int


# ── Investment ────────────────────────────────────────────
class InvestmentCreate(BaseModel):
    account_id: str | None = None
    name: str = Field(..., min_length=1, max_length=100)
    type: InvestmentTypeEnum = InvestmentTypeEnum.outro
    institution: str | None = None
    total_invested: float = Field(default=0.0, ge=0)
    current_value: float = Field(default=0.0, ge=0)
    currency: str = "BRL"; notes: str | None = None

class InvestmentUpdate(BaseModel):
    name: str | None = None; type: InvestmentTypeEnum | None = None
    institution: str | None = None; total_invested: float | None = None
    current_value: float | None = None; notes: str | None = None
    is_active: bool | None = None

class InvestmentResponse(BaseModel):
    id: str; user_id: str; account_id: str | None = None
    name: str; type: InvestmentTypeEnum; institution: str | None = None
    total_invested: float; current_value: float; currency: str
    profitability: float = 0.0; profitability_percent: float = 0.0
    notes: str | None = None; is_active: bool
    created_at: datetime; updated_at: datetime

class InvestmentListResponse(BaseModel):
    investments: list[InvestmentResponse]; total: int
    total_invested: float; total_current_value: float
    total_profitability: float; total_profitability_percent: float


# ── Category ──────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: str = "#9D2449"
    icon: str | None = None

class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None

class CategoryResponse(BaseModel):
    id: str; user_id: str | None = None
    name: str; icon: str | None = None; color: str
    is_default: bool; created_at: datetime

class CategoryListResponse(BaseModel):
    categories: list[CategoryResponse]; total: int


# ── Transfer ──────────────────────────────────────────────
class TransferCreate(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float = Field(..., gt=0, description="Positive amount to transfer")
    description: str = "Transferência"
    transaction_date: date
    notes: str | None = None

# ── Import ────────────────────────────────────────────────
class ParsedTransactionItem(BaseModel):
    description: str = Field(..., min_length=1, max_length=300)
    amount: float
    transaction_date: date
    type: str = 'debit'
    # Categoria conferida na revisão da importação: a sugestão aceita ("rule") ou a escolha da pessoa ("manual")
    category_id: str | None = None
    categorized_by: Literal['rule', 'manual'] | None = None
    confidence_score: float | None = Field(None, ge=0, le=1)

class BulkTransactionCreate(BaseModel):
    account_id: str
    # Um extrato de banco cabe com folga; acima disso, importe em partes
    transactions: list[ParsedTransactionItem] = Field(..., max_length=2000)


# ── Regra de categoria ("Aplicar sempre") ─────────────────
class CategoryRuleCreate(BaseModel):
    # A descrição como aparece no extrato; a regra vale para a forma normalizada dela
    description: str = Field(..., min_length=1, max_length=300)
    category_id: str


# ── Budget ────────────────────────────────────────────────
class BudgetCreate(BaseModel):
    category_id: str
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM")
    limit_amount: float = Field(..., gt=0)

class BudgetUpdate(BaseModel):
    limit_amount: float | None = Field(None, gt=0)

class BudgetResponse(BaseModel):
    id: str; user_id: str; category_id: str; month: str
    limit_amount: float; created_at: datetime

class BudgetWithSpending(BudgetResponse):
    spent: float; percent: float
    category_name: str | None = None
    category_color: str | None = None

class BudgetListResponse(BaseModel):
    budgets: list[BudgetWithSpending]; total: int


# ── Alerts ────────────────────────────────────────────────
class AlertItem(BaseModel):
    type: str  # 'danger' | 'warning' | 'info'
    message: str
    category: str  # 'budget' | 'goal' | 'account' | 'uncategorized' | 'recurring'
    subject: str | None = None  # nome da categoria, meta ou recorrente (para agrupar na tela)
    amount: float | None = None

class AlertListResponse(BaseModel):
    alerts: list[AlertItem]; total: int


# ── Insights ──────────────────────────────────────────────
class InsightPeriod(BaseModel):
    start_date: str
    end_date: str
    refresh: bool = False  # True = gera de novo mesmo com resumo guardado
    language: Literal["pt", "en"] = "pt"  # idioma da interface: o resumo vem nele

class InsightResponse(BaseModel):
    text: str
    generated_at: str
    cached: bool
    # Receitas e gastos que o resumo usou: a tela compara com os números atuais e avisa se mudaram
    income: float | None = None
    expense: float | None = None
    # "ai": escrito pelo Claude; "template": texto montado sem IA (sem chave da Anthropic)
    source: Literal["ai", "template"] = "ai"


# ── Cashflow ──────────────────────────────────────────────
class CashflowEvent(BaseModel):
    description: str
    amount: float
    source: str  # 'recurring' | 'installment'

class CashflowDay(BaseModel):
    date: str
    events: list[CashflowEvent]
    cumulative_change: float
    projected_balance: float

class CashflowProjection(BaseModel):
    days: list[CashflowDay]
    starting_balance: float
    projected_balance: float
    has_negative_days: bool


# ── Net Worth ─────────────────────────────────────────────
class NetWorthSnapshot(BaseModel):
    date: str
    total_accounts: float
    total_investments: float
    net_worth: float

class NetWorthResponse(BaseModel):
    total_accounts: float
    total_investments: float
    net_worth: float
    snapshots: list[NetWorthSnapshot]


# ── Projections ───────────────────────────────────────────
class MonthData(BaseModel):
    month: str
    income: float
    expense: float
    is_projection: bool

class ProjectionResponse(BaseModel):
    history: list[MonthData]
    projections: list[MonthData]
    months_available: int
    avg_income: float
    avg_expense: float


# ── Audit Log ─────────────────────────────────────────────
class AuditLogEntry(BaseModel):
    id: str
    user_id: str
    entity_type: str
    entity_id: str
    action: str
    old_values: dict | None = None
    new_values: dict | None = None
    undone: bool = False
    created_at: datetime

class AuditLogListResponse(BaseModel):
    entries: list[AuditLogEntry]
    total: int
