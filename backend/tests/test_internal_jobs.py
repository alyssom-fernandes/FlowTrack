"""Rotina interna chamada pelo cron: a fila de categorização.

Usa o Supabase em memória (fake_supabase.py), que emula as funções SQL do schema.sql
(claim_categorization_queue)."""
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx

from app.integrations import claude_api
from tests.fake_supabase import FakeSupabase

USER = "user-alice"


def tool_response(category, confidence=0.95):
    block = SimpleNamespace(type="tool_use", name="categorize", id="toolu_1",
                            input={"category": category, "confidence": confidence})
    return SimpleNamespace(content=[block], usage=None)


def api_down():
    return anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))


class FakeClaude:
    """Responde Alimentação; `errors` falhas antes disso; `on_call` roda no meio da chamada."""

    def __init__(self, errors=0, on_call=None):
        self.errors, self.on_call, self.calls = errors, on_call, []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw["messages"][0]["content"])
        if self.on_call:
            hook, self.on_call = self.on_call, None
            hook()
        if self.errors:
            self.errors -= 1
            raise api_down()
        return tool_response("Alimentação")


def queue_db(*descriptions, **item):
    # Descrições que nenhuma regra fixa reconhece: chegam até a IA
    txs = [{"id": f"tx-{i}", "user_id": USER, "description": d, "amount": -10.0, "category_id": None}
           for i, d in enumerate(descriptions)]
    return FakeSupabase({
        "categories": [{"id": "cat-food", "name": "Alimentação", "user_id": None, "is_default": True}],
        "transactions": txs,
        "categorization_queue": [{"id": f"q{i}", "transaction_id": t["id"], "user_id": USER, "status": "pending",
                                  "retry_count": 0, "max_retries": 3, "created_at": str(i), **item}
                                 for i, t in enumerate(txs)],
        "merchant_cache": [],
    })


def run(db, fake):
    settings = SimpleNamespace(anthropic_api_key="sk-teste")
    with patch.object(claude_api, "get_supabase", return_value=db), \
         patch.object(claude_api, "get_settings", return_value=settings), \
         patch.object(claude_api.anthropic, "Anthropic", return_value=fake):
        return claude_api.process_categorization_queue()


class TestQueueClaim:
    def test_concurrent_call_does_not_take_the_same_items(self):
        db = queue_db("LOJA XPTO 123", "LOJA ABC 456")
        second = {}
        # Uma segunda chamada da rota interna chega enquanto a primeira espera o modelo
        fake = FakeClaude(on_call=lambda: second.update(run(db, fake)))
        first = run(db, fake)
        assert second == {"status": "ok", "processed": 0}
        assert first["processed"] == 2
        assert sorted(fake.calls) == ["LOJA ABC 456", "LOJA XPTO 123"]  # uma chamada ao modelo por item
        assert [q["status"] for q in db.rows("categorization_queue")] == ["done", "done"]


class TestQueueRetry:
    def test_failed_item_goes_back_to_the_queue_and_is_retried(self):
        db = queue_db("LOJA XPTO 123")
        run(db, FakeClaude(errors=1))
        item = db.rows("categorization_queue")[0]
        assert (item["status"], item["retry_count"]) == ("pending", 1)
        assert "Connection error" in item["error_message"]

        run(db, FakeClaude())
        assert db.rows("categorization_queue")[0]["status"] == "done"
        assert db.rows("transactions")[0]["category_id"] == "cat-food"

    def test_item_fails_for_good_after_max_retries(self):
        db = queue_db("LOJA XPTO 123")
        fake = FakeClaude(errors=10)
        for _ in range(5):
            run(db, fake)
        assert len(fake.calls) == 4  # a primeira tentativa e as 3 novas
        item = db.rows("categorization_queue")[0]
        assert (item["status"], item["retry_count"]) == ("failed", 3)
        assert db.rows("transactions")[0]["category_id"] is None
