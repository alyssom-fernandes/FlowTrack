import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from app.core.security import verify_internal_token
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.api.v1._helpers import normalize_desc, dedup_hash, _adjust_account_balance

router = APIRouter()
logger = get_logger(__name__)


@router.post("/process-queue", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def process_queue():
    from app.integrations.claude_api import process_categorization_queue
    logger.info("Processing categorization queue")
    return process_categorization_queue(batch_size=20)


@router.post("/snapshot-net-worth", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def snapshot_net_worth():
    """Save a net worth snapshot for all users. Run on the 1st of each month."""
    sb = get_supabase()
    today = date.today()
    users_res = sb.table("accounts").select("user_id").execute()
    user_ids = list({r["user_id"] for r in (users_res.data or [])})
    saved = 0
    for uid in user_ids:
        try:
            accs = sb.table("accounts").select("balance").eq("user_id", uid).eq("is_active", True).execute().data or []
            invs = sb.table("investments").select("current_value").eq("user_id", uid).eq("is_active", True).execute().data or []
            total_accs = round(sum(a["balance"] for a in accs), 2)
            total_invs = round(sum(i["current_value"] for i in invs), 2)
            sb.table("net_worth_snapshots").upsert({
                "user_id": uid, "date": str(today),
                "total_accounts": total_accs, "total_investments": total_invs,
                "net_worth": round(total_accs + total_invs, 2),
            }, on_conflict="user_id,date").execute()
            saved += 1
        except Exception as e:
            logger.warning("snapshot_net_worth_user_failed", user_id=uid, error=str(e))
    logger.info("snapshot_net_worth done", users=saved)
    return {"saved": saved}


@router.post("/generate-recurring", tags=["Internal"], dependencies=[Depends(verify_internal_token)])
def generate_recurring():
    """Generate recurring transactions for the current month based on last month's is_recurring=true."""
    sb = get_supabase()
    today = date.today()
    if today.month == 1:
        last_first = date(today.year - 1, 12, 1)
        last_last = date(today.year - 1, 12, 31)
    else:
        last_first = date(today.year, today.month - 1, 1)
        last_last = date(today.year, today.month, 1) - timedelta(days=1)
    recurring = sb.table("transactions").select("*").eq("is_recurring", True).gte("transaction_date", str(last_first)).lte("transaction_date", str(last_last)).execute().data or []
    created = skipped = 0
    for tx in recurring:
        old_day = date.fromisoformat(tx["transaction_date"]).day
        last_day = calendar.monthrange(today.year, today.month)[1]
        new_day = min(old_day, last_day)
        new_date = date(today.year, today.month, new_day)
        desc_norm = tx.get("description_normalized") or normalize_desc(tx["description"])
        tx_date_str = str(new_date)
        new_tx = {
            "user_id": tx["user_id"], "account_id": tx["account_id"],
            "category_id": tx.get("category_id"),
            "description": tx["description"], "description_normalized": desc_norm,
            "amount": tx["amount"], "transaction_date": tx_date_str,
            "type": tx["type"], "is_recurring": True,
            "sync_status": "synced", "categorized_by": "rule",
            "dedup_hash": dedup_hash(tx["account_id"], tx_date_str, tx["amount"], desc_norm),
        }
        try:
            sb.table("transactions").insert(new_tx).execute()
            _adjust_account_balance(sb, tx["account_id"], tx["amount"])
            created += 1
        except Exception as e:
            skipped += 1
            if "dedup_hash" not in str(e) and "unique" not in str(e).lower():
                logger.warning("recurring_gen_failed", error=str(e))
    logger.info("generate_recurring done", created=created, skipped=skipped)
    return {"created": created, "skipped": skipped}
