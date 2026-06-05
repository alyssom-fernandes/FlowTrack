from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import AccountCreate, AccountUpdate, AccountResponse, AccountListResponse

router = APIRouter()
logger = get_logger(__name__)


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
