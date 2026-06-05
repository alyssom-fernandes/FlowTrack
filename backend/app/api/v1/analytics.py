import calendar as cal
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import AlertListResponse, NetWorthResponse, ProjectionResponse, MonthData
from app.api.v1._helpers import normalize_desc, _calc_goal_current

router = APIRouter()
logger = get_logger(__name__)


@router.get("/summary/monthly", tags=["Summary"])
async def monthly_summary(months: int = Query(default=6, ge=1, le=24), user_id: str = Depends(get_current_user_id)):
    """Aggregated income/expense per month — lightweight alternative to fetching 500 transactions."""
    try:
        today = date.today()
        start = date(today.year, today.month, 1)
        for _ in range(months - 1):
            if start.month == 1:
                start = date(start.year - 1, 12, 1)
            else:
                start = date(start.year, start.month - 1, 1)
        result = (get_supabase().table("transactions").select("transaction_date,amount")
                  .eq("user_id", user_id)
                  .gte("transaction_date", start.isoformat())
                  .execute())
        monthly: dict[str, dict] = {}
        for t in (result.data or []):
            key = t["transaction_date"][:7]
            if key not in monthly:
                monthly[key] = {"month": key, "income": 0.0, "expense": 0.0}
            if t["amount"] > 0:
                monthly[key]["income"] += t["amount"]
            else:
                monthly[key]["expense"] += abs(t["amount"])
        for m in monthly.values():
            m["income"] = round(m["income"], 2)
            m["expense"] = round(m["expense"], 2)
        return sorted(monthly.values(), key=lambda x: x["month"])
    except Exception as e:
        logger.error("monthly_summary failed", error=str(e))
        raise HTTPException(500, "Failed to compute monthly summary")


@router.get("/alerts", response_model=AlertListResponse, tags=["Alerts"])
async def list_alerts(user_id: str = Depends(get_current_user_id)):
    """Deterministic in-app alerts based on current financial state."""
    try:
        sb = get_supabase()
        today = date.today()
        month_start = date(today.year, today.month, 1).isoformat()
        month_end = date(today.year, today.month, cal.monthrange(today.year, today.month)[1]).isoformat()
        alerts = []

        txns = sb.table("transactions").select("id,amount,category_id,is_recurring,description").eq("user_id", user_id).gte("transaction_date", month_start).lte("transaction_date", month_end).execute().data or []

        # Goal spending limits
        goals = sb.table("goals").select("*").eq("user_id", user_id).eq("is_active", True).eq("type", "spending_limit").execute().data or []
        for g in goals:
            current = _calc_goal_current(sb, user_id, g)
            pct = (current / g["target_amount"] * 100) if g["target_amount"] > 0 else 0
            remaining = round(g["target_amount"] - current, 2)
            if pct >= 100:
                alerts.append({"type": "danger", "message": f'Meta "{g["name"]}" excedida em R${abs(remaining):.2f}', "category": "budget", "amount": abs(remaining)})
            elif pct >= 75:
                alerts.append({"type": "warning", "message": f'Meta "{g["name"]}" em {pct:.0f}% — faltam R${remaining:.2f}', "category": "budget", "amount": remaining})

        # Negative balance accounts
        neg_accs = sb.table("accounts").select("name,balance").eq("user_id", user_id).eq("is_active", True).lt("balance", 0).execute().data or []
        for a in neg_accs:
            alerts.append({"type": "danger", "message": f'Saldo negativo: {a["name"]}', "category": "account", "amount": a["balance"]})

        # Uncategorized expenses
        uncategorized = [t for t in txns if not t.get("category_id") and (t.get("amount") or 0) < 0]
        if len(uncategorized) >= 3:
            alerts.append({"type": "info", "message": f'{len(uncategorized)} transações sem categoria este mês', "category": "uncategorized"})

        # Missing recurring transactions
        if today.month == 1:
            prev_first = date(today.year - 1, 12, 1)
            prev_last = date(today.year - 1, 12, 31)
        else:
            prev_first = date(today.year, today.month - 1, 1)
            prev_last = date(today.year, today.month, 1) - timedelta(days=1)

        prev_rec = sb.table("transactions").select("description").eq("user_id", user_id).eq("is_recurring", True).gte("transaction_date", str(prev_first)).lte("transaction_date", str(prev_last)).limit(5).execute().data or []
        curr_norms = {normalize_desc(t["description"]) for t in txns}
        for r in prev_rec:
            if normalize_desc(r["description"]) not in curr_norms:
                alerts.append({"type": "info", "message": f'Recorrente "{r["description"]}" não detectado este mês', "category": "recurring"})

        # Budget alerts
        try:
            current_month = f"{today.year}-{today.month:02d}"
            budgets = sb.table("budgets").select("*").eq("user_id", user_id).eq("month", current_month).execute().data or []
            cat_spending: dict = {}
            for t in txns:
                k = t.get("category_id")
                if k and (t.get("amount") or 0) < 0:
                    cat_spending[k] = cat_spending.get(k, 0) + abs(t["amount"])
            for b in budgets:
                spent = cat_spending.get(b["category_id"], 0)
                pct = (spent / b["limit_amount"] * 100) if b["limit_amount"] > 0 else 0
                if pct >= 80 and pct < 100:
                    cat_res = sb.table("categories").select("name").eq("id", b["category_id"]).single().execute()
                    cat_name = cat_res.data["name"] if cat_res.data else "Categoria"
                    remaining = round(b["limit_amount"] - spent, 2)
                    alerts.append({"type": "warning", "message": f'Orçamento "{cat_name}" em {pct:.0f}% — faltam R${remaining:.2f}', "category": "budget", "amount": remaining})
                elif pct >= 100:
                    cat_res = sb.table("categories").select("name").eq("id", b["category_id"]).single().execute()
                    cat_name = cat_res.data["name"] if cat_res.data else "Categoria"
                    alerts.append({"type": "danger", "message": f'Orçamento "{cat_name}" excedido', "category": "budget"})
        except Exception:
            pass

        return AlertListResponse(alerts=alerts, total=len(alerts))
    except Exception as e:
        logger.error("list_alerts failed", error=str(e))
        raise HTTPException(500, "Failed to compute alerts")


