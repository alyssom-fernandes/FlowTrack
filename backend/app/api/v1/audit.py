from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import AuditLogListResponse
from app.api.v1._helpers import _adjust_account_balance

router = APIRouter()
logger = get_logger(__name__)


@router.get("/audit-log", response_model=AuditLogListResponse, tags=["Audit"])
async def list_audit_log(user_id: str = Depends(get_current_user_id), limit: int = Query(default=50, le=100)):
    """Return the last N audit log entries for the user."""
    try:
        result = get_supabase().table("audit_log").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
        entries = result.data or []
        return AuditLogListResponse(entries=entries, total=len(entries))
    except Exception as e:
        logger.error("list_audit_log failed", error=str(e))
        return AuditLogListResponse(entries=[], total=0)


@router.post("/audit-log/{log_id}/undo", tags=["Audit"])
async def undo_audit_action(log_id: str, user_id: str = Depends(get_current_user_id)):
    """Undo the action recorded in an audit log entry (transactions only)."""
    try:
        sb = get_supabase()
        log_res = sb.table("audit_log").select("*").eq("id", log_id).eq("user_id", user_id).single().execute()
        if not log_res.data:
            raise HTTPException(404, "Entrada de auditoria não encontrada.")
        log = log_res.data
        if log.get("undone"):
            raise HTTPException(409, "Esta ação já foi desfeita.")
        if log["entity_type"] != "transaction":
            raise HTTPException(400, "Desfazer suportado apenas para transações.")

        entity_id = log["entity_id"]
        action = log["action"]
        old_values = log.get("old_values") or {}

        if action == "create":
            txn_res = sb.table("transactions").select("amount,account_id").eq("id", entity_id).eq("user_id", user_id).single().execute()
            if txn_res.data:
                _adjust_account_balance(sb, txn_res.data["account_id"], -txn_res.data["amount"])
                sb.table("transactions").delete().eq("id", entity_id).eq("user_id", user_id).execute()

        elif action == "delete":
            if old_values:
                restore = {k: v for k, v in old_values.items() if k not in ("created_at", "updated_at")}
                restore["sync_status"] = "synced"
                try:
                    sb.table("transactions").insert(restore).execute()
                    amt = old_values.get("amount", 0)
                    acc = old_values.get("account_id")
                    if amt and acc:
                        _adjust_account_balance(sb, acc, float(amt))
                except Exception:
                    raise HTTPException(500, "Não foi possível restaurar a transação.")

        elif action == "update":
            if old_values:
                to_restore = {k: v for k, v in old_values.items() if k not in ("id", "user_id", "created_at", "updated_at", "description_normalized", "dedup_hash", "sync_status")}
                curr_res = sb.table("transactions").select("amount,account_id").eq("id", entity_id).single().execute()
                if curr_res.data and "amount" in old_values and "account_id" in old_values:
                    old_amt = float(old_values["amount"])
                    curr_amt = curr_res.data["amount"]
                    _adjust_account_balance(sb, curr_res.data["account_id"], old_amt - curr_amt)
                sb.table("transactions").update(to_restore).eq("id", entity_id).eq("user_id", user_id).execute()

        sb.table("audit_log").update({"undone": True}).eq("id", log_id).execute()
        return {"undone": True, "action": action, "entity_id": entity_id}
    except HTTPException: raise
    except Exception as e:
        logger.error("undo_audit_action failed", error=str(e))
        raise HTTPException(500, "Falha ao desfazer ação.")
