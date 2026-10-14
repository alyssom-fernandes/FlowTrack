import hashlib
import re
import calendar as cal
from datetime import date, timedelta

from fastapi import HTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Posse dos dados ───────────────────────────────────────────
# A API acessa o banco com a chave service_role, que ignora o RLS.
# Todo id que chega na requisição (conta, categoria) é conferido aqui.

def _first(data):
    """Primeira linha de uma resposta do Supabase (lista) ou a própria linha (single)."""
    if isinstance(data, list):
        return data[0] if data else None
    return data or None


def _require_account(sb, user_id: str, account_id: str) -> dict:
    """Conta do próprio usuário, ou 404."""
    res = sb.table("accounts").select("id,name").eq("id", account_id).eq("user_id", user_id).limit(1).execute()
    row = _first(res.data)
    if not row:
        raise HTTPException(404, "Conta não encontrada.")
    return row


def _require_category(sb, user_id: str, category_id: str | None) -> None:
    """Categoria padrão (is_default e sem dono) ou do próprio usuário, ou 404. Sem categoria passa."""
    if not category_id:
        return
    res = sb.table("categories").select("id,user_id,is_default").eq("id", category_id).limit(1).execute()
    row = _first(res.data)
    is_default = bool(row) and row.get("is_default") is True and row.get("user_id") is None
    if not row or not (is_default or row.get("user_id") == user_id):
        raise HTTPException(404, "Categoria não encontrada.")


# Filtro PostgREST: categorias padrão (sem dono) ou do usuário
def visible_categories_filter(user_id: str) -> str:
    return f"and(is_default.eq.true,user_id.is.null),user_id.eq.{user_id}"


def normalize_desc(description: str) -> str:
    text = description.upper().strip()
    text = re.sub(r'[^A-Z0-9\s]', '', text)
    return re.sub(r'\s+', ' ', text)[:100]


def dedup_hash(account_id: str, transaction_date, amount: float, desc_norm: str) -> str:
    raw = f"{account_id}|{transaction_date}|{amount:.2f}|{desc_norm}"
    return hashlib.sha256(raw.encode()).hexdigest()


def is_transfer(txn: dict) -> bool:
    """Transferência entre contas próprias: não é receita nem gasto."""
    return txn.get("type") == "transfer"


def latest_installments(rows: list[dict]) -> list[dict]:
    """Uma compra parcelada gera uma linha por parcela; só a mais recente
    de cada compra (pela descrição) projeta as parcelas que faltam."""
    latest: dict[str, dict] = {}
    for t in rows:
        cur, total = t.get("installment_current"), t.get("installment_total")
        if not cur or not total or cur >= total:
            continue
        key = normalize_desc(t["description"])
        if key not in latest or (latest[key].get("installment_current") or 0) < cur:
            latest[key] = t
    return list(latest.values())


def month_shift(d: date, months: int) -> date:
    """Primeiro dia do mês, n meses antes (negativo) ou depois."""
    index = d.year * 12 + d.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def brl(value: float) -> str:
    """R$ 1.234,56 (padrão brasileiro, sem depender do locale do servidor)."""
    sign = "-" if value < 0 else ""
    whole, cents = f"{abs(value):,.2f}".split(".")
    return f"{sign}R$ {whole.replace(',', '.')},{cents}"


# ── Ritmo do gasto ────────────────────────────────────────────
# Mesma regra de frontend/src/lib/pace.ts: o gasto se compara com o que já deveria ter saído
# até hoje (contas fixas no dia em que vencem + o resto do limite espalhado pelo mês).
# O alerta, a barra e a pílula das telas usam o mesmo estado.

def bills_by_category(previous_month: list[dict]) -> dict[str, list[tuple[int, float]]]:
    """Contas fixas: gastos recorrentes do mês anterior, por categoria, com o dia em que caíram."""
    out: dict[str, list[tuple[int, float]]] = {}
    for t in previous_month:
        amount = t.get("amount") or 0
        if not t.get("is_recurring") or amount >= 0 or is_transfer(t) or not t.get("category_id"):
            continue
        out.setdefault(t["category_id"], []).append((int(str(t["transaction_date"])[8:10]), -amount))
    return out


