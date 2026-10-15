import anthropic
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.integrations.rules import match_rule

logger = get_logger(__name__)

# Categoria padrão de sobra: quando a IA responde só isso, não ajuda (frontend: lib/review.ts)
FALLBACK_CATEGORY = "Outros"


def _build_system_prompt(category_names: list[str]) -> str:
    return (
        "You are a Brazilian financial transaction categorizer. "
        "Given a transaction description, return ONLY the most appropriate category name "
        "from the list below — nothing else, no explanation, just the category name exactly as written.\n\n"
        "Categories:\n" + "\n".join(f"- {c}" for c in category_names)
    )


def _categories_for(sb, user_id: str, defaults: list[dict]) -> tuple[dict, list[str]]:
    """Categorias que este usuário pode receber: as padrão e as dele, nunca as de outra pessoa.
    Em nome repetido, vale a padrão."""
    own = (sb.table("categories").select("id, name, user_id, is_default")
           .eq("user_id", user_id).execute().data) or []
    by_name = {c["name"].lower(): c for c in own}
    by_name.update({c["name"].lower(): c for c in defaults})
    names = sorted({c["name"] for c in by_name.values()})
    return by_name, names


def process_categorization_queue(batch_size: int = 20) -> dict:
    """Categoriza a fila em 3 camadas: regras fixas, cache de comerciantes e Claude Haiku.
    A API usa service_role (ignora o RLS), então toda leitura e escrita filtra pelo dono do item."""
    settings = get_settings()
    sb = get_supabase()
    has_ai = bool(settings.anthropic_api_key) and settings.anthropic_api_key != "pendente"

    queue_res = (
        sb.table("categorization_queue")
        .select("id, transaction_id, user_id")
        .eq("status", "pending")
        .order("created_at")
        .limit(batch_size)
        .execute()
    )
    items = queue_res.data or []
    if not items:
        return {"status": "ok", "processed": 0}

    # Padrão = is_default e sem dono (uma linha com dono nunca conta como padrão)
    defaults = (sb.table("categories").select("id, name, user_id, is_default")
                .eq("is_default", True).is_("user_id", "null").execute().data) or []
    if not defaults:
        logger.warning("No default categories found in DB")
        return {"status": "ok", "processed": 0}
    default_by_name = {c["name"]: c for c in defaults}

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key) if has_ai else None
    per_user: dict[str, tuple[dict, list[str]]] = {}
    processed = 0

    for item in items:
        txn_id = item["transaction_id"]
        user_id = item["user_id"]
        queue_id = item["id"]

        try:
            txn = (sb.table("transactions")
                   .select("id, description, description_normalized, amount")
                   .eq("id", txn_id).eq("user_id", user_id)
                   .limit(1).execute().data or [None])[0]
            if not txn:
                # Item apontando para transação que não é do dono do item: não toca em nada
                _mark_queue(sb, queue_id, "failed")
                continue

            if user_id not in per_user:
                per_user[user_id] = _categories_for(sb, user_id, defaults)
            allowed, names = per_user[user_id]
            allowed_ids = {c["id"] for c in allowed.values()}

            def apply(cat_id: str, by: str, confidence: float) -> None:
                sb.table("transactions").update({
                    "category_id": cat_id, "categorized_by": by, "confidence_score": confidence,
                }).eq("id", txn_id).eq("user_id", user_id).execute()

            description = txn.get("description") or ""
            desc_norm = (txn.get("description_normalized") or description)[:80]

            # 0. Regra criada pela pessoa ("Aplicar sempre"): vale antes de tudo
            own_res = (
                sb.table("merchant_cache")
                .select("category_id")
                .eq("normalized_description", desc_norm)
                .eq("user_id", user_id)
                .eq("source", "manual")
                .limit(1)
                .execute()
            )
            own = own_res.data[0]["category_id"] if own_res.data else None
            if own in allowed_ids:
                apply(own, "rule", 1.0)
                _mark_queue(sb, queue_id, "done")
                processed += 1
                continue

            # 1. Regras fixas
            rule = match_rule(description)
            if rule and rule[0] in default_by_name:
                apply(default_by_name[rule[0]]["id"], "rule", rule[1])
                _mark_queue(sb, queue_id, "done")
                processed += 1
                continue

            # 2. Cache de comerciantes do próprio usuário (só vale categoria que ele pode usar)
            cache_res = (
                sb.table("merchant_cache")
                .select("category_id")
                .eq("normalized_description", desc_norm)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            cached = cache_res.data[0]["category_id"] if cache_res.data else None
            if cached in allowed_ids:
                apply(cached, "cache", 0.9)
                _mark_queue(sb, queue_id, "done")
                processed += 1
                continue

            # 3. Claude Haiku, com cache de prompt no texto de sistema
            if client is None:
                # Sem chave da Anthropic: fica sem categoria (a pessoa escolhe na tela) e sai da fila,
                # para não travar os itens seguintes
                _mark_queue(sb, queue_id, "failed")
                continue
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=32,
                system=[{
                    "type": "text",
                    "text": _build_system_prompt(names),
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": txn.get("description_normalized") or description}],
            )

            cat_name = response.content[0].text.strip()
            cat = allowed.get(cat_name.lower())
            # "Outros" não é sugestão: a transação fica sem categoria e a pessoa escolhe na revisão
            fallback = bool(cat and cat.get("is_default") and cat["name"].lower() == FALLBACK_CATEGORY.lower())
            if fallback:
                cat = None

            if cat:
                apply(cat["id"], "ai", 0.85)
                sb.table("merchant_cache").upsert({
                    "normalized_description": desc_norm,
                    "category_id": cat["id"],
                    "user_id": user_id,
                    "confidence": 0.85,
                    "source": "ai",
                }, on_conflict="normalized_description,user_id").execute()
            elif not fallback:
                logger.warning("Claude returned unknown category", cat_name=cat_name, txn_id=txn_id)

            _mark_queue(sb, queue_id, "done")
            processed += 1

        except anthropic.APIError as e:
            logger.error("Anthropic API error", queue_id=queue_id, error=str(e))
            _mark_queue(sb, queue_id, "failed")
        except Exception as e:
            logger.error("Categorization error", queue_id=queue_id, error=str(e))
            _mark_queue(sb, queue_id, "failed")

    logger.info("Categorization batch complete", processed=processed, total=len(items))
    return {"status": "ok", "processed": processed}


def _mark_queue(sb, queue_id: str, status: str) -> None:
    try:
        sb.table("categorization_queue").update({"status": status}).eq("id", queue_id).execute()
    except Exception as e:
        logger.error("Failed to update queue status", queue_id=queue_id, error=str(e))
