"""Revisão da categorização: filtro "A revisar", categoria sugerida na prévia da importação e a
categoria conferida que chega na gravação em lote. A demonstração do navegador segue as mesmas regras
(frontend/src/demo/backend.ts e frontend/src/lib/review.ts)."""
from contextlib import ExitStack, contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.fake_supabase import FakeSupabase
from tests.test_helpers import OFX_WITH_CLOSE_TAGS

USER, OTHER = "user-alice", "user-bob"
ACC = "acc-alice"
CAT_FOOD, CAT_OTHER_USER = "cat-food", "cat-bob"
MODULES = ["app.api.v1.transactions", "app.api.v1.imports"]


def tx(id_, amount, **kw):
    return {"id": id_, "user_id": USER, "account_id": ACC, "description": id_, "amount": amount,
            "transaction_date": "2026-10-10", "type": "debit" if amount < 0 else "credit", "currency": "BRL",
            "is_recurring": False, "sync_status": "synced", "created_at": "2026-10-10T12:00:00", "updated_at": "2026-10-10T12:00:00", **kw}


def base_tables(transactions=None):
    return {
        "accounts": [{"id": ACC, "user_id": USER, "name": "Conta", "balance": 1000.0, "is_active": True}],
        "categories": [
            {"id": CAT_FOOD, "user_id": None, "is_default": True, "name": "Alimentação"},
            {"id": "cat-health", "user_id": None, "is_default": True, "name": "Saúde"},
            {"id": CAT_OTHER_USER, "user_id": OTHER, "is_default": False, "name": "Do Bob"},
        ],
        "transactions": transactions or [], "demo_users": [], "categorization_queue": [], "audit_log": [],
    }


@contextmanager
def api(tables):
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.rate_limit import limiter
    db = FakeSupabase(tables)
    app.dependency_overrides[get_current_user_id] = lambda: USER
    limiter.enabled = False
    with ExitStack() as stack:
        for mod in MODULES:
            stack.enter_context(patch(f"{mod}.get_supabase", return_value=db))
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, db
    limiter.enabled = True
    app.dependency_overrides.clear()


class TestNeedsReview:
    def test_only_uncategorized_and_low_confidence_ai(self):
        rows = [
            tx("sem-categoria", -10),
            tx("ia-baixa", -20, category_id=CAT_FOOD, categorized_by="ai", confidence_score=0.71),
            tx("ia-alta", -30, category_id=CAT_FOOD, categorized_by="ai", confidence_score=0.93),
            tx("manual", -40, category_id=CAT_FOOD, categorized_by="manual", confidence_score=1.0),
            tx("regra", -50, category_id=CAT_FOOD, categorized_by="rule", confidence_score=0.6),
            {**tx("transferencia", -60), "type": "transfer"},
        ]
        with api(base_tables(rows)) as (c, _):
            body = c.get("/api/v1/transactions?needs_review=true").json()
        assert sorted(t["id"] for t in body["transactions"]) == ["ia-baixa", "sem-categoria"]
        assert body["total"] == 2

    def test_without_the_flag_lists_everything(self):
        with api(base_tables([tx("a", -10), tx("b", -20, category_id=CAT_FOOD, categorized_by="manual")])) as (c, _):
            assert c.get("/api/v1/transactions").json()["total"] == 2


class TestImportSuggestion:
    def test_ofx_preview_suggests_category_from_rules(self):
        files = {"file": ("extrato.ofx", OFX_WITH_CLOSE_TAGS, "application/x-ofx")}
        with api(base_tables()) as (c, _):
            body = c.post("/api/v1/import/ofx/parse", files=files).json()
        debit = next(t for t in body["transactions"] if t["amount"] < 0)
        credit = next(t for t in body["transactions"] if t["amount"] > 0)
        # "SUPERMERCADO" casa com a regra de Alimentação (0,94); entradas não ganham sugestão
        assert debit["suggested_category_id"] == CAT_FOOD
        assert debit["suggested_confidence"] == 0.94
        assert "suggested_category_id" not in credit


class TestBulkWithCategory:
    def item(self, **kw):
        return {"description": "Mercado", "amount": -30.0, "transaction_date": "2026-10-10", "type": "debit", **kw}

    def test_accepted_suggestion_is_saved_as_rule_and_skips_the_queue(self):
        with api(base_tables()) as (c, db):
            r = c.post("/api/v1/transactions/bulk", json={"account_id": ACC, "transactions": [
                self.item(category_id=CAT_FOOD, categorized_by="rule", confidence_score=0.94),
                self.item(description="Pix", amount=-80.0),
            ]})
            assert r.status_code == 200, r.text
            saved = {t["description"]: t for t in db.rows("transactions")}
            queue = db.rows("categorization_queue")
        assert saved["Mercado"]["category_id"] == CAT_FOOD
        assert saved["Mercado"]["categorized_by"] == "rule" and saved["Mercado"]["confidence_score"] == 0.94
        assert "category_id" not in saved["Pix"] or saved["Pix"]["category_id"] is None
        # Só a sem categoria vai para a fila da IA
        assert [q["transaction_id"] for q in queue] == [saved["Pix"]["id"]]

    def test_changed_category_is_manual_with_full_confidence(self):
        with api(base_tables()) as (c, db):
            c.post("/api/v1/transactions/bulk", json={"account_id": ACC, "transactions": [self.item(category_id="cat-health", categorized_by="manual")]})
            saved = db.rows("transactions")[0]
        assert saved["categorized_by"] == "manual" and saved["confidence_score"] == 1.0

    def test_category_of_another_user_is_refused(self):
        with api(base_tables()) as (c, db):
            r = c.post("/api/v1/transactions/bulk", json={"account_id": ACC, "transactions": [self.item(category_id=CAT_OTHER_USER)]})
            assert r.status_code == 404
            assert db.rows("transactions") == []

    def test_ai_is_not_accepted_as_origin(self):
        with api(base_tables()) as (c, _):
            r = c.post("/api/v1/transactions/bulk", json={"account_id": ACC, "transactions": [self.item(category_id=CAT_FOOD, categorized_by="ai")]})
        assert r.status_code == 422