@router.get("/cashflow/projection", tags=["Cashflow"])
async def cashflow_projection(user_id: str = Depends(get_current_user_id)):
    """Projects account balance day by day for the next 30 days based on recurring and installment transactions."""
    try:
        sb = get_supabase()
        today = date.today()
        end_date = today + timedelta(days=30)

        accs = sb.table("accounts").select("balance").eq("user_id", user_id).eq("is_active", True).execute().data or []
        starting_balance = round(sum(a["balance"] for a in accs), 2)

        if today.month <= 2:
            lookback_start = date(today.year - 1, 10, 1)
        else:
            lookback_start = date(today.year, today.month - 2, 1)
        recurring = sb.table("transactions").select("description,amount,transaction_date").eq("user_id", user_id).eq("is_recurring", True).gte("transaction_date", str(lookback_start)).execute().data or []

        inst_res = sb.table("transactions").select("description,amount,transaction_date,installment_current,installment_total").eq("user_id", user_id).not_.is_("installment_total", "null").execute().data or []
        pending_inst = [t for t in inst_res if t.get("installment_current") and t.get("installment_total") and t["installment_current"] < t["installment_total"]]

        days: dict[str, list[dict]] = {}

        def add_event(d: date, desc: str, amount: float, source: str) -> None:
            if today < d <= end_date:
                key = d.isoformat()
                if key not in days:
                    days[key] = []
                days[key].append({"description": desc, "amount": round(amount, 2), "source": source})

        seen_rec: set[str] = set()
        for r in sorted(recurring, key=lambda x: x["transaction_date"], reverse=True):
            norm = normalize_desc(r["description"])
            if norm in seen_rec:
                continue
            seen_rec.add(norm)
            base = date.fromisoformat(r["transaction_date"])
            for delta_m in range(0, 3):
                year = today.year + (today.month - 1 + delta_m) // 12
                month = (today.month - 1 + delta_m) % 12 + 1
                day = min(base.day, cal.monthrange(year, month)[1])
                add_event(date(year, month, day), r["description"], r["amount"], "recurring")

        for inst in pending_inst:
            curr = inst["installment_current"]
            total = inst["installment_total"]
            base = date.fromisoformat(inst["transaction_date"])
            for i in range(1, total - curr + 1):
                raw_month = base.month + curr + i - 1
                year = base.year + (raw_month - 1) // 12
                month = (raw_month - 1) % 12 + 1
                day = min(base.day, cal.monthrange(year, month)[1])
                add_event(date(year, month, day), inst["description"], inst["amount"], "installment")

        result_days = []
        cumulative = 0.0
        has_negative = False
        for d_str in sorted(days):
            events = days[d_str]
            day_sum = sum(e["amount"] for e in events)
            cumulative = round(cumulative + day_sum, 2)
            proj_bal = round(starting_balance + cumulative, 2)
            if proj_bal < 0:
                has_negative = True
            result_days.append({"date": d_str, "events": events, "cumulative_change": cumulative, "projected_balance": proj_bal})

        return {
            "days": result_days,
            "starting_balance": starting_balance,
            "projected_balance": round(starting_balance + cumulative, 2),
            "has_negative_days": has_negative,
        }
    except Exception as e:
        logger.error("cashflow_projection failed", error=str(e))
        raise HTTPException(500, "Failed to compute cashflow projection")


