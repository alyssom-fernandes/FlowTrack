"""Camada 3 do worker: o Claude responde categoria e confiança por tool use, e essa confiança decide
se a transação vai para "A revisar". O cliente da Anthropic é simulado; nenhuma chamada sai da máquina."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.api.v1._helpers import NEEDS_REVIEW_FILTER, REVIEW_CONFIDENCE
from app.integrations import claude_api
from tests.fake_supabase import FakeSupabase

USER = "user-alice"


def tool_response(category, confidence, *, name="categorize"):
    block = SimpleNamespace(type="tool_use", name=name, id="toolu_1",
                            input={"category": category, "confidence": confidence})
    usage = SimpleNamespace(input_tokens=120, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(content=[block], usage=usage)


class FakeClaude:
    def __init__(self, response):
        self.response, self.calls = response, []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        return self.response


def db():
    return FakeSupabase({
        "categories": [
            {"id": "cat-food", "name": "Alimentação", "user_id": None, "is_default": True},
            {"id": "cat-other", "name": "Outros", "user_id": None, "is_default": True},
            {"id": "cat-pets", "name": "Pets", "user_id": USER, "is_default": False},
        ],
        # Descrição que nenhuma regra fixa reconhece: chega até a IA
        "transactions": [{"id": "tx-1", "user_id": USER, "description": "LOJA XPTO 123", "amount": -42.0,
                          "type": "debit", "category_id": None}],
        "categorization_queue": [{"id": "q1", "transaction_id": "tx-1", "user_id": USER,
                                  "status": "pending", "created_at": "1"}],
        "merchant_cache": [],
    })


def run(database, response):
    fake = FakeClaude(response)
    settings = SimpleNamespace(anthropic_api_key="sk-teste")
    with patch.object(claude_api, "get_supabase", return_value=database), \
         patch.object(claude_api, "get_settings", return_value=settings), \
         patch.object(claude_api.anthropic, "Anthropic", return_value=fake):
        claude_api.process_categorization_queue()
    return fake, database.rows("transactions")[0]


def in_review(database):
    """Aplica o mesmo filtro PostgREST que a rota usa em needs_review=true."""
    return [t["id"] for t in database.table("transactions").select("*").or_(NEEDS_REVIEW_FILTER).execute().data]


class TestStructuredOutput:
    def test_request_forces_the_tool_with_the_allowed_categories(self):
        fake, _ = run(db(), tool_response("Alimentação", 0.9))
        call = fake.calls[0]
        assert call["tool_choice"] == {"type": "tool", "name": "categorize"}
        schema = call["tools"][0]["input_schema"]
        assert set(schema["properties"]["category"]["enum"]) == {"Alimentação", "Outros", "Pets"}
        assert schema["required"] == ["category", "confidence"]

    def test_model_confidence_is_stored(self):
        database = db()
        _, tx = run(database, tool_response("Alimentação", 0.97))
        assert (tx["category_id"], tx["categorized_by"], tx["confidence_score"]) == ("cat-food", "ai", 0.97)
        assert in_review(database) == []

    def test_low_confidence_goes_to_review(self):
        database = db()
        _, tx = run(database, tool_response("Pets", 0.6))
        assert tx["category_id"] == "cat-pets" and tx["confidence_score"] == 0.6
        assert tx["confidence_score"] < REVIEW_CONFIDENCE
        assert in_review(database) == ["tx-1"]

    def test_low_confidence_is_not_cached(self):
        database = db()
        run(database, tool_response("Pets", 0.6))
        assert database.rows("merchant_cache") == []

    def test_high_confidence_is_cached_with_its_confidence(self):
        database = db()
        run(database, tool_response("Alimentação", 0.92))
        cache = database.rows("merchant_cache")
        assert len(cache) == 1 and cache[0]["confidence"] == 0.92 and cache[0]["source"] == "ai"

    def test_category_outside_the_list_leaves_it_uncategorized(self):
        database = db()
        _, tx = run(database, tool_response("Categoria inventada", 0.99))
        assert tx.get("category_id") is None
        assert in_review(database) == ["tx-1"]
        assert database.rows("categorization_queue")[0]["status"] == "done"

    def test_fallback_category_is_not_a_suggestion(self):
        _, tx = run(db(), tool_response("Outros", 0.95))
        assert tx.get("category_id") is None

    @pytest.mark.parametrize("bad", [None, "0.9", 1.5, -0.1, True])
    def test_invalid_confidence_becomes_zero_and_goes_to_review(self, bad):
        database = db()
        _, tx = run(database, tool_response("Alimentação", bad))
        assert tx["category_id"] == "cat-food" and tx["confidence_score"] == 0.0
        assert in_review(database) == ["tx-1"]

    def test_text_answer_without_tool_use_is_ignored(self):
        response = SimpleNamespace(content=[SimpleNamespace(type="text", text="Alimentação")], usage=None)
        _, tx = run(db(), response)
        assert tx.get("category_id") is None


class TestParseCategorization:
    def test_reads_the_tool_block(self):
        assert claude_api.parse_categorization(tool_response(" Pets ", 0.876)) == ("Pets", 0.88)

    def test_other_tool_name_is_ignored(self):
        assert claude_api.parse_categorization(tool_response("Pets", 0.9, name="outra")) == (None, 0.0)

    def test_empty_response(self):
        assert claude_api.parse_categorization(SimpleNamespace(content=[])) == (None, 0.0)