def expected_by(limit: float, bills: list[tuple[int, float]], day: int, dim: int) -> float:
    """Quanto do limite já deveria ter saído até o `day`: contas vencidas + parte proporcional do resto."""
    bills_total = sum(a for _, a in bills)
    due = sum(a for d, a in bills if d <= day)
    variable = max(0.0, limit - bills_total)
    return min(limit, due + variable * (day / dim))


def pace_status(spent: float, limit: float, expected: float) -> str:
    """over: passou do limite; warn: acima do esperado (mais de 5% do limite) ou perto do fim cedo demais; ok."""
    if spent > limit:
        return "over"
    if spent - expected > limit * 0.05 or (limit - spent < limit * 0.1 and expected < limit * 0.9):
        return "warn"
    return "ok"


def budget_state(spent: float, limit: float, bills: list[tuple[int, float]], day: int, dim: int) -> str:
    """ok | warn | over | paid. "paid" (fixo · pago): quase tudo é conta fixa, já caiu e cabe no limite."""
    status = pace_status(spent, limit, expected_by(limit, bills, day, dim))
    bills_total = sum(a for _, a in bills)
    if (status != "over" and bills and all(d <= day for d, _ in bills)
            and bills_total >= limit * 0.8 and spent >= bills_total * 0.9):
        return "paid"
    return status


def goal_limit_state(current: float, target: float, elapsed: float | None) -> str:
    """Limite de gasto de uma meta pelo ritmo do período (`elapsed` = fração já passada; None sem data de fim)."""
    if current > target:
        return "over"
    if elapsed is None:
        return "warn" if current >= target * 0.9 else "ok"
    return pace_status(current, target, target * elapsed)


def period_elapsed(start: str, end: str | None, today: date) -> float | None:
    """Fração do período que já passou, contando o dia de hoje (0 a 1)."""
    if not end:
        return None
    s, e = date.fromisoformat(str(start)[:10]), date.fromisoformat(str(end)[:10])
    total = (e - s).days + 1
    if total <= 0:
        return None
    return min(1.0, max(0.0, ((today - s).days + 1) / total))


def calc_profitability(invested: float, current: float):
    profit = current - invested
    pct = round((profit / invested) * 100, 2) if invested > 0 else 0.0
    return round(profit, 2), pct


def calc_progress(current: float, target: float) -> float:
    return round(min((current / target) * 100, 100), 2) if target > 0 else 0.0


def _adjust_account_balance(sb, user_id: str, account_id: str, delta: float) -> None:
    """Ajusta o saldo lendo e gravando em seguida (não é atômico). Só mexe em conta do próprio usuário."""
    if delta == 0:
        return
    try:
        acc = _first(sb.table("accounts").select("balance").eq("id", account_id).eq("user_id", user_id).limit(1).execute().data)
        if acc:
            new_bal = round((acc["balance"] or 0) + delta, 2)
            sb.table("accounts").update({"balance": new_bal}).eq("id", account_id).eq("user_id", user_id).execute()
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
    """Coerce non-primitive values to string for audit log storage (listas, como tags, ficam como lista)."""
    if isinstance(v, list):
        return [_serialize(x) for x in v]
    return v if isinstance(v, (int, float, bool, str, type(None))) else str(v)


# Campos que o "desfazer" pode devolver a uma transação. user_id nunca vem do histórico.
RESTORABLE_FIELDS = (
    "account_id", "category_id", "description", "description_normalized", "amount", "currency",
    "transaction_date", "type", "is_recurring", "installment_current", "installment_total",
    "categorized_by", "confidence_score", "notes", "tags", "import_batch_id", "dedup_hash",
)