@router.get("/net-worth", response_model=NetWorthResponse, tags=["NetWorth"])
async def get_net_worth(user_id: str = Depends(get_current_user_id)):
    """Returns current net worth (accounts + investments) and historical snapshots."""
    try:
        sb = get_supabase()
        accs = sb.table("accounts").select("balance").eq("user_id", user_id).eq("is_active", True).execute().data or []
        invs = sb.table("investments").select("current_value").eq("user_id", user_id).eq("is_active", True).execute().data or []
        total_accounts = round(sum(a["balance"] for a in accs), 2)
        total_investments = round(sum(i["current_value"] for i in invs), 2)
        net_worth_val = round(total_accounts + total_investments, 2)
        try:
            snaps = sb.table("net_worth_snapshots").select("date,total_accounts,total_investments,net_worth").eq("user_id", user_id).order("date").limit(13).execute().data or []
        except Exception:
            snaps = []
        return NetWorthResponse(total_accounts=total_accounts, total_investments=total_investments, net_worth=net_worth_val, snapshots=snaps)
    except Exception as e:
        logger.error("get_net_worth failed", error=str(e))
        raise HTTPException(500, "Failed to compute net worth")


@router.get("/projections", response_model=ProjectionResponse, tags=["Projections"])
async def financial_projections(user_id: str = Depends(get_current_user_id)):
    """Project income and expenses for the next 3 months based on historical averages."""
    try:
        sb = get_supabase()
        today = date.today()
        start = date(today.year, today.month, 1)
        for _ in range(5):
            start = date(start.year - (1 if start.month == 1 else 0), 12 if start.month == 1 else start.month - 1, 1)

        txns = sb.table("transactions").select("transaction_date,amount").eq("user_id", user_id).gte("transaction_date", str(start)).execute().data or []

        monthly: dict[str, dict] = {}
        for t in txns:
            key = t["transaction_date"][:7]
            if key not in monthly:
                monthly[key] = {"income": 0.0, "expense": 0.0}
            if t["amount"] > 0:
                monthly[key]["income"] += t["amount"]
            else:
                monthly[key]["expense"] += abs(t["amount"])

        history_items = sorted(monthly.items())
        n = len(history_items)

        if n == 0:
            return ProjectionResponse(history=[], projections=[], months_available=0, avg_income=0, avg_expense=0)

        avg_income = sum(v["income"] for _, v in history_items) / n
        avg_expense = sum(v["expense"] for _, v in history_items) / n

        if n >= 2:
            income_vals = [v["income"] for _, v in history_items]
            expense_vals = [v["expense"] for _, v in history_items]
            income_slope = (income_vals[-1] - income_vals[0]) / (n - 1)
            expense_slope = (expense_vals[-1] - expense_vals[0]) / (n - 1)
        else:
            income_slope = expense_slope = 0.0

        last_income = history_items[-1][1]["income"]
        last_expense = history_items[-1][1]["expense"]

        projections = []
        for i in range(1, 4):
            raw_month = today.month + i
            proj_year = today.year + (raw_month - 1) // 12
            proj_month = (raw_month - 1) % 12 + 1
            key = f"{proj_year}-{proj_month:02d}"
            proj_income = max(0, last_income + income_slope * i * 0.4 + (avg_income - last_income) * 0.3)
            proj_expense = max(0, last_expense + expense_slope * i * 0.4 + (avg_expense - last_expense) * 0.3)
            projections.append(MonthData(month=key, income=round(proj_income, 2), expense=round(proj_expense, 2), is_projection=True))

        history_out = [MonthData(month=k, income=round(v["income"], 2), expense=round(v["expense"], 2), is_projection=False) for k, v in history_items]
        return ProjectionResponse(history=history_out, projections=projections, months_available=n, avg_income=round(avg_income, 2), avg_expense=round(avg_expense, 2))
    except Exception as e:
        logger.error("financial_projections failed", error=str(e))
        raise HTTPException(500, "Failed to compute projections")
