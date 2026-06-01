import csv
import io
import hashlib
import re
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import date

from app.core.security import get_current_user_id, verify_internal_token
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import (
    AccountCreate, AccountUpdate, AccountResponse, AccountListResponse,
    TransactionCreate, TransactionUpdate, TransactionResponse, TransactionListResponse,
    GoalCreate, GoalUpdate, GoalResponse, GoalListResponse,
    InvestmentCreate, InvestmentUpdate, InvestmentResponse, InvestmentListResponse,
    CategorizedByEnum,
)

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
        result = get_supabase().table("transactions").insert(data).execute()
        txn = result.data[0]
        if not body.category_id:
            is_demo = get_supabase().table("demo_users").select("user_id").eq("user_id", user_id).limit(1).execute()
            if not is_demo.data:
                get_supabase().table("categorization_queue").insert({"user_id": user_id, "transaction_id": txn["id"], "status": "pending"}).execute()
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
        result = get_supabase().table("transactions").update(data).eq("id", transaction_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Transaction not found")
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to update transaction")

@router.delete("/transactions/{transaction_id}", status_code=204, tags=["Transactions"])
async def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("transactions").delete().eq("id", transaction_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Transaction not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to delete transaction")


# ── Goals ─────────────────────────────────────────────────
@router.get("/goals", response_model=GoalListResponse, tags=["Goals"])
async def list_goals(user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("goals").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at").execute()
        goals = result.data or []
        for g in goals: g["progress_percent"] = calc_progress(g["current_amount"], g["target_amount"])
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
    imported = skipped = 0
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
            result = get_supabase().table('transactions').insert(data).execute()
            txn_id = result.data[0]['id'] if result.data else None
            if txn_id:
                is_demo = get_supabase().table('demo_users').select('user_id').eq('user_id', user_id).limit(1).execute()
                if not is_demo.data:
                    get_supabase().table('categorization_queue').insert({'user_id': user_id, 'transaction_id': txn_id, 'status': 'pending'}).execute()
            imported += 1
        except Exception as e:
            skipped += 1
            if 'dedup_hash' not in str(e) and 'unique' not in str(e).lower():
                logger.warning("pdf_import_row_failed", error=str(e))
    return {'bank': BANK_LABELS.get(bank, bank), 'imported': imported, 'skipped': skipped, 'total': len(transactions)}


# ── Internal ──────────────────────────────────────────────
@internal_router.post("/process-queue", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def process_queue():
    from app.integrations.claude_api import process_categorization_queue
    logger.info("Processing categorization queue")
    return process_categorization_queue(batch_size=20)
