from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.models.account import AccountCreate, AccountUpdate, AccountResponse, AccountListResponse
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("", response_model=AccountListResponse, summary="List all accounts")
async def list_accounts(
    user_id: str = Depends(get_current_user_id),
):
    """Returns all active accounts for the authenticated user."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("accounts")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at")
            .execute()
        )
        accounts = result.data or []
        return AccountListResponse(accounts=accounts, total=len(accounts))
    except Exception as e:
        logger.error("Failed to list accounts", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail="Failed to list accounts")


@router.post("", response_model=AccountResponse, status_code=201, summary="Create account")
async def create_account(
    body: AccountCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Creates a new bank account for the authenticated user."""
    try:
        supabase = get_supabase()
        data = body.model_dump()
        data["user_id"] = user_id
        result = supabase.table("accounts").insert(data).execute()
        return result.data[0]
    except Exception as e:
        logger.error("Failed to create account", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail="Failed to create account")


@router.get("/{account_id}", response_model=AccountResponse, summary="Get account")
async def get_account(
    account_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Returns a single account by ID."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("accounts")
            .select("*")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Account not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get account", error=str(e), account_id=account_id)
        raise HTTPException(status_code=500, detail="Failed to get account")


@router.patch("/{account_id}", response_model=AccountResponse, summary="Update account")
async def update_account(
    account_id: str,
    body: AccountUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Updates an existing account."""
    try:
        supabase = get_supabase()
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = (
            supabase.table("accounts")
            .update(data)
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Account not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update account", error=str(e), account_id=account_id)
        raise HTTPException(status_code=500, detail="Failed to update account")


@router.delete("/{account_id}", status_code=204, summary="Delete account")
async def delete_account(
    account_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Soft deletes an account (sets is_active = false)."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("accounts")
            .update({"is_active": False})
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Account not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete account", error=str(e), account_id=account_id)
        raise HTTPException(status_code=500, detail="Failed to delete account")
