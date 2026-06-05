from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.models import InsightPeriod, InsightResponse

router = APIRouter()
logger = get_logger(__name__)
limiter = Limiter(key_func=get_remote_address)

_insights_cache: dict[str, dict] = {}


@router.post("/insights", response_model=InsightResponse, tags=["Insights"])
@limiter.limit("5/minute")
async def generate_insight(request: Request, period: InsightPeriod, user_id: str = Depends(get_current_user_id)):
    """Generate an AI-powered financial insight for a given period, cached for 24h."""
    cache_key = f"{user_id}:{period.start_date}:{period.end_date}"
    cached = _insights_cache.get(cache_key)
    if cached and (datetime.now() - cached["ts"]).total_seconds() < 86400:
        return InsightResponse(text=cached["text"], generated_at=cached["ts"].isoformat(), cached=True)

    try:
        sb = get_supabase()
        txns = sb.table("transactions").select("amount,category_id,description,is_recurring").eq("user_id", user_id).gte("transaction_date", period.start_date).lte("transaction_date", period.end_date).execute().data or []
        goals = sb.table("goals").select("name,type,target_amount,is_active").eq("user_id", user_id).eq("is_active", True).execute().data or []
        cats = sb.table("categories").select("id,name").execute().data or []
        cat_map = {c["id"]: c["name"] for c in cats}

        expenses = [t for t in txns if (t.get("amount") or 0) < 0]
        income_t = [t for t in txns if (t.get("amount") or 0) > 0]
        total_exp = sum(abs(t["amount"]) for t in expenses)
        total_inc = sum(t["amount"] for t in income_t)
        savings_rate = round((total_inc - total_exp) / total_inc * 100, 1) if total_inc > 0 else 0

        cat_totals: dict = {}
        for t in expenses:
            k = t.get("category_id") or "__none__"
            cat_totals[k] = cat_totals.get(k, 0) + abs(t["amount"])
        top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:5]
        top_cats_str = "\n".join(f"- {cat_map.get(k, 'Sem categoria')}: R${v:.2f}" for k, v in top_cats)

        recurring_total = sum(abs(t["amount"]) for t in expenses if t.get("is_recurring"))
        goals_str = "\n".join(f'- {g["name"]} ({g["type"]}): alvo R${g["target_amount"]:.2f}' for g in goals[:3])

        from app.core.config import get_settings
        settings = get_settings()

        if not settings.anthropic_api_key or settings.anthropic_api_key in ("pendente", ""):
            text = f"Receitas: R${total_inc:.2f}. Gastos: R${total_exp:.2f}. Taxa de economia: {savings_rate}%. {len(txns)} transações no período."
        else:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            prompt = (
                f"Você é um assistente financeiro pessoal. Analise os dados abaixo e gere um insight conciso (máximo 3 frases) "
                f"em português, tom amigável, com números específicos.\n\n"
                f"Período: {period.start_date} a {period.end_date}\n"
                f"Receitas: R${total_inc:.2f} | Gastos: R${total_exp:.2f} | Economia: {savings_rate}%\n"
                f"Top categorias:\n{top_cats_str or '- Sem dados'}\n"
                f"Recorrentes: R${recurring_total:.2f}\n"
                f"Metas ativas:\n{goals_str or '- Nenhuma'}\n\nInsight:"
            )
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()

        ts = datetime.now()
        _insights_cache[cache_key] = {"text": text, "ts": ts}
        return InsightResponse(text=text, generated_at=ts.isoformat(), cached=False)
    except Exception as e:
        logger.error("generate_insight failed", error=str(e))
        raise HTTPException(500, "Failed to generate insight")
