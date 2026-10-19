import anthropic
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.logging import get_logger
# Mesmo corte do filtro "A revisar" da API (NEEDS_REVIEW_FILTER)
from app.api.v1._helpers import REVIEW_CONFIDENCE
from app.integrations.rules import match_rule

logger = get_logger(__name__)

# Categoria padrão de sobra: quando a IA responde só isso, não ajuda (frontend: lib/review.ts)
FALLBACK_CATEGORY = "Outros"


# Modelo usado na categorização (camada 3)
MODEL = "claude-haiku-4-5-20251001"
TOOL_NAME = "categorize"


def _build_system_prompt(category_names: list[str]) -> str:
    return (
        "You are a Brazilian financial transaction categorizer. "
        f"Given a transaction description, call the {TOOL_NAME} tool with the most appropriate category "
        "from the list below, written exactly as listed, and your confidence from 0 to 1 that it is right. "
        "Use a low confidence when the description is ambiguous or could fit more than one category.\n\n"
        "Categories:\n" + "\n".join(f"- {c}" for c in category_names)
    )


def _categorize_tool(category_names: list[str]) -> dict:
    """Saída estruturada: o modelo responde categoria e confiança pelo tool use, não em texto livre."""
    return {
        "name": TOOL_NAME,
        "description": "Record the category chosen for the transaction and the confidence in that choice.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": category_names},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
            "required": ["category", "confidence"],
        },
    }


def parse_categorization(response) -> tuple[str | None, float]:
    """(nome da categoria, confiança 0..1) do tool use. Sem bloco válido: (None, 0.0).

    Confiança ausente, não numérica ou fora de 0..1 vira 0.0: a categoria ainda serve de sugestão,
    mas vai para "A revisar" em vez de passar como certa."""
    for block in getattr(response, "content", None) or []:
        if getattr(block, "type", None) != "tool_use" or getattr(block, "name", None) != TOOL_NAME:
            continue
        data = getattr(block, "input", None)
        if not isinstance(data, dict):
            return None, 0.0
        name = data.get("category")
        if not isinstance(name, str) or not name.strip():
            return None, 0.0
        conf = data.get("confidence")
        if isinstance(conf, bool) or not isinstance(conf, (int, float)) or not 0 <= conf <= 1:
            conf = 0.0
        return name.strip(), round(float(conf), 2)
    return None, 0.0


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

            # 3. Claude Haiku, com resposta estruturada (categoria + confiança)
            if client is None:
                # Sem chave da Anthropic: fica sem categoria (a pessoa escolhe na tela) e sai da fila,
                # para não travar os itens seguintes
                _mark_queue(sb, queue_id, "failed")
                continue
            response = client.messages.create(
                model=MODEL,
                max_tokens=200,
                system=[{
                    "type": "text",
                    "text": _build_system_prompt(names),
                    # Só tem efeito se o texto passar do tamanho mínimo de cache do modelo;
                    # o uso real aparece no log (cache_read_input_tokens)
                    "cache_control": {"type": "ephemeral"},
                }],
                tools=[_categorize_tool(names)],
                tool_choice={"type": "tool", "name": TOOL_NAME},
                messages=[{"role": "user", "content": txn.get("description_normalized") or description}],
            )
            _log_usage(response, txn_id)

            cat_name, confidence = parse_categorization(response)
            # Categoria fora da lista permitida (ou resposta inválida) não é gravada: fica sem categoria
            cat = allowed.get(cat_name.lower()) if cat_name else None
            # "Outros" não é sugestão: a transação fica sem categoria e a pessoa escolhe na revisão
            fallback = bool(cat and cat.get("is_default") and cat["name"].lower() == FALLBACK_CATEGORY.lower())
            if fallback:
                cat = None

            if cat:
                # Abaixo de REVIEW_CONFIDENCE a transação entra em "A revisar" (_helpers.NEEDS_REVIEW_FILTER)
                apply(cat["id"], "ai", confidence)
                # Só decisão confiante vira cache: o cache é reaplicado sem passar pela revisão
                if confidence >= REVIEW_CONFIDENCE:
                    sb.table("merchant_cache").upsert({
                        "normalized_description": desc_norm,
                        "category_id": cat["id"],
                        "user_id": user_id,
                        "confidence": confidence,
                        "source": "ai",
                    }, on_conflict="normalized_description,user_id").execute()
            elif not fallback:
                logger.warning("Claude returned no valid category", cat_name=cat_name, txn_id=txn_id)

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


def _log_usage(response, txn_id: str) -> None:
    """Tokens de cada chamada, inclusive os lidos do cache de prompt, para medir custo e efeito do cache."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return
    logger.info("Claude usage", txn_id=txn_id,
                input_tokens=getattr(usage, "input_tokens", None),
                output_tokens=getattr(usage, "output_tokens", None),
                cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", None),
                cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", None))


def _mark_queue(sb, queue_id: str, status: str) -> None:
    try:
        sb.table("categorization_queue").update({"status": status}).eq("id", queue_id).execute()
    except Exception as e:
        logger.error("Failed to update queue status", queue_id=queue_id, error=str(e))
