from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.models.goal import GoalCreate, GoalUpdate, GoalResponse, GoalListResponse
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def calculate_progress(current: float, target: float) -> float:
    if target <= 0:
        return 0.0
    return round(min((current / target) * 100, 100), 2)


@router.get("", response_model=GoalListResponse, summary="List goals")
async def list_goals(
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        result = (
            supabase.table("goals")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at")
            .execute()
        )
        goals = result.data or []
        for g in goals:
            g["progress_percent"] = calculate_progress(g["current_amount"], g["target_amount"])
        return GoalListResponse(goals=goals, total=len(goals))
    except Exception as e:
        logger.error("Failed to list goals", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list goals")


@router.post("", response_model=GoalResponse, status_code=201, summary="Create goal")
async def create_goal(
    body: GoalCreate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        data = body.model_dump()
        data["user_id"] = user_id
        data["start_date"] = str(body.start_date)
        if body.end_date:
            data["end_date"] = str(body.end_date)
        result = supabase.table("goals").insert(data).execute()
        goal = result.data[0]
        goal["progress_percent"] = 0.0
        return goal
    except Exception as e:
        logger.error("Failed to create goal", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create goal")


@router.patch("/{goal_id}", response_model=GoalResponse, summary="Update goal")
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = (
            supabase.table("goals")
            .update(data)
            .eq("id", goal_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Goal not found")
        goal = result.data[0]
        goal["progress_percent"] = calculate_progress(goal["current_amount"], goal["target_amount"])
        return goal
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update goal", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update goal")


@router.delete("/{goal_id}", status_code=204, summary="Delete goal")
async def delete_goal(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        supabase = get_supabase()
        result = (
            supabase.table("goals")
            .update({"is_active": False})
            .eq("id", goal_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Goal not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete goal", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete goal")
