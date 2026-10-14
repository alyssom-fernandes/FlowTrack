from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import AuditLogListResponse
from app.api.v1._helpers import _adjust_account_balance, _first, _require_account, _require_category, RESTORABLE_FIELDS

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
        log = _first(sb.table("audit_log").select("*").eq("id", log_id).eq("user_id", user_id).limit(1).execute().data)
        if not log:
            raise HTTPException(404, "Entrada de auditoria não encontrada.")
        if log.get("undone"):
            raise HTTPException(409, "Esta ação já foi desfeita.")
        if log["entity_type"] != "transaction":
            raise HTTPException(400, "Desfazer suportado apenas para transações.")
        claimed = sb.table("audit_log").update({"undone": True}).eq("id", log_id).eq("user_id", user_id).eq("undone", False).execute()
        if not claimed.data:
            raise HTTPException(409, "Esta ação já foi desfeita.")
        try:
            return _undo(sb, user_id, log)
        except Exception:
            # Não deu certo: devolve o registro para "não desfeito"
            sb.table("audit_log").update({"undone": False}).eq("id", log_id).eq("user_id", user_id).execute()
            raise
    except HTTPException: raise
    except Exception as e:
        logger.error("undo_audit_action failed", error=str(e))
        raise HTTPException(500, "Falha ao desfazer ação.")


def _undo(sb, user_id: str, log: dict) -> dict:
    """Aplica o desfazer de um registro já reservado (undone=True)."""

    entity_id = log["entity_id"]
    action = log["action"]
    old_values = log.get("old_values") or {}

    if action == "create":
        txn = _first(sb.table("transactions").select("amount,account_id").eq("id", entity_id).eq("user_id", user_id).limit(1).execute().data)
        if txn:
            _adjust_account_balance(sb, user_id, txn["account_id"], -txn["amount"])
            sb.table("transactions").delete().eq("id", entity_id).eq("user_id", user_id).execute()

    elif action == "delete":
        if old_values:
            # O dono vem do token, nunca do histórico; conta e categoria são conferidas de novo
            restore = {k: old_values[k] for k in RESTORABLE_FIELDS if k in old_values}
            restore.update({"id": entity_id, "user_id": user_id, "sync_status": "synced"})
            if not isinstance(restore.get("tags"), (list, type(None))):
                restore.pop("tags", None)
            _require_account(sb, user_id, restore.get("account_id"))
            try:
                _require_category(sb, user_id, restore.get("category_id"))
            except HTTPException:
                restore["category_id"] = None
            try:
                sb.table("transactions").insert(restore).execute()
            except Exception:
                raise HTTPException(500, "Não foi possível restaurar a transação.")
            amt = float(restore.get("amount") or 0)
            if amt:
                _adjust_account_balance(sb, user_id, restore["account_id"], amt)

    elif action == "update":
        if old_values:
            to_restore = {k: old_values[k] for k in RESTORABLE_FIELDS
                          if k in old_values and k not in ("description_normalized", "dedup_hash")}
            if not isinstance(to_restore.get("tags"), (list, type(None))):
                to_restore.pop("tags", None)
            curr = _first(sb.table("transactions").select("amount,account_id").eq("id", entity_id).eq("user_id", user_id).limit(1).execute().data)
            if not curr:
                raise HTTPException(404, "Transação não encontrada.")
            if "account_id" in to_restore:
                _require_account(sb, user_id, to_restore["account_id"])
            if "category_id" in to_restore:
                _require_category(sb, user_id, to_restore["category_id"])
            if "amount" in to_restore:
                old_amt = float(to_restore["amount"])
                old_acc = to_restore.get("account_id", curr["account_id"])
                if old_acc == curr["account_id"]:
                    _adjust_account_balance(sb, user_id, old_acc, old_amt - curr["amount"])
                else:
                    _adjust_account_balance(sb, user_id, curr["account_id"], -curr["amount"])
                    _adjust_account_balance(sb, user_id, old_acc, old_amt)
            sb.table("transactions").update(to_restore).eq("id", entity_id).eq("user_id", user_id).execute()

    return {"undone": True, "action": action, "entity_id": entity_id}
