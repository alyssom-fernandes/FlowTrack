import csv
import io
import hashlib
import re
import calendar as cal
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import date, timedelta, datetime

from app.core.security import get_current_user_id, verify_internal_token
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import (
    AccountCreate, AccountUpdate, AccountResponse, AccountListResponse,
    TransactionCreate, TransactionUpdate, TransactionResponse, TransactionListResponse,
    GoalCreate, GoalUpdate, GoalResponse, GoalListResponse,
    InvestmentCreate, InvestmentUpdate, InvestmentResponse, InvestmentListResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse, CategoryListResponse,
    CategorizedByEnum, BulkTransactionCreate, TransferCreate,
    BudgetCreate, BudgetUpdate, AlertListResponse, InsightPeriod, InsightResponse,
)

# In-memory cache for AI insights (24h TTL)
_insights_cache: dict[str, dict] = {}

router = APIRouter()
internal_router = APIRouter()
logger = get_logger(__name__)


# ── Helpers ───────────────────────────────────────────────
def normalize_desc(description: str) -> str:
    text = description.upper().strip()
    text = re.sub(r'[^A-Z0-9\s]', '', text)
    return re.sub(r'\s+', ' ', text)[:100]

def dedup_hash(account_id: str, transaction_date: date, amount: float, desc_norm: str) -> str:
    raw = f"{account_id}|{transaction_date}|{amount:.2f}|{desc_norm}"
    return hashlib.sha256(raw.encode()).hexdigest()

def calc_profitability(invested: float, current: float):
    profit = current - invested
    pct = round((profit / invested) * 100, 2) if invested > 0 else 0.0
    return round(profit, 2), pct

def calc_progress(current: float, target: float) -> float:
    return round(min((current / target) * 100, 100), 2) if target > 0 else 0.0

def _adjust_account_balance(sb, account_id: str, delta: float) -> None:
    """Non-atomic balance adjustment. Sufficient for single-user personal finance."""
    if delta == 0:
        return
    try:
        acc = sb.table("accounts").select("balance").eq("id", account_id).single().execute()
        if acc.data:
            new_bal = round((acc.data["balance"] or 0) + delta, 2)
            sb.table("accounts").update({"balance": new_bal}).eq("id", account_id).execute()
    except Exception as e:
        logger.warning("balance_adjust_failed", account_id=account_id, delta=delta, error=str(e))

def _goal_period_range(goal: dict) -> tuple[str, str]:
    today = date.today()
    period = goal.get("period", "monthly")
    if period == "monthly":
        first = date(today.year, today.month, 1)
        if today.month == 12:
            last = date(today.year, 12, 31)
        else:
            last = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return first.isoformat(), last.isoformat()
    elif period == "yearly":
        return date(today.year, 1, 1).isoformat(), date(today.year, 12, 31).isoformat()
    else:
        start = str(goal.get("start_date") or today)
        end = str(goal.get("end_date") or today)
        return start, end

def _calc_goal_current(sb, user_id: str, goal: dict) -> float:
    start, end = _goal_period_range(goal)
    q = (sb.table("transactions").select("amount")
         .eq("user_id", user_id)
         .gte("transaction_date", start)
         .lte("transaction_date", end))
    if goal.get("category_id"):
        q = q.eq("category_id", goal["category_id"])
    txns = (q.execute().data) or []
    if goal["type"] == "spending_limit":
        return round(abs(sum(t["amount"] for t in txns if t["amount"] < 0)), 2)
    return round(sum(t["amount"] for t in txns if t["amount"] > 0), 2)

def _parse_ofx(content: bytes) -> list[dict]:
    try:
        text = content.decode("latin-1", errors="replace")
    except Exception:
        text = content.decode("utf-8", errors="replace")
    blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL | re.IGNORECASE)
    if not blocks:
        blocks = re.findall(r"<STMTTRN>(.*?)(?=<STMTTRN>|</BANKTRANLIST>|$)", text, re.DOTALL | re.IGNORECASE)
    txns = []
    for block in blocks:
        def _field(tag: str) -> str:
            m = re.search(rf"<{tag}>([^\n<]+)", block, re.IGNORECASE)
            return m.group(1).strip() if m else ""
        dtposted = _field("DTPOSTED")
        trnamt = _field("TRNAMT")
        memo = _field("MEMO") or _field("NAME") or ""
        trntype = _field("TRNTYPE").upper()
        if not dtposted or not trnamt:
            continue
        try:
            tx_date = f"{dtposted[:4]}-{dtposted[4:6]}-{dtposted[6:8]}"
        except Exception:
            continue
        try:
            amount = float(trnamt.replace(",", "."))
        except ValueError:
            continue
        if amount == 0:
            continue
        txns.append({
            "description": (memo or trntype)[:200],
            "amount": amount,
            "transaction_date": tx_date,
            "type": "credit" if amount > 0 else "debit",
        })
    return txns


