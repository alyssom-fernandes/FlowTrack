from collections import OrderedDict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.models import InsightPeriod, InsightResponse
from app.api.v1._helpers import visible_categories_filter

router = APIRouter()
logger = get_logger(__name__)

# Cache em memória com validade de 24 h e teto de entradas (as mais antigas saem primeiro)
_CACHE_TTL_S = 86400
_CACHE_MAX = 500
_insights_cache: "OrderedDict[str, dict]" = OrderedDict()


def _cache_get(key: str) -> dict | None:
    item = _insights_cache.get(key)
    if item and (datetime.now() - item["ts"]).total_seconds() < _CACHE_TTL_S:
        return item
    _insights_cache.pop(key, None)
    return None


def _cache_put(key: str, text: str, ts: datetime, income: float, expense: float, source: str = "ai") -> None:
    _insights_cache[key] = {"text": text, "ts": ts, "income": income, "expense": expense, "source": source}
    _insights_cache.move_to_end(key)
    while len(_insights_cache) > _CACHE_MAX:
        _insights_cache.popitem(last=False)


@router.post("/insights", response_model=InsightResponse, tags=["Insights"])
@limiter.limit("5/minute")
async def generate_insight(request: Request, period: InsightPeriod, user_id: str = Depends(get_current_user_id)):
    """Generate an AI-powered financial insight for a given period, cached for 24h."""
    en = period.language == "en"
    # O idioma entra na chave: o mesmo período em outro idioma é outro resumo
    cache_key = f"{user_id}:{period.start_date}:{period.end_date}:{period.language}"
    cached = None if period.refresh else _cache_get(cache_key)
    if cached:
        return InsightResponse(text=cached["text"], generated_at=cached["ts"].isoformat(), cached=True,
                               income=cached.get("income"), expense=cached.get("expense"),
                               source=cached.get("source", "ai"))

    try:
        sb = get_supabase()
        txns = sb.table("transactions").select("amount,category_id,description,is_recurring,type").eq("user_id", user_id).gte("transaction_date", period.start_date).lte("transaction_date", period.end_date).execute().data or []
        txns = [t for t in txns if t.get("type") != "transfer"]
        goals = sb.table("goals").select("name,type,target_amount,is_active").eq("user_id", user_id).eq("is_active", True).execute().data or []
        cats = sb.table("categories").select("id,name").or_(visible_categories_filter(user_id)).execute().data or []
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
        none_label = "Uncategorized" if en else "Sem categoria"
        top_cats_str = "\n".join(f"- {cat_map.get(k, none_label)}: R${v:.2f}" for k, v in top_cats)

        recurring_total = sum(abs(t["amount"]) for t in expenses if t.get("is_recurring"))
        target_label = "target" if en else "alvo"
        goals_str = "\n".join(f'- {g["name"]} ({g["type"]}): {target_label} R${g["target_amount"]:.2f}' for g in goals[:3])

        from app.core.config import get_settings
        settings = get_settings()

        if not settings.anthropic_api_key or settings.anthropic_api_key in ("pendente", ""):
            source = "template"
            text = (f"Income: R${total_inc:.2f}. Spending: R${total_exp:.2f}. Savings rate: {savings_rate}%. {len(txns)} transactions in the period."
                    if en else
                    f"Receitas: R${total_inc:.2f}. Gastos: R${total_exp:.2f}. Taxa de economia: {savings_rate}%. {len(txns)} transações no período.")
        else:
            import anthropic
            source = "ai"
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            if en:
                prompt = (
                    f"You are a personal finance assistant. Analyze the data below and write a concise insight (at most 3 sentences) "
                    f"in English, direct and friendly, with specific numbers. Answer in plain prose, "
                    f"no markdown, no headings, no lists and no emoji. Category names are in Portuguese: translate them. "
                    f"When giving a category's percentage, say its base ('of spending' or 'of income'). Amounts are in Brazilian reais (R$).\n\n"
                    f"Period: {period.start_date} to {period.end_date}\n"
                    f"Income: R${total_inc:.2f} | Spending: R${total_exp:.2f} | Savings: {savings_rate}%\n"
                    f"Top categories:\n{top_cats_str or '- No data'}\n"
                    f"Recurring: R${recurring_total:.2f}\n"
                    f"Active goals:\n{goals_str or '- None'}\n\nInsight:"
                )
            else:
                prompt = (
                    f"Você é um assistente financeiro pessoal. Analise os dados abaixo e gere um insight conciso (máximo 3 frases) "
                    f"em português, tom direto e cordial, com números específicos. Responda em texto corrido, "
                    f"sem markdown, sem títulos, sem listas e sem emoji. Ao dar a porcentagem de uma categoria, "
                    f"diga a base ('dos gastos' ou 'do que entrou').\n\n"
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
        income, expense = round(total_inc, 2), round(total_exp, 2)
        _cache_put(cache_key, text, ts, income, expense, source)
        return InsightResponse(text=text, generated_at=ts.isoformat(), cached=False, income=income, expense=expense,
                               source=source)
    except Exception as e:
        logger.error("generate_insight failed", error=str(e))
        raise HTTPException(500, "Failed to generate insight")
