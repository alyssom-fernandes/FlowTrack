from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import GoalCreate, GoalUpdate, GoalResponse, GoalListResponse
from app.api.v1._helpers import calc_progress, _calc_goal_current

router = APIRouter()
logger = get_logger(__name__)


@router.get("/goals", response_model=GoalListResponse, tags=["Goals"])
async def list_goals(user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_supabase()
        result = sb.table("goals").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at").execute()
        goals = result.data or []
        for g in goals:
            g["current_amount"] = _calc_goal_current(sb, user_id, g)
            g["progress_percent"] = calc_progress(g["current_amount"], g["target_amount"])
        return GoalListResponse(goals=goals, total=len(goals))
    except Exception as e:
        logger.error("list_goals failed", error=str(e)); raise HTTPException(500, "Failed to list goals")


@router.post("/goals", response_model=GoalResponse, status_code=201, tags=["Goals"])
async def create_goal(body: GoalCreate, user_id: str = Depends(get_current_user_id)):
    try:
        data = body.model_dump(); data["user_id"] = user_id
        data["start_date"] = str(body.start_date)
        if body.end_date: data["end_date"] = str(body.end_date)
        result = get_supabase().table("goals").insert(data).execute()
        goal = result.data[0]; goal["progress_percent"] = 0.0
        return goal
    except Exception as e:
        logger.error("create_goal failed", error=str(e)); raise HTTPException(500, "Failed to create goal")


@router.patch("/goals/{goal_id}", response_model=GoalResponse, tags=["Goals"])
async def update_goal(goal_id: str, body: GoalUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not data: raise HTTPException(400, "No fields to update")
        result = get_supabase().table("goals").update(data).eq("id", goal_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Goal not found")
        goal = result.data[0]; goal["progress_percent"] = calc_progress(goal["current_amount"], goal["target_amount"])
        return goal
    except HTTPException: raise
    except Exception as e:
        logger.error("update_goal failed", error=str(e)); raise HTTPException(500, "Failed to update goal")


@router.delete("/goals/{goal_id}", status_code=204, tags=["Goals"])
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = get_supabase().table("goals").update({"is_active": False}).eq("id", goal_id).eq("user_id", user_id).execute()
        if not result.data: raise HTTPException(404, "Goal not found")
    except HTTPException: raise
    except Exception as e:
        logger.error("delete_goal failed", error=str(e)); raise HTTPException(500, "Failed to delete goal")
