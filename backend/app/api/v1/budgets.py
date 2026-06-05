import calendar as cal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import BudgetCreate, BudgetUpdate

router = APIRouter()
logger = get_logger(__name__)


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
