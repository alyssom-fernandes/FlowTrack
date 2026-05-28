import hashlib
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import date
from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.models.transaction import (
    TransactionCreate, TransactionUpdate,
    TransactionResponse, TransactionListResponse
)
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def normalize_description(description: str) -> str:
    """Normalizes transaction description for merchant cache lookup."""
    text = description.upper().strip()
    text = re.sub(r'[^A-Z0-9\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text[:100]


def make_dedup_hash(account_id: str, transaction_date: date, amount: float, description_normalized: str) -> str:
    """Creates deduplication hash for a transaction."""
    raw = f"{account_id}|{transaction_date}|{amount:.2f}|{description_normalized}"
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get("", response_model=TransactionListResponse, summary="List transactions")
async def list_transactions(
    account_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
):
    """Returns paginated transactions with optional filters."""
    try:
        supabase = get_supabase()
        query = supabase.table("transactions").select("*", count="exact").eq("user_id", user_id)

        if account_id:
            query = query.eq("account_id", account_id)
        if category_id:
            query = query.eq("category_id", category_id)
        if start_date:
            query = query.gte("transaction_date", str(start_date))
        if end_date:
            query = query.lte("transaction_date", str(end_date))
        if type:
            query = query.eq("type", type)
        if search:
            query = query.ilike("description", f"%{search}%")

        offset = (page - 1) * page_size
        query = query.order("transaction_date", desc=True).range(offset, offset + page_size - 1)

        result = query.execute()
        total = result.count or 0
        total_pages = (total + page_size - 1) // page_size

        return TransactionListResponse(
            transactions=result.data or [],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    except Exception as e:
        logger.error("Failed to list transactions", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail="Failed to list transactions")


@router.post("", response_model=TransactionResponse, status_code=201, summary="Create transaction")
async def create_transaction(
    body: TransactionCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Creates a new transaction. Queues for AI categorization if no category provided."""
    try:
        supabase = get_supabase()
        description_normalized = normalize_description(body.description)
        dedup_hash = make_dedup_hash(
            body.account_id, body.transaction_date, body.amount, description_normalized
        )

        data = body.model_dump()
        data["user_id"] = user_id
        data["description_normalized"] = description_normalized
        data["dedup_hash"] = dedup_hash
        data["sync_status"] = "synced"
        data["transaction_date"] = str(body.transaction_date)

        result = supabase.table("transactions").insert(data).execute()
        transaction = result.data[0]

        # Queue for AI categorization if no category
        if not body.category_id:
            supabase.table("categorization_queue").insert({
                "user_id": user_id,
                "transaction_id": transaction["id"],
                "status": "pending",
            }).execute()

        return transaction
    except Exception as e:
        error_str = str(e)
        if "dedup_hash" in error_str or "unique" in error_str.lower():
            raise HTTPException(status_code=409, detail="Duplicate transaction")
        logger.error("Failed to create transaction", error=error_str, user_id=user_id)
        raise HTTPException(status_code=500, detail="Failed to create transaction")


@router.get("/{transaction_id}", response_model=TransactionResponse, summary="Get transaction")
async def get_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Returns a single transaction by ID."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("transactions")
            .select("*")
            .eq("id", transaction_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get transaction", error=str(e), transaction_id=transaction_id)
        raise HTTPException(status_code=500, detail="Failed to get transaction")


@router.patch("/{transaction_id}", response_model=TransactionResponse, summary="Update transaction")
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Updates a transaction. Manual category changes are tracked."""
    try:
        supabase = get_supabase()
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Mark as manually categorized if category changed
        if "category_id" in data and "categorized_by" not in data:
            data["categorized_by"] = "manual"
            data["confidence_score"] = 1.0

        result = (
            supabase.table("transactions")
            .update(data)
            .eq("id", transaction_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update transaction", error=str(e), transaction_id=transaction_id)
        raise HTTPException(status_code=500, detail="Failed to update transaction")


@router.delete("/{transaction_id}", status_code=204, summary="Delete transaction")
async def delete_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Permanently deletes a transaction."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("transactions")
            .delete()
            .eq("id", transaction_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Transaction not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete transaction", error=str(e), transaction_id=transaction_id)
        raise HTTPException(status_code=500, detail="Failed to delete transaction")
