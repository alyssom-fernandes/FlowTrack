from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryListResponse

router = APIRouter()
logger = get_logger(__name__)


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
