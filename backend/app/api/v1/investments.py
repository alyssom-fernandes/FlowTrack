from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import InvestmentCreate, InvestmentUpdate, InvestmentResponse, InvestmentListResponse
from app.api.v1._helpers import calc_profitability

router = APIRouter()
logger = get_logger(__name__)


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
