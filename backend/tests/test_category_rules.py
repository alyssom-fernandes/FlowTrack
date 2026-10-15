"""Regra de categoria da pessoa ("Aplicar sempre"): grava no merchant_cache, aplica nas transações com a
mesma descrição, vale antes das regras fixas e da IA, e aparece como sugestão na prévia da importação.
A demonstração do navegador segue as mesmas regras (frontend/src/demo/backend.ts)."""
from tests.test_helpers import OFX_WITH_CLOSE_TAGS
from tests.test_review import ACC, CAT_FOOD, CAT_OTHER_USER, OTHER, USER, api, base_tables, tx
from tests.test_security import _run_worker, _tx, _worker_db, ALICE

CAT_TECH = "cat-health"   # categoria padrão qualquer, diferente da que a IA deu


def notebook(id_, **kw):
    return tx(id_, -389.9, description="Notebook Dell", description_normalized="NOTEBOOK DELL", **kw)


def tables(rows):
    t = base_tables(rows)
    t["merchant_cache"] = []
    t["audit_log"] = []
    return t


class TestCreateRule:
    def test_applies_to_same_description_and_keeps_manual_choices(self):
        rows = [
            notebook("p1", category_id=CAT_FOOD, categorized_by="ai", confidence_score=0.82),
            notebook("p2"),  # sem categoria
            notebook("p3", category_id=CAT_FOOD, categorized_by="manual", confidence_score=1.0),
            tx("outra", -10, description="Uber", description_normalized="UBER", category_id=CAT_FOOD, categorized_by="ai", confidence_score=0.7),
            {**notebook("transf"), "type": "transfer"},
        ]
        with api(tables(rows)) as (c, db):
            r = c.post("/api/v1/category-rules", json={"description": "Notebook  Dell", "category_id": CAT_TECH})
            assert r.status_code == 200, r.text
            assert r.json()["updated"] == 2
            by_id = {t["id"]: t for t in db.rows("transactions")}
            cache = db.rows("merchant_cache")
            audit = {a["entity_id"]: a for a in db.rows("audit_log")}
        # As duas mudadas entram no Histórico com a categoria de antes (para poder desfazer)
        assert set(audit) == {"p1", "p2"}
        assert audit["p1"]["old_values"]["category_id"] == CAT_FOOD and audit["p1"]["new_values"]["category_id"] == CAT_TECH
        for i in ("p1", "p2"):
            assert by_id[i]["category_id"] == CAT_TECH
            assert by_id[i]["categorized_by"] == "rule" and by_id[i]["confidence_score"] == 1.0
        assert by_id["p3"]["category_id"] == CAT_FOOD          # escolha à mão continua
        assert by_id["outra"]["category_id"] == CAT_FOOD       # outra descrição não muda
        assert by_id["transf"].get("category_id") is None       # transferência não ganha categoria
        assert cache == [{**cache[0], "normalized_description": "NOTEBOOK DELL", "user_id": USER,
                          "category_id": CAT_TECH, "source": "manual", "confidence": 1.0}]

    def test_second_rule_for_same_description_replaces_the_first(self):
        with api(tables([])) as (c, db):
            c.post("/api/v1/category-rules", json={"description": "AMAZON", "category_id": CAT_FOOD})
            c.post("/api/v1/category-rules", json={"description": "amazon", "category_id": CAT_TECH})
            cache = db.rows("merchant_cache")
        assert len(cache) == 1 and cache[0]["category_id"] == CAT_TECH

    def test_category_of_another_user_is_refused(self):
        with api(tables([notebook("p1")])) as (c, db):
            r = c.post("/api/v1/category-rules", json={"description": "Notebook Dell", "category_id": CAT_OTHER_USER})
            assert r.status_code == 404
            assert db.rows("merchant_cache") == []
            assert db.rows("transactions")[0].get("category_id") is None

    def test_does_not_touch_someone_elses_transactions(self):
        other = {**notebook("dele"), "user_id": OTHER}
        with api(tables([other])) as (c, db):
            assert c.post("/api/v1/category-rules", json={"description": "Notebook Dell", "category_id": CAT_TECH}).json()["updated"] == 0
            assert db.rows("transactions")[0].get("category_id") is None

    def test_description_without_letters_is_422(self):
        with api(tables([])) as (c, _):
            assert c.post("/api/v1/category-rules", json={"description": "***", "category_id": CAT_FOOD}).status_code == 422


class TestRuleInImportPreview:
    def test_own_rule_wins_over_fixed_rule(self):
        # No OFX de exemplo, "SUPERMERCADO ABC" casaria com a regra fixa de Alimentação (0,94)
        files = {"file": ("extrato.ofx", OFX_WITH_CLOSE_TAGS, "application/x-ofx")}
        t = tables([])
        with api(t) as (c, db):
            debit_desc = next(x for x in c.post("/api/v1/import/ofx/parse", files=files).json()["transactions"] if x["amount"] < 0)["description"]
            c.post("/api/v1/category-rules", json={"description": debit_desc, "category_id": CAT_TECH})
            debit = next(x for x in c.post("/api/v1/import/ofx/parse", files=files).json()["transactions"] if x["amount"] < 0)
        assert debit["suggested_category_id"] == CAT_TECH
        assert debit["suggested_confidence"] == 1.0

    def test_rule_of_another_user_is_not_suggested(self):
        files = {"file": ("extrato.ofx", OFX_WITH_CLOSE_TAGS, "application/x-ofx")}
        t = tables([])
        with api(t) as (c, db):
            debit_desc = next(x for x in c.post("/api/v1/import/ofx/parse", files=files).json()["transactions"] if x["amount"] < 0)["description"]
            from app.api.v1._helpers import rule_key
            db.tables["merchant_cache"].append({"normalized_description": rule_key(debit_desc), "user_id": OTHER,
                                                "category_id": CAT_TECH, "source": "manual"})
            debit = next(x for x in c.post("/api/v1/import/ofx/parse", files=files).json()["transactions"] if x["amount"] < 0)
        assert debit["suggested_category_id"] == CAT_FOOD


class TestRuleInWorker:
    def test_own_rule_runs_before_fixed_rules(self):
        db = _worker_db()
        # "UBER *TRIP" casaria com a regra fixa de Transporte
        db.tables["merchant_cache"].append({"normalized_description": "UBER TRIP", "user_id": ALICE, "category_id": "cat-food", "source": "manual"})
        _tx(db, "tx-a2")["description_normalized"] = "UBER TRIP"
        fake = _run_worker(db, "Transporte", [{"transaction_id": "tx-a2", "user_id": ALICE}])
        assert _tx(db, "tx-a2")["category_id"] == "cat-food"
        assert _tx(db, "tx-a2")["categorized_by"] == "rule" and _tx(db, "tx-a2")["confidence_score"] == 1.0
        assert fake.prompts == []

    def test_ai_answer_outros_leaves_it_uncategorized(self):
        db = _worker_db()
        db.tables["categories"].append({"id": "cat-outros", "name": "Outros", "user_id": None, "is_default": True})
        _run_worker(db, "Outros", [{"transaction_id": "tx-a1", "user_id": ALICE}])
        assert _tx(db, "tx-a1").get("category_id") is None
        assert db.rows("merchant_cache") == []
        assert db.rows("categorization_queue")[0]["status"] == "done"
