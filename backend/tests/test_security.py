"""Autorização entre usuários, validação do token e limites de entrada.

A API usa a chave service_role (ignora o RLS), então cada rota precisa
conferir o dono de toda conta e categoria que chega na requisição.
Estes testes usam um banco em memória que filtra de verdade (fake_supabase).
"""
import time
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tests.fake_supabase import FakeSupabase

ALICE, BOB = "user-alice", "user-bob"
ACC_ALICE, ACC_BOB = "acc-alice", "acc-bob"
CAT_DEFAULT, CAT_BOB = "cat-default", "cat-bob"
SECRET = "test-secret-with-at-least-32-characters!"

_MODULES = [
    "app.api.v1.accounts", "app.api.v1.transactions", "app.api.v1.imports", "app.api.v1.goals",
    "app.api.v1.investments", "app.api.v1.categories", "app.api.v1.budgets", "app.api.v1.analytics",
    "app.api.v1.insights", "app.api.v1.audit", "app.api.v1.internal",
]


def _seed() -> dict:
    return {
        "accounts": [
            {"id": ACC_ALICE, "user_id": ALICE, "name": "Conta da Alice", "balance": 1000.0, "is_active": True},
            {"id": ACC_BOB, "user_id": BOB, "name": "Conta do Bob", "balance": 5000.0, "is_active": True},
        ],
        "categories": [
            {"id": CAT_DEFAULT, "user_id": None, "is_default": True, "name": "Alimentação"},
            {"id": CAT_BOB, "user_id": BOB, "is_default": False, "name": "Categoria do Bob"},
        ],
        "transactions": [], "audit_log": [], "demo_users": [], "categorization_queue": [],
        "budgets": [], "goals": [],
    }


@pytest.fixture
def api():
    """Cliente autenticado como Alice sobre um banco com dados da Alice e do Bob."""
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.rate_limit import limiter

    db = FakeSupabase(_seed())
    app.dependency_overrides[get_current_user_id] = lambda: ALICE
    limiter.enabled = False
    with ExitStack() as stack:
        for mod in _MODULES:
            stack.enter_context(patch(f"{mod}.get_supabase", return_value=db))
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, db
    limiter.enabled = True
    app.dependency_overrides.clear()


def _balance(db, acc_id):
    return next(a["balance"] for a in db.rows("accounts") if a["id"] == acc_id)


def _txn(**kw):
    base = {"account_id": ACC_ALICE, "description": "Mercado", "amount": -50.0,
            "transaction_date": "2026-10-10", "type": "debit"}
    base.update(kw)
    return base


# ── Contas de outro usuário ───────────────────────────────────
class TestForeignAccount:
    def test_create_with_own_account_adjusts_own_balance(self, api):
        c, db = api
        r = c.post("/api/v1/transactions", json=_txn())
        assert r.status_code == 201
        assert _balance(db, ACC_ALICE) == 950.0

    def test_create_with_foreign_account_is_404_and_changes_nothing(self, api):
        c, db = api
        r = c.post("/api/v1/transactions", json=_txn(account_id=ACC_BOB, amount=-4000.0))
        assert r.status_code == 404
        assert _balance(db, ACC_BOB) == 5000.0
        assert db.rows("transactions") == []

    def test_update_cannot_move_transaction_to_foreign_account(self, api):
        c, db = api
        created = c.post("/api/v1/transactions", json=_txn()).json()
        r = c.patch(f"/api/v1/transactions/{created['id']}", json={"account_id": ACC_BOB})
        assert r.status_code == 404
        assert _balance(db, ACC_BOB) == 5000.0
        assert db.rows("transactions")[0]["account_id"] == ACC_ALICE

    def test_bulk_into_foreign_account_is_404(self, api):
        c, db = api
        payload = {"account_id": ACC_BOB, "transactions": [
            {"description": "X", "amount": -10.0, "transaction_date": "2026-10-10", "type": "debit"}]}
        r = c.post("/api/v1/transactions/bulk", json=payload)
        assert r.status_code == 404
        assert db.rows("transactions") == []
        assert _balance(db, ACC_BOB) == 5000.0

    def test_pdf_import_into_foreign_account_is_404(self, api):
        c, db = api
        r = c.post("/api/v1/import/pdf", data={"account_id": ACC_BOB},
                   files={"file": ("extrato.pdf", b"%PDF-1.4 vazio", "application/pdf")})
        assert r.status_code == 404
        assert db.rows("transactions") == []

    def test_transfer_to_foreign_account_is_404(self, api):
        c, db = api
        r = c.post("/api/v1/transfers", json={"from_account_id": ACC_ALICE, "to_account_id": ACC_BOB,
                                               "amount": 100.0, "transaction_date": "2026-10-10"})
        assert r.status_code == 404
        assert _balance(db, ACC_BOB) == 5000.0

    def test_cannot_delete_foreign_transaction(self, api):
        c, db = api
        db.tables["transactions"].append({"id": "tx-bob", "user_id": BOB, "account_id": ACC_BOB, "amount": -10.0})
        r = c.delete("/api/v1/transactions/tx-bob")
        assert r.status_code == 404
        assert len(db.rows("transactions")) == 1


