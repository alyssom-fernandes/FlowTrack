import csv
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import date
from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/transactions", summary="Export transactions as CSV")
async def export_transactions(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """Exports all transactions as a downloadable CSV file."""
    try:
        supabase = get_supabase()
        query = supabase.table("transactions").select("*").eq("user_id", user_id)

        if start_date:
            query = query.gte("transaction_date", str(start_date))
        if end_date:
            query = query.lte("transaction_date", str(end_date))
        if account_id:
            query = query.eq("account_id", account_id)

        result = query.order("transaction_date", desc=True).execute()
        transactions = result.data or []

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "id", "transaction_date", "description", "amount", "currency",
            "type", "category_id", "account_id", "categorized_by",
            "confidence_score", "is_recurring", "notes", "created_at"
        ])
        writer.writeheader()
        for t in transactions:
            writer.writerow({k: t.get(k, "") for k in writer.fieldnames})

        output.seek(0)
        filename = f"flowtrack_transactions_{date.today()}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        logger.error("Failed to export transactions", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to export transactions")
