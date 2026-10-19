"""Resumo do mês: vem no idioma da interface e diz se foi escrito pelo Claude ou montado sem IA.
O cliente da Anthropic é simulado; nenhuma chamada sai da máquina."""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.fake_supabase import FakeSupabase

USER = "user-alice"


class FakeClaude:
    def __init__(self):
        self.prompts = []
        self.messages = self

    def create(self, **kw):
        self.prompts.append(kw["messages"][0]["content"])
        return SimpleNamespace(content=[SimpleNamespace(type="text", text="Resumo de teste.")])


@contextmanager
def api(api_key: str):
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.rate_limit import limiter
    from app.api.v1 import insights
    insights._insights_cache.clear()
    db = FakeSupabase({
        "transactions": [
            {"id": "t1", "user_id": USER, "amount": 1000.0, "category_id": None, "description": "SALARIO EXEMPLO",
             "is_recurring": False, "type": "credit", "transaction_date": "2026-10-05"},
            {"id": "t2", "user_id": USER, "amount": -250.0, "category_id": "cat-food", "description": "MERCADO EXEMPLO",
             "is_recurring": False, "type": "debit", "transaction_date": "2026-10-06"},
        ],
        "categories": [{"id": "cat-food", "name": "Alimentação", "user_id": None, "is_default": True}],
        "goals": [],
    })
    fake = FakeClaude()
    app.dependency_overrides[get_current_user_id] = lambda: USER
    limiter.enabled = False
    try:
        with patch.object(insights, "get_supabase", return_value=db), \
             patch("app.core.config.get_settings", return_value=SimpleNamespace(anthropic_api_key=api_key)), \
             patch("anthropic.Anthropic", return_value=fake), \
             TestClient(app, raise_server_exceptions=False) as c:
            yield c, fake
    finally:
        limiter.enabled = True
        app.dependency_overrides.clear()
        insights._insights_cache.clear()


PERIOD = {"start_date": "2026-10-01", "end_date": "2026-10-31"}


class TestInsightLanguage:
    def test_english_interface_asks_for_english(self):
        with api("sk-teste") as (c, fake):
            body = c.post("/api/v1/insights", json={**PERIOD, "language": "en"}).json()
        assert body["source"] == "ai"
        assert "in English" in fake.prompts[0] and "em português" not in fake.prompts[0]

    def test_portuguese_is_the_default(self):
        with api("sk-teste") as (c, fake):
            c.post("/api/v1/insights", json=PERIOD)
        assert "em português" in fake.prompts[0]

    def test_each_language_has_its_own_cache_entry(self):
        with api("sk-teste") as (c, fake):
            pt = c.post("/api/v1/insights", json={**PERIOD, "language": "pt"}).json()
            en = c.post("/api/v1/insights", json={**PERIOD, "language": "en"}).json()
            again = c.post("/api/v1/insights", json={**PERIOD, "language": "en"}).json()
        assert (pt["cached"], en["cached"], again["cached"]) == (False, False, True)
        assert len(fake.prompts) == 2

    def test_unknown_language_is_rejected(self):
        with api("sk-teste") as (c, _):
            assert c.post("/api/v1/insights", json={**PERIOD, "language": "fr"}).status_code == 422


class TestInsightSource:
    def test_without_api_key_the_text_is_a_template_in_the_chosen_language(self):
        with api("") as (c, fake):
            en = c.post("/api/v1/insights", json={**PERIOD, "language": "en"}).json()
            pt = c.post("/api/v1/insights", json={**PERIOD, "language": "pt"}).json()
        assert fake.prompts == []
        assert en["source"] == "template" and en["text"].startswith("Income:")
        assert pt["source"] == "template" and pt["text"].startswith("Receitas:")

    def test_cached_answer_keeps_its_source(self):
        with api("") as (c, _):
            c.post("/api/v1/insights", json=PERIOD)
            again = c.post("/api/v1/insights", json=PERIOD).json()
        assert again["cached"] is True and again["source"] == "template"