# ── Categorias de outro usuário ───────────────────────────────
class TestForeignCategory:
    def test_default_category_is_accepted(self, api):
        c, _ = api
        assert c.post("/api/v1/transactions", json=_txn(category_id=CAT_DEFAULT)).status_code == 201

    def test_foreign_category_is_404_on_transaction(self, api):
        c, db = api
        assert c.post("/api/v1/transactions", json=_txn(category_id=CAT_BOB)).status_code == 404
        assert db.rows("transactions") == []

    def test_foreign_category_is_404_on_budget(self, api):
        c, db = api
        r = c.post("/api/v1/budgets", json={"category_id": CAT_BOB, "month": "2026-10", "limit_amount": 100})
        assert r.status_code == 404
        assert db.rows("budgets") == []

    def test_foreign_category_is_404_on_goal(self, api):
        c, db = api
        r = c.post("/api/v1/goals", json={"name": "Meta", "type": "spending_limit", "target_amount": 100,
                                          "start_date": "2026-10-01", "category_id": CAT_BOB})
        assert r.status_code == 404
        assert db.rows("goals") == []


# ── Desfazer pelo histórico ───────────────────────────────────
class TestUndo:
    def _log(self, db, old_values, action="delete"):
        db.tables["audit_log"].append({"id": "log-1", "user_id": ALICE, "entity_type": "transaction",
                                       "entity_id": "tx-1", "action": action, "old_values": old_values,
                                       "undone": False})

    def test_forged_log_cannot_write_into_foreign_account(self, api):
        c, db = api
        self._log(db, {"user_id": BOB, "account_id": ACC_BOB, "description": "forjada", "amount": 9999.0,
                       "transaction_date": "2026-10-10", "type": "credit"})
        r = c.post("/api/v1/audit-log/log-1/undo")
        assert r.status_code == 404
        assert db.rows("transactions") == []
        assert _balance(db, ACC_BOB) == 5000.0

    def test_restore_takes_owner_from_token_not_from_log(self, api):
        c, db = api
        self._log(db, {"user_id": BOB, "account_id": ACC_ALICE, "description": "Mercado", "amount": -50.0,
                       "transaction_date": "2026-10-10", "type": "debit", "tags": ["casa"]})
        r = c.post("/api/v1/audit-log/log-1/undo")
        assert r.status_code == 200
        restored = db.rows("transactions")[0]
        assert restored["user_id"] == ALICE
        assert restored["id"] == "tx-1"
        assert restored["tags"] == ["casa"]
        assert _balance(db, ACC_ALICE) == 950.0

    def test_restore_drops_foreign_category(self, api):
        c, db = api
        self._log(db, {"account_id": ACC_ALICE, "category_id": CAT_BOB, "description": "Mercado",
                       "amount": -50.0, "transaction_date": "2026-10-10", "type": "debit"})
        assert c.post("/api/v1/audit-log/log-1/undo").status_code == 200
        assert db.rows("transactions")[0]["category_id"] is None

    def test_cannot_undo_someone_elses_log(self, api):
        c, db = api
        db.tables["audit_log"].append({"id": "log-bob", "user_id": BOB, "entity_type": "transaction",
                                       "entity_id": "tx-9", "action": "create", "old_values": None, "undone": False})
        assert c.post("/api/v1/audit-log/log-bob/undo").status_code == 404
        assert db.rows("audit_log")[0]["undone"] is False


# ── Token ─────────────────────────────────────────────────────
@pytest.fixture
def settings():
    fake = SimpleNamespace(supabase_jwt_secret=SECRET, internal_api_token="segredo-interno",
                           supabase_url="https://x.supabase.co", supabase_anon_key="anon")
    with patch("app.core.security.get_settings", return_value=fake):
        yield fake


def _token(alg="HS256", key=SECRET, **claims):
    payload = {"sub": ALICE, "aud": "authenticated", "exp": int(time.time()) + 600}
    payload.update(claims)
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(payload, key, algorithm=alg)


class TestToken:
    def test_valid_token(self, settings):
        from app.core.security import decode_token
        assert decode_token(_token())["sub"] == ALICE

    @pytest.mark.parametrize("token_kwargs", [
        {"aud": "anon"},                                  # audiência errada (ex.: a chave anon pública)
        {"aud": None},                                    # sem audiência
        {"exp": None},                                    # sem validade
        {"exp": int(time.time()) - 10},                   # vencido
        {"key": "outro-segredo-com-32-caracteres-ou-mais"},  # assinatura errada
        {"alg": "HS384"},                                 # algoritmo fora da lista
    ])
    def test_rejected_tokens(self, settings, token_kwargs):
        from app.core.security import decode_token
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(_token(**token_kwargs))

    def test_unsigned_token_is_rejected(self, settings):
        from app.core.security import decode_token
        unsigned = jwt.encode({"sub": ALICE, "aud": "authenticated", "exp": int(time.time()) + 600}, None, algorithm="none")
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(unsigned)

    def test_get_current_user_id_turns_errors_into_401(self, settings):
        from app.core.security import get_current_user_id
        creds = SimpleNamespace(credentials=_token(aud="anon"))
        with pytest.raises(HTTPException) as e:
            get_current_user_id(creds)
        assert e.value.status_code == 401

    def test_internal_secret(self, settings):
        from app.core.security import verify_internal_token
        assert verify_internal_token("segredo-interno") is True
        with pytest.raises(HTTPException):
            verify_internal_token("segredo-errado")

    def test_empty_internal_secret_never_matches(self, settings):
        from app.core.security import verify_internal_token
        settings.internal_api_token = ""
        with pytest.raises(HTTPException):
            verify_internal_token("")


# ── Limites e respostas públicas ──────────────────────────────
class TestLimits:
    def test_upload_over_10mb_is_413(self, api):
        c, _ = api
        big = b"0" * (11 * 1024 * 1024)
        r = c.post("/api/v1/import/ofx/parse", files={"file": ("extrato.ofx", big, "application/octet-stream")})
        assert r.status_code == 413

    def test_health_does_not_expose_version_or_env(self, api):
        c, _ = api
        assert c.get("/health").json() == {"status": "ok"}
