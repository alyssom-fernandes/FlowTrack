import hashlib
import re
import calendar as cal
from datetime import date, timedelta

from app.core.logging import get_logger

logger = get_logger(__name__)


def normalize_desc(description: str) -> str:
    text = description.upper().strip()
    text = re.sub(r'[^A-Z0-9\s]', '', text)
    return re.sub(r'\s+', ' ', text)[:100]


def dedup_hash(account_id: str, transaction_date, amount: float, desc_norm: str) -> str:
    raw = f"{account_id}|{transaction_date}|{amount:.2f}|{desc_norm}"
    return hashlib.sha256(raw.encode()).hexdigest()


def calc_profitability(invested: float, current: float):
    profit = current - invested
    pct = round((profit / invested) * 100, 2) if invested > 0 else 0.0
    return round(profit, 2), pct


def calc_progress(current: float, target: float) -> float:
    return round(min((current / target) * 100, 100), 2) if target > 0 else 0.0


def _adjust_account_balance(sb, account_id: str, delta: float) -> None:
    """Non-atomic balance adjustment. Sufficient for single-user personal finance."""
    if delta == 0:
        return
    try:
        acc = sb.table("accounts").select("balance").eq("id", account_id).single().execute()
        if acc.data:
            new_bal = round((acc.data["balance"] or 0) + delta, 2)
            sb.table("accounts").update({"balance": new_bal}).eq("id", account_id).execute()
    except Exception as e:
        logger.warning("balance_adjust_failed", account_id=account_id, delta=delta, error=str(e))


def _goal_period_range(goal: dict) -> tuple[str, str]:
    today = date.today()
    period = goal.get("period", "monthly")
    if period == "monthly":
        first = date(today.year, today.month, 1)
        if today.month == 12:
            last = date(today.year, 12, 31)
        else:
            last = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return first.isoformat(), last.isoformat()
    elif period == "yearly":
        return date(today.year, 1, 1).isoformat(), date(today.year, 12, 31).isoformat()
    else:
        start = str(goal.get("start_date") or today)
        end = str(goal.get("end_date") or today)
        return start, end


def _calc_goal_current(sb, user_id: str, goal: dict) -> float:
    start, end = _goal_period_range(goal)
    q = (sb.table("transactions").select("amount")
         .eq("user_id", user_id)
         .gte("transaction_date", start)
         .lte("transaction_date", end))
    if goal.get("category_id"):
        q = q.eq("category_id", goal["category_id"])
    txns = (q.execute().data) or []
    if goal["type"] == "spending_limit":
        return round(abs(sum(t["amount"] for t in txns if t["amount"] < 0)), 2)
    return round(sum(t["amount"] for t in txns if t["amount"] > 0), 2)


def _write_audit(sb, user_id: str, entity_type: str, entity_id: str, action: str, old_values=None, new_values=None) -> None:
    """Write an audit log entry. Silently fails if table does not exist yet."""
    try:
        sb.table("audit_log").insert({
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "action": action,
            "old_values": old_values,
            "new_values": new_values,
        }).execute()
    except Exception as e:
        logger.warning("audit_log_write_failed", error=str(e))


def _parse_ofx(content: bytes) -> list[dict]:
    try:
        text = content.decode("latin-1", errors="replace")
    except Exception:
        text = content.decode("utf-8", errors="replace")
    blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL | re.IGNORECASE)
    if not blocks:
        blocks = re.findall(r"<STMTTRN>(.*?)(?=<STMTTRN>|</BANKTRANLIST>|$)", text, re.DOTALL | re.IGNORECASE)
    txns = []
    for block in blocks:
        def _field(tag: str) -> str:
            m = re.search(rf"<{tag}>([^\n<]+)", block, re.IGNORECASE)
            return m.group(1).strip() if m else ""
        dtposted = _field("DTPOSTED")
        trnamt = _field("TRNAMT")
        memo = _field("MEMO") or _field("NAME") or ""
        trntype = _field("TRNTYPE").upper()
        if not dtposted or not trnamt:
            continue
        try:
            tx_date = f"{dtposted[:4]}-{dtposted[4:6]}-{dtposted[6:8]}"
        except Exception:
            continue
        try:
            amount = float(trnamt.replace(",", "."))
        except ValueError:
            continue
        if amount == 0:
            continue
        txns.append({
            "description": (memo or trntype)[:200],
            "amount": amount,
            "transaction_date": tx_date,
            "type": "credit" if amount > 0 else "debit",
        })
    return txns


def _serialize(v):
    """Coerce non-primitive values to string for audit log storage."""
    return v if isinstance(v, (int, float, bool, type(None))) else str(v)
