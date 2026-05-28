from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.models.investment import InvestmentCreate, InvestmentUpdate, InvestmentResponse, InvestmentListResponse
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def calculate_profitability(total_invested: float, current_value: float):
    profitability = current_value - total_invested
    profitability_percent = 0.0
    if total_invested > 0:
        profitability_percent = round((profitability / total_invested) * 100, 2)
    return round(profitability, 2), profitability_percent


@router.get("", response_model=InvestmentListResponse, summary="List investments")
async def list_investments(
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        result = (
            supabase.table("investments")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at")
            .execute()
        )
        investments = result.data or []

        total_invested = sum(i["total_invested"] for i in investments)
        total_current = sum(i["current_value"] for i in investments)
        total_profit, total_profit_pct = calculate_profitability(total_invested, total_current)

        for inv in investments:
            p, pp = calculate_profitability(inv["total_invested"], inv["current_value"])
            inv["profitability"] = p
            inv["profitability_percent"] = pp

        return InvestmentListResponse(
            investments=investments,
            total=len(investments),
            total_invested=round(total_invested, 2),
            total_current_value=round(total_current, 2),
            total_profitability=total_profit,
            total_profitability_percent=total_profit_pct,
        )
    except Exception as e:
        logger.error("Failed to list investments", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list investments")


@router.post("", response_model=InvestmentResponse, status_code=201, summary="Create investment")
async def create_investment(
    body: InvestmentCreate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        data = body.model_dump()
        data["user_id"] = user_id
        result = supabase.table("investments").insert(data).execute()
        inv = result.data[0]
        p, pp = calculate_profitability(inv["total_invested"], inv["current_value"])
        inv["profitability"] = p
        inv["profitability_percent"] = pp
        return inv
    except Exception as e:
        logger.error("Failed to create investment", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create investment")


@router.patch("/{investment_id}", response_model=InvestmentResponse, summary="Update investment")
async def update_investment(
    investment_id: str,
    body: InvestmentUpdate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = (
            supabase.table("investments")
            .update(data)
            .eq("id", investment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Investment not found")
        inv = result.data[0]
        p, pp = calculate_profitability(inv["total_invested"], inv["current_value"])
        inv["profitability"] = p
        inv["profitability_percent"] = pp
        return inv
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update investment", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update investment")


@router.delete("/{investment_id}", status_code=204, summary="Delete investment")
async def delete_investment(
    investment_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        result = (
            supabase.table("investments")
            .update({"is_active": False})
            .eq("id", investment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Investment not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete investment", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete investment")