# ── Accounts ──────────────────────────────────────────────
@router.get("/accounts", response_model=AccountListResponse, tags=["Accounts"])
async def list_accounts(user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("accounts").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at").execute()
        accounts = result.data or []
        return AccountListResponse(accounts=accounts, total=len(accounts))
    except Exception as e:
        logger.error("list_accounts failed", error=str(e))
        raise HTTPException(500, "Failed to list accounts")

@router.post("/accounts", response_model=AccountResponse, status_code=201, tags=["Accounts"])
async def create_account(body: AccountCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id
        result = get_supabase().table("accounts").insert(data).execute()
        return result.data[0]
    except Exception as e:
        logger.error("create_account failed", error=str(e))
        raise HTTPException(500, "Failed to create account")

@router.patch("/accounts/{account_id}", response_model=AccountResponse, tags=["Accounts"])
async def update_account(account_id: str, body: AccountUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = get_supabase().table("accounts").update(data).eq("id", account_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Account not found")
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_account failed", error=str(e))
        raise HTTPException(500, "Failed to update account")

@router.delete("/accounts/{account_id}", status_code=204, tags=["Accounts"])
async def delete_account(account_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("accounts").update({"is_active": False}).eq("id", account_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Account not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_account failed", error=str(e))
        raise HTTPException(500, "Failed to delete account")


# ── Transactions ──────────────────────────────────────────
@router.get("/transactions", response_model=TransactionListResponse, tags=["Transactions"])
async def list_transactions(
    account_id: Optional[str] = Query(None), category_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None), end_date: Optional[date] = Query(None),
    type: Optional[str] = Query(None), search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=500),
    user_id: str = Depends(get_current_user_id),
):
    try:
        q = get_supabase().table("transactions").select("*", count="exact").eq("user_id", user_id)
        if account_id: q = q.eq("account_id", account_id)
        if category_id: q = q.eq("category_id", category_id)
        if start_date: q = q.gte("transaction_date", str(start_date))
        if end_date: q = q.lte("transaction_date", str(end_date))
        if type: q = q.eq("type", type)
        if search: q = q.ilike("description", f"%{search}%")
        if tag: q = q.contains("tags", [tag])
        offset = (page - 1) * page_size
        result = q.order("transaction_date", desc=True).range(offset, offset + page_size - 1).execute()
        total = result.count or 0
        return TransactionListResponse(transactions=result.data or [], total=total, page=page, page_size=page_size, total_pages=(total + page_size - 1) // page_size)
    except Exception as e:
        logger.error("list_transactions failed", error=str(e))
        raise HTTPException(500, "Failed to list transactions")

@router.post("/transactions", response_model=TransactionResponse, status_code=201, tags=["Transactions"])
async def create_transaction(body: TransactionCreate, user_id: str = Depends(get_current_user_id)):
    try:
        desc_norm = normalize_desc(body.description)
        data = body.model_dump()
        data.update({"user_id": user_id, "description_normalized": desc_norm, "sync_status": "synced",
                     "dedup_hash": dedup_hash(body.account_id, body.transaction_date, body.amount, desc_norm),
                     "transaction_date": str(body.transaction_date)})
        sb = get_supabase()
        result = sb.table("transactions").insert(data).execute()
        txn = result.data[0]
        _adjust_account_balance(sb, body.account_id, body.amount)
        if not body.category_id:
            is_demo = sb.table("demo_users").select("user_id").eq("user_id", user_id).limit(1).execute()
            if not is_demo.data:
                sb.table("categorization_queue").insert({"user_id": user_id, "transaction_id": txn["id"], "status": "pending"}).execute()
        return txn
    except Exception as e:
        if "dedup_hash" in str(e) or "unique" in str(e).lower(): raise HTTPException(409, "Duplicate transaction")
        logger.error("create_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to create transaction")

@router.patch("/transactions/{transaction_id}", response_model=TransactionResponse, tags=["Transactions"])
async def update_transaction(transaction_id: str, body: TransactionUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        if "category_id" in data and "categorized_by" not in data:
            data["categorized_by"] = "manual"; data["confidence_score"] = 1.0
        sb = get_supabase()
        old_res = sb.table("transactions").select("amount,account_id").eq("id", transaction_id).eq("user_id", user_id).single().execute()
        result = sb.table("transactions").update(data).eq("id", transaction_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Transaction not found")
        if old_res.data:
            old_amount = old_res.data["amount"]
            old_acc = old_res.data["account_id"]
            new_amount = data.get("amount", old_amount)
            new_acc = data.get("account_id", old_acc)
            if old_acc == new_acc:
                _adjust_account_balance(sb, old_acc, new_amount - old_amount)
            else:
                _adjust_account_balance(sb, old_acc, -old_amount)
                _adjust_account_balance(sb, new_acc, new_amount)
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to update transaction")

@router.delete("/transactions/{transaction_id}", status_code=204, tags=["Transactions"])
async def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        old_res = sb.table("transactions").select("amount,account_id").eq("id", transaction_id).eq("user_id", user_id).single().execute()
        result = sb.table("transactions").delete().eq("id", transaction_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Transaction not found")
        if old_res.data:
            _adjust_account_balance(sb, old_res.data["account_id"], -old_res.data["amount"])
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to delete transaction")


# ── Goals ─────────────────────────────────────────────────
@router.get("/goals", response_model=GoalListResponse, tags=["Goals"])
async def list_goals(user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        result = sb.table("goals").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at").execute()
        goals = result.data or []
        for g in goals:
            g["current_amount"] = _calc_goal_current(sb, user_id, g)
            g["progress_percent"] = calc_progress(g["current_amount"], g["target_amount"])
        return GoalListResponse(goals=goals, total=len(goals))
    except Exception as e:
        logger.error("list_goals failed", error=str(e)); raise HTTPException(500, "Failed to list goals")

@router.post("/goals", response_model=GoalResponse, status_code=201, tags=["Goals"])
async def create_goal(body: GoalCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id
        data["start_date"] = str(body.start_date)
        if body.end_date: data["end_date"] = str(body.end_date)
        result = get_supabase().table("goals").insert(data).execute()
        goal = result.data[0]; goal["progress_percent"] = 0.0
        return goal
    except Exception as e:
        logger.error("create_goal failed", error=str(e)); raise HTTPException(500, "Failed to create goal")

@router.patch("/goals/{goal_id}", response_model=GoalResponse, tags=["Goals"])
async def update_goal(goal_id: str, body: GoalUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = get_supabase().table("goals").update(data).eq("id", goal_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Goal not found")
        goal = result.data[0]; goal["progress_percent"] = calc_progress(goal["current_amount"], goal["target_amount"])
        return goal
    except HTTPException: raise
    except Exception as e:
        logger.error("update_goal failed", error=str(e)); raise HTTPException(500, "Failed to update goal")

@router.delete("/goals/{goal_id}", status_code=204, tags=["Goals"])
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("goals").update({"is_active": False}).eq("id", goal_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Goal not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_goal failed", error=str(e)); raise HTTPException(500, "Failed to delete goal")


# ── Investments ───────────────────────────────────────────
@router.get("/investments", response_model=InvestmentListResponse, tags=["Investments"])
async def list_investments(user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("investments").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at").execute()
        investments = result.data or []
        total_inv = sum(i["total_invested"] for i in investments)
        total_cur = sum(i["current_value"] for i in investments)
        tp, tpp = calc_profitability(total_inv, total_cur)
        for inv in investments:
            p, pp = calc_profitability(inv["total_invested"], inv["current_value"])
            inv["profitability"] = p; inv["profitability_percent"] = pp
        return InvestmentListResponse(investments=investments, total=len(investments), total_invested=round(total_inv, 2), total_current_value=round(total_cur, 2), total_profitability=tp, total_profitability_percent=tpp)
    except Exception as e:
        logger.error("list_investments failed", error=str(e)); raise HTTPException(500, "Failed to list investments")

@router.post("/investments", response_model=InvestmentResponse, status_code=201, tags=["Investments"])
async def create_investment(body: InvestmentCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id
        result = get_supabase().table("investments").insert(data).execute()
        inv = result.data[0]; p, pp = calc_profitability(inv["total_invested"], inv["current_value"])
        inv["profitability"] = p; inv["profitability_percent"] = pp
        return inv
    except Exception as e:
        logger.error("create_investment failed", error=str(e)); raise HTTPException(500, "Failed to create investment")

@router.patch("/investments/{investment_id}", response_model=InvestmentResponse, tags=["Investments"])
async def update_investment(investment_id: str, body: InvestmentUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = get_supabase().table("investments").update(data).eq("id", investment_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Investment not found")
        inv = result.data[0]; p, pp = calc_profitability(inv["total_invested"], inv["current_value"])
        inv["profitability"] = p; inv["profitability_percent"] = pp
        return inv
    except HTTPException: raise
    except Exception as e:
        logger.error("update_investment failed", error=str(e)); raise HTTPException(500, "Failed to update investment")

@router.delete("/investments/{investment_id}", status_code=204, tags=["Investments"])
async def delete_investment(investment_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("investments").update({"is_active": False}).eq("id", investment_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Investment not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_investment failed", error=str(e)); raise HTTPException(500, "Failed to delete investment")


# ── Export ────────────────────────────────────────────────
@router.get("/export/transactions", tags=["Export"])
async def export_transactions(
    start_date: Optional[date] = None, end_date: Optional[date] = None,
    account_id: Optional[str] = None, user_id: str = Depends(get_current_user_id),
):
    try:
        q = get_supabase().table("transactions").select("*").eq("user_id", user_id)
        if start_date: q = q.gte("transaction_date", str(start_date))
        if end_date: q = q.lte("transaction_date", str(end_date))
        if account_id: q = q.eq("account_id", account_id)
        result = q.order("transaction_date", desc=True).execute()
        output = io.StringIO()
        fields = ["id", "transaction_date", "description", "amount", "currency", "type", "category_id", "account_id", "categorized_by", "confidence_score", "is_recurring", "notes", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for t in (result.data or []): writer.writerow({k: t.get(k, "") for k in fields})
        output.seek(0)
        return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=flowtrack_{date.today()}.csv"})
    except Exception as e:
        logger.error("export failed", error=str(e)); raise HTTPException(500, "Failed to export")


# ── Import PDF ────────────────────────────────────────────
@router.post("/import/pdf/parse", tags=["Import"])
async def parse_pdf_preview(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Parse PDF and return transactions without saving — for preview before import."""
    from app.integrations.pdf_parser import parse_pdf, BANK_LABELS
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "O arquivo deve ser um PDF.")
    pdf_bytes = await file.read()
    bank, transactions = parse_pdf(pdf_bytes)
    if bank == 'unknown':
        raise HTTPException(422, "Banco não reconhecido. Suportados: Nubank, Sicredi, Mercado Pago, Will Bank.")
    if not transactions:
        label = BANK_LABELS.get(bank, bank)
        raise HTTPException(422, f"O PDF foi identificado como {label}, mas nenhuma transação pôde ser extraída. Tente exportar novamente pelo app do banco.")
    return {'bank': BANK_LABELS.get(bank, bank), 'transactions': transactions}


@router.post("/transactions/bulk", tags=["Transactions"])
async def bulk_create_transactions(
    payload: BulkTransactionCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Save a batch of transactions (used after PDF/CSV preview confirmation)."""
    sb = get_supabase()
    is_demo = sb.table('demo_users').select('user_id').eq('user_id', user_id).limit(1).execute()
    imported = skipped = 0
    balance_delta = 0.0
    for tx in payload.transactions:
        try:
            desc_norm = normalize_desc(tx.description)
            tx_date = str(tx.transaction_date)
            data = {
                'user_id': user_id,
                'account_id': payload.account_id,
                'description': tx.description,
                'description_normalized': desc_norm,
                'amount': tx.amount,
                'transaction_date': tx_date,
                'type': tx.type,
                'sync_status': 'synced',
                'dedup_hash': dedup_hash(payload.account_id, tx_date, tx.amount, desc_norm),
            }
            result = sb.table('transactions').insert(data).execute()
            txn_id = result.data[0]['id'] if result.data else None
            if txn_id and not is_demo.data:
                sb.table('categorization_queue').insert({'user_id': user_id, 'transaction_id': txn_id, 'status': 'pending'}).execute()
            imported += 1
            balance_delta += tx.amount
        except Exception as e:
            skipped += 1
            if 'dedup_hash' not in str(e) and 'unique' not in str(e).lower():
                logger.warning("bulk_import_row_failed", error=str(e))
    if imported > 0:
        _adjust_account_balance(sb, payload.account_id, balance_delta)
    return {'imported': imported, 'skipped': skipped, 'total': len(payload.transactions)}


@router.post("/import/pdf", tags=["Import"])
async def import_pdf(
    account_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    from app.integrations.pdf_parser import parse_pdf, BANK_LABELS
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "O arquivo deve ser um PDF.")
    pdf_bytes = await file.read()
    bank, transactions = parse_pdf(pdf_bytes)
    if bank == 'unknown':
        raise HTTPException(422, "Banco não reconhecido. Suportados: Nubank, Sicredi, Mercado Pago, Will Bank.")
    if not transactions:
        label = BANK_LABELS.get(bank, bank)
        raise HTTPException(422, f"O PDF foi identificado como {label}, mas nenhuma transação pôde ser extraída. Tente exportar novamente pelo app do banco.")
    sb = get_supabase()
    is_demo = sb.table('demo_users').select('user_id').eq('user_id', user_id).limit(1).execute()
    imported = skipped = 0
    balance_delta = 0.0
    for tx in transactions:
        try:
            desc_norm = normalize_desc(tx['description'])
            tx_date = tx['transaction_date']
            data = {
                'user_id': user_id,
                'account_id': account_id,
                'description': tx['description'],
                'description_normalized': desc_norm,
                'amount': tx['amount'],
                'transaction_date': tx_date,
                'type': tx['type'],
                'sync_status': 'synced',
                'dedup_hash': dedup_hash(account_id, tx_date, tx['amount'], desc_norm),
            }
            result = sb.table('transactions').insert(data).execute()
            txn_id = result.data[0]['id'] if result.data else None
            if txn_id and not is_demo.data:
                sb.table('categorization_queue').insert({'user_id': user_id, 'transaction_id': txn_id, 'status': 'pending'}).execute()
            imported += 1
            balance_delta += tx['amount']
        except Exception as e:
            skipped += 1
            if 'dedup_hash' not in str(e) and 'unique' not in str(e).lower():
                logger.warning("pdf_import_row_failed", error=str(e))
    if imported > 0:
        _adjust_account_balance(sb, account_id, balance_delta)
    return {'bank': BANK_LABELS.get(bank, bank), 'imported': imported, 'skipped': skipped, 'total': len(transactions)}


# ── Categories ────────────────────────────────────────────
@router.get("/categories", response_model=CategoryListResponse, tags=["Categories"])
async def list_categories(user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        result = sb.table("categories").select("*").or_(f"is_default.eq.true,user_id.eq.{user_id}").order("name").execute()
        cats = result.data or []
        return CategoryListResponse(categories=cats, total=len(cats))
    except Exception as e:
        logger.error("list_categories failed", error=str(e))
        raise HTTPException(500, "Failed to list categories")

@router.post("/categories", response_model=CategoryResponse, status_code=201, tags=["Categories"])
async def create_category(body: CategoryCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id; data["is_default"] = False
        result = get_supabase().table("categories").insert(data).execute()
        return result.data[0]
    except Exception as e:
        logger.error("create_category failed", error=str(e))
        raise HTTPException(500, "Failed to create category")

@router.patch("/categories/{category_id}", response_model=CategoryResponse, tags=["Categories"])
async def update_category(category_id: str, body: CategoryUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        existing = sb.table("categories").select("id,is_default,user_id").eq("id", category_id).single().execute()
        if not existing.data: raise HTTPException(404, "Category not found")
        if existing.data.get("is_default") or existing.data.get("user_id") != user_id:
            raise HTTPException(403, "Cannot edit default categories")
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = sb.table("categories").update(data).eq("id", category_id).execute()
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_category failed", error=str(e))
        raise HTTPException(500, "Failed to update category")

@router.delete("/categories/{category_id}", status_code=204, tags=["Categories"])
async def delete_category(category_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        existing = sb.table("categories").select("id,is_default,user_id").eq("id", category_id).single().execute()
        if not existing.data: raise HTTPException(404, "Category not found")
        if existing.data.get("is_default") or existing.data.get("user_id") != user_id:
            raise HTTPException(403, "Cannot delete default categories")
        sb.table("categories").delete().eq("id", category_id).execute()
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_category failed", error=str(e))
        raise HTTPException(500, "Failed to delete category")


# ── Import OFX ────────────────────────────────────────────
@router.post("/import/ofx/parse", tags=["Import"])
async def parse_ofx_preview(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".ofx") or filename.endswith(".qfx")):
        raise HTTPException(400, "O arquivo deve ser OFX ou QFX.")
    content = await file.read()
    transactions = _parse_ofx(content)
    if not transactions:
        raise HTTPException(422, "Nenhuma transação encontrada no arquivo OFX. Verifique o arquivo e tente novamente.")
    return {"transactions": transactions, "total": len(transactions)}


# ── Transfers ─────────────────────────────────────────────
@router.post("/transfers", status_code=201, tags=["Transactions"])
async def create_transfer(body: TransferCreate, user_id: str = Depends(get_current_user_id)):
    """Creates two linked transactions (debit + credit) atomically and adjusts both balances."""
    try:
        import uuid
        sb = get_supabase()
        if body.from_account_id == body.to_account_id:
            raise HTTPException(400, "Conta de origem e destino devem ser diferentes.")
        accs = sb.table("accounts").select("id,name").in_("id", [body.from_account_id, body.to_account_id]).eq("user_id", user_id).execute()
        acc_map = {a["id"]: a["name"] for a in (accs.data or [])}
        if body.from_account_id not in acc_map or body.to_account_id not in acc_map:
            raise HTTPException(404, "Conta não encontrada.")
        from_name = acc_map[body.from_account_id]
        to_name = acc_map[body.to_account_id]
        batch_id = str(uuid.uuid4())
        tx_date = str(body.transaction_date)
        debit_desc = body.description if body.description != "Transferência" else f"Transferência para {to_name}"
        credit_desc = f"Transferência de {from_name}"
        debit_norm = normalize_desc(debit_desc)
        credit_norm = normalize_desc(credit_desc)
        rows = [
            {"user_id": user_id, "account_id": body.from_account_id,
             "description": debit_desc, "description_normalized": debit_norm,
             "amount": -abs(body.amount), "transaction_date": tx_date,
             "type": "transfer", "sync_status": "synced", "import_batch_id": batch_id,
             "notes": body.notes,
             "dedup_hash": dedup_hash(body.from_account_id, body.transaction_date, -abs(body.amount), debit_norm)},
            {"user_id": user_id, "account_id": body.to_account_id,
             "description": credit_desc, "description_normalized": credit_norm,
             "amount": abs(body.amount), "transaction_date": tx_date,
             "type": "transfer", "sync_status": "synced", "import_batch_id": batch_id,
             "notes": body.notes,
             "dedup_hash": dedup_hash(body.to_account_id, body.transaction_date, abs(body.amount), credit_norm)},
        ]
        result = sb.table("transactions").insert(rows).execute()
        _adjust_account_balance(sb, body.from_account_id, -abs(body.amount))
        _adjust_account_balance(sb, body.to_account_id, abs(body.amount))
        return {"transactions": result.data, "batch_id": batch_id}
    except HTTPException: raise
    except Exception as e:
        logger.error("create_transfer failed", error=str(e))
        raise HTTPException(500, "Failed to create transfer")


# ── Summary ───────────────────────────────────────────────
@router.get("/summary/monthly", tags=["Summary"])
async def monthly_summary(months: int = Query(default=6, ge=1, le=24), user_id: str = Depends(get_current_user_id)):
    """Aggregated income/expense per month — lightweight alternative to fetching 500 transactions."""
    try:
        from datetime import date
        today = date.today()
        start = date(today.year, today.month, 1)
        for _ in range(months - 1):
            if start.month == 1:
                start = date(start.year - 1, 12, 1)
            else:
                start = date(start.year, start.month - 1, 1)
        result = (get_supabase().table("transactions").select("transaction_date,amount")
                  .eq("user_id", user_id)
                  .gte("transaction_date", start.isoformat())
                  .execute())
        monthly: dict[str, dict] = {}
        for t in (result.data or []):
            key = t["transaction_date"][:7]
            if key not in monthly:
                monthly[key] = {"month": key, "income": 0.0, "expense": 0.0}
            if t["amount"] > 0:
                monthly[key]["income"] += t["amount"]
            else:
                monthly[key]["expense"] += abs(t["amount"])
        for m in monthly.values():
            m["income"] = round(m["income"], 2)
            m["expense"] = round(m["expense"], 2)
        return sorted(monthly.values(), key=lambda x: x["month"])
    except Exception as e:
        logger.error("monthly_summary failed", error=str(e))
        raise HTTPException(500, "Failed to compute monthly summary")


# ── Alerts ───────────────────────────────────────────────
@router.get("/alerts", response_model=AlertListResponse, tags=["Alerts"])
async def list_alerts(user_id: str = Depends(get_current_user_id)):
    """Deterministic in-app alerts based on current financial state."""
    try:
        sb = get_supabase()
        today = date.today()
        month_start = date(today.year, today.month, 1).isoformat()
        month_end = date(today.year, today.month, cal.monthrange(today.year, today.month)[1]).isoformat()
        alerts = []

        # Current month transactions
        txns = sb.table("transactions").select("id,amount,category_id,is_recurring,description").eq("user_id", user_id).gte("transaction_date", month_start).lte("transaction_date", month_end).execute().data or []

        # 1. Goal spending limits approaching or exceeded
        goals = sb.table("goals").select("*").eq("user_id", user_id).eq("is_active", True).eq("type", "spending_limit").execute().data or []
        for g in goals:
            current = _calc_goal_current(sb, user_id, g)
            pct = (current / g["target_amount"] * 100) if g["target_amount"] > 0 else 0
            remaining = round(g["target_amount"] - current, 2)
            if pct >= 100:
                alerts.append({"type": "danger", "message": f'Meta "{g["name"]}" excedida em R${abs(remaining):.2f}', "category": "budget", "amount": abs(remaining)})
            elif pct >= 75:
                alerts.append({"type": "warning", "message": f'Meta "{g["name"]}" em {pct:.0f}% — faltam R${remaining:.2f}', "category": "budget", "amount": remaining})

        # 2. Negative balance accounts
        neg_accs = sb.table("accounts").select("name,balance").eq("user_id", user_id).eq("is_active", True).lt("balance", 0).execute().data or []
        for a in neg_accs:
            alerts.append({"type": "danger", "message": f'Saldo negativo: {a["name"]}', "category": "account", "amount": a["balance"]})

        # 3. Uncategorized expense transactions this month
        uncategorized = [t for t in txns if not t.get("category_id") and (t.get("amount") or 0) < 0]
        if len(uncategorized) >= 3:
            alerts.append({"type": "info", "message": f'{len(uncategorized)} transações sem categoria este mês', "category": "uncategorized"})

        # 4. Missing recurring transactions (present last month, absent this month)
        if today.month == 1:
            prev_first = date(today.year - 1, 12, 1)
            prev_last = date(today.year - 1, 12, 31)
        else:
            prev_first = date(today.year, today.month - 1, 1)
            prev_last = date(today.year, today.month, 1) - timedelta(days=1)

        prev_rec = sb.table("transactions").select("description").eq("user_id", user_id).eq("is_recurring", True).gte("transaction_date", str(prev_first)).lte("transaction_date", str(prev_last)).limit(5).execute().data or []
        curr_norms = {normalize_desc(t["description"]) for t in txns}
        for r in prev_rec:
            if normalize_desc(r["description"]) not in curr_norms:
                alerts.append({"type": "info", "message": f'Recorrente "{r["description"]}" não detectado este mês', "category": "recurring"})

        # 5. Budgets approaching limit (if budgets table exists)
        try:
            current_month = f"{today.year}-{today.month:02d}"
            budgets = sb.table("budgets").select("*").eq("user_id", user_id).eq("month", current_month).execute().data or []
            cat_spending: dict = {}
            for t in txns:
                k = t.get("category_id")
                if k and (t.get("amount") or 0) < 0:
                    cat_spending[k] = cat_spending.get(k, 0) + abs(t["amount"])
            for b in budgets:
                spent = cat_spending.get(b["category_id"], 0)
                pct = (spent / b["limit_amount"] * 100) if b["limit_amount"] > 0 else 0
                if pct >= 80 and pct < 100:
                    cat_res = sb.table("categories").select("name").eq("id", b["category_id"]).single().execute()
                    cat_name = cat_res.data["name"] if cat_res.data else "Categoria"
                    remaining = round(b["limit_amount"] - spent, 2)
                    alerts.append({"type": "warning", "message": f'Orçamento "{cat_name}" em {pct:.0f}% — faltam R${remaining:.2f}', "category": "budget", "amount": remaining})
                elif pct >= 100:
                    cat_res = sb.table("categories").select("name").eq("id", b["category_id"]).single().execute()
                    cat_name = cat_res.data["name"] if cat_res.data else "Categoria"
                    alerts.append({"type": "danger", "message": f'Orçamento "{cat_name}" excedido', "category": "budget"})
        except Exception:
            pass

        return AlertListResponse(alerts=alerts, total=len(alerts))
    except Exception as e:
        logger.error("list_alerts failed", error=str(e))
        raise HTTPException(500, "Failed to compute alerts")


# ── Cashflow Projection ───────────────────────────────────
@router.get("/cashflow/projection", tags=["Cashflow"])
async def cashflow_projection(user_id: str = Depends(get_current_user_id)):
    """Projects account balance day by day for the next 30 days based on recurring and installment transactions."""
    try:
        sb = get_supabase()
        today = date.today()
        end_date = today + timedelta(days=30)

        # Total starting balance across all accounts
        accs = sb.table("accounts").select("balance").eq("user_id", user_id).eq("is_active", True).execute().data or []
        starting_balance = round(sum(a["balance"] for a in accs), 2)

        # Recurring transactions from last 2 months to detect patterns
        if today.month <= 2:
            lookback_start = date(today.year - 1, 10, 1)
        else:
            lookback_start = date(today.year, today.month - 2, 1)
        recurring = sb.table("transactions").select("description,amount,transaction_date").eq("user_id", user_id).eq("is_recurring", True).gte("transaction_date", str(lookback_start)).execute().data or []

        # Pending installments (installment_current < installment_total)
        inst_res = sb.table("transactions").select("description,amount,transaction_date,installment_current,installment_total").eq("user_id", user_id).not_.is_("installment_total", "null").execute().data or []
        pending_inst = [t for t in inst_res if t.get("installment_current") and t.get("installment_total") and t["installment_current"] < t["installment_total"]]

        # Build events per day
        days: dict[str, list[dict]] = {}

        def add_event(d: date, desc: str, amount: float, source: str) -> None:
            if today < d <= end_date:
                key = d.isoformat()
                if key not in days:
                    days[key] = []
                days[key].append({"description": desc, "amount": round(amount, 2), "source": source})

        # Project recurring (deduplicate by normalized description)
        seen_rec: set[str] = set()
        for r in sorted(recurring, key=lambda x: x["transaction_date"], reverse=True):
            norm = normalize_desc(r["description"])
            if norm in seen_rec:
                continue
            seen_rec.add(norm)
            base = date.fromisoformat(r["transaction_date"])
            for delta_m in range(0, 3):
                year = today.year + (today.month - 1 + delta_m) // 12
                month = (today.month - 1 + delta_m) % 12 + 1
                day = min(base.day, cal.monthrange(year, month)[1])
                add_event(date(year, month, day), r["description"], r["amount"], "recurring")

        # Project pending installments
        for inst in pending_inst:
            curr = inst["installment_current"]
            total = inst["installment_total"]
            base = date.fromisoformat(inst["transaction_date"])
            for i in range(1, total - curr + 1):
                raw_month = base.month + curr + i - 1
                year = base.year + (raw_month - 1) // 12
                month = (raw_month - 1) % 12 + 1
                day = min(base.day, cal.monthrange(year, month)[1])
                add_event(date(year, month, day), inst["description"], inst["amount"], "installment")

        # Build sorted result
        result_days = []
        cumulative = 0.0
        has_negative = False
        for d_str in sorted(days):
            events = days[d_str]
            day_sum = sum(e["amount"] for e in events)
            cumulative = round(cumulative + day_sum, 2)
            proj_bal = round(starting_balance + cumulative, 2)
            if proj_bal < 0:
                has_negative = True
            result_days.append({"date": d_str, "events": events, "cumulative_change": cumulative, "projected_balance": proj_bal})

        return {
            "days": result_days,
            "starting_balance": starting_balance,
            "projected_balance": round(starting_balance + cumulative, 2),
            "has_negative_days": has_negative,
        }
    except Exception as e:
        logger.error("cashflow_projection failed", error=str(e))
        raise HTTPException(500, "Failed to compute cashflow projection")


# ── Insights (AI) ─────────────────────────────────────────
@router.post("/insights", response_model=InsightResponse, tags=["Insights"])
async def generate_insight(period: InsightPeriod, user_id: str = Depends(get_current_user_id)):
    """Generate an AI-powered financial insight for a given period, cached for 24h."""
    cache_key = f"{user_id}:{period.start_date}:{period.end_date}"
    cached = _insights_cache.get(cache_key)
    if cached and (datetime.now() - cached["ts"]).total_seconds() < 86400:
        return InsightResponse(text=cached["text"], generated_at=cached["ts"].isoformat(), cached=True)

    try:
        sb = get_supabase()
        txns = sb.table("transactions").select("amount,category_id,description,is_recurring").eq("user_id", user_id).gte("transaction_date", period.start_date).lte("transaction_date", period.end_date).execute().data or []
        goals = sb.table("goals").select("name,type,target_amount,is_active").eq("user_id", user_id).eq("is_active", True).execute().data or []
        cats = sb.table("categories").select("id,name").execute().data or []
        cat_map = {c["id"]: c["name"] for c in cats}

        expenses = [t for t in txns if (t.get("amount") or 0) < 0]
        income_t = [t for t in txns if (t.get("amount") or 0) > 0]
        total_exp = sum(abs(t["amount"]) for t in expenses)
        total_inc = sum(t["amount"] for t in income_t)
        savings_rate = round((total_inc - total_exp) / total_inc * 100, 1) if total_inc > 0 else 0

        cat_totals: dict = {}
        for t in expenses:
            k = t.get("category_id") or "__none__"
            cat_totals[k] = cat_totals.get(k, 0) + abs(t["amount"])
        top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:5]
        top_cats_str = "\n".join(f"- {cat_map.get(k, 'Sem categoria')}: R${v:.2f}" for k, v in top_cats)

        recurring_total = sum(abs(t["amount"]) for t in expenses if t.get("is_recurring"))
        goals_str = "\n".join(f'- {g["name"]} ({g["type"]}): alvo R${g["target_amount"]:.2f}' for g in goals[:3])

        from app.core.config import get_settings
        settings = get_settings()

        if not settings.anthropic_api_key or settings.anthropic_api_key in ("pendente", ""):
            text = f"Receitas: R${total_inc:.2f}. Gastos: R${total_exp:.2f}. Taxa de economia: {savings_rate}%. {len(txns)} transações no período."
        else:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            prompt = (
                f"Você é um assistente financeiro pessoal. Analise os dados abaixo e gere um insight conciso (máximo 3 frases) "
                f"em português, tom amigável, com números específicos.\n\n"
                f"Período: {period.start_date} a {period.end_date}\n"
                f"Receitas: R${total_inc:.2f} | Gastos: R${total_exp:.2f} | Economia: {savings_rate}%\n"
                f"Top categorias:\n{top_cats_str or '- Sem dados'}\n"
                f"Recorrentes: R${recurring_total:.2f}\n"
                f"Metas ativas:\n{goals_str or '- Nenhuma'}\n\nInsight:"
            )
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()

        ts = datetime.now()
        _insights_cache[cache_key] = {"text": text, "ts": ts}
        return InsightResponse(text=text, generated_at=ts.isoformat(), cached=False)
    except Exception as e:
        logger.error("generate_insight failed", error=str(e))
        raise HTTPException(500, "Failed to generate insight")


# ── Budgets ───────────────────────────────────────────────
@router.get("/budgets", tags=["Budgets"])
async def list_budgets(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), user_id: str = Depends(get_current_user_id)):
    """List budgets for a given month with spending totals."""
    try:
        sb = get_supabase()
        budgets = sb.table("budgets").select("*").eq("user_id", user_id).eq("month", month).execute().data or []
        cats = sb.table("categories").select("id,name,color").execute().data or []
        cat_map = {c["id"]: c for c in cats}

        year, mon = int(month.split("-")[0]), int(month.split("-")[1])
        month_start = f"{month}-01"
        month_end = f"{month}-{cal.monthrange(year, mon)[1]:02d}"
        txns = sb.table("transactions").select("amount,category_id").eq("user_id", user_id).gte("transaction_date", month_start).lte("transaction_date", month_end).lt("amount", 0).execute().data or []

        cat_spending: dict = {}
        for t in txns:
            k = t.get("category_id")
            if k:
                cat_spending[k] = cat_spending.get(k, 0) + abs(t["amount"])

        result = []
        for b in budgets:
            cat = cat_map.get(b["category_id"], {})
            spent = round(cat_spending.get(b["category_id"], 0), 2)
            pct = round((spent / b["limit_amount"] * 100) if b["limit_amount"] > 0 else 0, 2)
            result.append({**b, "spent": spent, "percent": pct, "category_name": cat.get("name"), "category_color": cat.get("color")})
        return {"budgets": result, "total": len(result)}
    except Exception as e:
        logger.error("list_budgets failed", error=str(e))
        raise HTTPException(500, "Failed to list budgets")

@router.post("/budgets", status_code=201, tags=["Budgets"])
async def create_budget(body: BudgetCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id
        result = get_supabase().table("budgets").insert(data).execute()
        return result.data[0]
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(409, "Já existe um orçamento para esta categoria neste mês.")
        logger.error("create_budget failed", error=str(e))
        raise HTTPException(500, "Failed to create budget")

@router.patch("/budgets/{budget_id}", tags=["Budgets"])
async def update_budget(budget_id: str, body: BudgetUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = get_supabase().table("budgets").update(data).eq("id", budget_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Budget not found")
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_budget failed", error=str(e)); raise HTTPException(500, "Failed to update budget")

@router.delete("/budgets/{budget_id}", status_code=204, tags=["Budgets"])
async def delete_budget(budget_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("budgets").delete().eq("id", budget_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Budget not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_budget failed", error=str(e)); raise HTTPException(500, "Failed to delete budget")


# ── Tags ──────────────────────────────────────────────────
@router.get("/tags", tags=["Tags"])
async def list_tags(user_id: str = Depends(get_current_user_id)):
    """Return all distinct tags used by the user across transactions."""
    try:
        result = get_supabase().table("transactions").select("tags").eq("user_id", user_id).not_.is_("tags", "null").execute()
        tags_set: set[str] = set()
        for t in (result.data or []):
            for tag in (t.get("tags") or []):
                if tag and tag.strip():
                    tags_set.add(tag.strip())
        return {"tags": sorted(tags_set)}
    except Exception as e:
        logger.error("list_tags failed", error=str(e))
        return {"tags": []}


# ── Internal ──────────────────────────────────────────────
@internal_router.post("/process-queue", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def process_queue():
    from app.integrations.claude_api import process_categorization_queue
    logger.info("Processing categorization queue")
    return process_categorization_queue(batch_size=20)


@internal_router.post("/generate-recurring", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def generate_recurring():
    """Generate recurring transactions for the current month based on last month's is_recurring=true."""
    import calendar
    sb = get_supabase()
    today = date.today()
    if today.month == 1:
        last_first = date(today.year - 1, 12, 1)
        last_last = date(today.year - 1, 12, 31)
    else:
        last_first = date(today.year, today.month - 1, 1)
        last_last = date(today.year, today.month, 1) - timedelta(days=1)
    recurring = sb.table("transactions").select("*").eq("is_recurring", True).gte("transaction_date", str(last_first)).lte("transaction_date", str(last_last)).execute().data or []
    created = skipped = 0
    for tx in recurring:
        old_day = date.fromisoformat(tx["transaction_date"]).day
        last_day = calendar.monthrange(today.year, today.month)[1]
        new_day = min(old_day, last_day)
        new_date = date(today.year, today.month, new_day)
        desc_norm = tx.get("description_normalized") or normalize_desc(tx["description"])
        tx_date_str = str(new_date)
        new_tx = {
            "user_id": tx["user_id"], "account_id": tx["account_id"],
            "category_id": tx.get("category_id"),
            "description": tx["description"], "description_normalized": desc_norm,
            "amount": tx["amount"], "transaction_date": tx_date_str,
            "type": tx["type"], "is_recurring": True,
            "sync_status": "synced", "categorized_by": "rule",
            "dedup_hash": dedup_hash(tx["account_id"], tx_date_str, tx["amount"], desc_norm),
        }
        try:
            sb.table("transactions").insert(new_tx).execute()
            _adjust_account_balance(sb, tx["account_id"], tx["amount"])
            created += 1
        except Exception as e:
            skipped += 1
            if "dedup_hash" not in str(e) and "unique" not in str(e).lower():
                logger.warning("recurring_gen_failed", error=str(e))
    logger.info("generate_recurring done", created=created, skipped=skipped)
    return {"created": created, "skipped": skipped}
