import anthropic
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.logging import get_logger

logger = get_logger(__name__)


def _build_system_prompt(category_names: list[str]) -> str:
    return (
        "You are a Brazilian financial transaction categorizer. "
        "Given a transaction description, return ONLY the most appropriate category name "
        "from the list below — nothing else, no explanation, just the category name exactly as written.\n\n"
        "Categories:\n" + "\n".join(f"- {c}" for c in category_names)
    )


def process_categorization_queue(batch_size: int = 20) -> dict:
    settings = get_settings()
    sb = get_supabase()

    if not settings.anthropic_api_key or settings.anthropic_api_key in ("pendente", ""):
        logger.warning("ANTHROPIC_API_KEY not configured — skipping AI categorization")
        return {"status": "skipped", "reason": "api_key_not_configured", "processed": 0}

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

    cats_res = sb.table("categories").select("id, name").order("name").execute()
    categories = cats_res.data or []
    if not categories:
        logger.warning("No categories found in DB")
        return {"status": "ok", "processed": 0}

    cat_by_name_lower = {c["name"].lower(): c for c in categories}
    category_names = [c["name"] for c in categories]

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    system_prompt = _build_system_prompt(category_names)
    processed = 0

    for item in items:
        txn_id = item["transaction_id"]
        user_id = item["user_id"]
        queue_id = item["id"]

        try:
            txn_res = (
                sb.table("transactions")
                .select("id, description, description_normalized, amount")
                .eq("id", txn_id)
                .single()
                .execute()
            )
            txn = txn_res.data
            if not txn:
                _mark_queue(sb, queue_id, "failed")
                continue

            desc_norm = (txn.get("description_normalized") or txn.get("description", ""))[:80]

            # Check merchant cache first
            cache_res = (
                sb.table("merchant_cache")
                .select("category_id")
                .eq("normalized_description", desc_norm)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if cache_res.data:
                cat_id = cache_res.data[0]["category_id"]
                sb.table("transactions").update({
                    "category_id": cat_id,
                    "categorized_by": "cache",
                    "confidence_score": 0.9,
                }).eq("id", txn_id).execute()
                _mark_queue(sb, queue_id, "done")
                processed += 1
                continue

            # Call Claude Haiku with prompt caching on the system prompt
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=32,
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": txn.get("description_normalized") or txn["description"]}],
            )

            cat_name = response.content[0].text.strip()
            cat = cat_by_name_lower.get(cat_name.lower())

            if cat:
                sb.table("transactions").update({
                    "category_id": cat["id"],
                    "categorized_by": "ai",
                    "confidence_score": 0.85,
                }).eq("id", txn_id).execute()

                # Upsert merchant cache
                sb.table("merchant_cache").upsert({
                    "normalized_description": desc_norm,
                    "category_id": cat["id"],
                    "user_id": user_id,
                    "confidence": 0.85,
                    "source": "ai",
                }, on_conflict="normalized_description,user_id").execute()
            else:
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
