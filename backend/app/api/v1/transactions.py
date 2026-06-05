import csv
import io
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import (
    TransactionCreate, TransactionUpdate, TransactionResponse, TransactionListResponse,
    BulkTransactionCreate, TransferCreate,
)
from app.api.v1._helpers import normalize_desc, dedup_hash, _adjust_account_balance, _write_audit, _serialize

router = APIRouter()
logger = get_logger(__name__)


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
        _write_audit(sb, user_id, "transaction", txn["id"], "create", None, {k: _serialize(v) for k, v in txn.items()})
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
        old_res = sb.table("transactions").select("*").eq("id", transaction_id).eq("user_id", user_id).single().execute()
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
            _write_audit(sb, user_id, "transaction", transaction_id, "update",
                {k: _serialize(v) for k, v in old_res.data.items()},
                {k: _serialize(v) for k, v in data.items()})
        return result.data[0]
    except HTTPException: raise
    except Exception as e:
        logger.error("update_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to update transaction")


@router.delete("/transactions/{transaction_id}", status_code=204, tags=["Transactions"])
async def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        old_res = sb.table("transactions").select("*").eq("id", transaction_id).eq("user_id", user_id).single().execute()
        result = sb.table("transactions").delete().eq("id", transaction_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Transaction not found")
        if old_res.data:
            _adjust_account_balance(sb, old_res.data["account_id"], -old_res.data["amount"])
            _write_audit(sb, user_id, "transaction", transaction_id, "delete",
                {k: _serialize(v) for k, v in old_res.data.items()}, None)
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_transaction failed", error=str(e))
        raise HTTPException(500, "Failed to delete transaction")


@router.post("/transfers", status_code=201, tags=["Transactions"])
async def create_transfer(body: TransferCreate, user_id: str = Depends(get_current_user_id)):
    """Creates two linked transactions (debit + credit) atomically and adjusts both balances."""
    try:
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


@router.post("/transactions/bulk", tags=["Transactions"])
async def bulk_create_transactions(payload: BulkTransactionCreate, user_id: str = Depends(get_current_user_id)):
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
