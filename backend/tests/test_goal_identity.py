"""Identidade da meta de economia: cor da paleta e glifo, ambos opcionais.

Usa o banco em memória (fake_supabase) para conferir o que chega de fato à tabela goals.
"""
from contextlib import ExitStack
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from tests.fake_supabase import FakeSupabase

ALICE = "user-alice"
_MODULES = ["app.api.v1.goals"]


@pytest.fixture
def api():
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.rate_limit import limiter

    db = FakeSupabase({"goals": [], "categories": [], "transactions": []})
    app.dependency_overrides[get_current_user_id] = lambda: ALICE
    limiter.enabled = False
    with ExitStack() as stack:
        for mod in _MODULES:
            stack.enter_context(patch(f"{mod}.get_supabase", return_value=db))
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, db
    limiter.enabled = True
    app.dependency_overrides.clear()


def _savings(**kw):
    base = {"name": "Viagem", "type": "savings_target", "target_amount": 5000,
            "period": "custom", "start_date": "2026-01-01", "end_date": "2026-12-31"}
    base.update(kw)
    return base


class TestGoalIdentity:
    def test_create_with_color_and_icon(self, api):
        c, db = api
        r = c.post("/api/v1/goals", json=_savings(color="cat-3", icon="plane"))
        assert r.status_code == 201
        assert r.json()["color"] == "cat-3" and r.json()["icon"] == "plane"
        assert db.rows("goals")[0]["color"] == "cat-3"

    def test_create_without_identity_does_not_write_the_columns(self, api):
        # Banco sem a migração v2.2 continua aceitando metas sem cor e ícone
        c, db = api
        r = c.post("/api/v1/goals", json=_savings())
        assert r.status_code == 201
        assert r.json()["color"] is None and r.json()["icon"] is None
        assert "color" not in db.rows("goals")[0] and "icon" not in db.rows("goals")[0]

    @pytest.mark.parametrize("color", ["#00ff00", "green", "cat-4", "cat-8", "var(--accent)"])
    def test_color_outside_the_palette_is_422(self, api, color):
        # Verde, âmbar e vermelho são cores de estado: não servem de identidade
        c, db = api
        r = c.post("/api/v1/goals", json=_savings(color=color))
        assert r.status_code == 422
        assert db.rows("goals") == []

    @pytest.mark.parametrize("icon", ["<svg>", "Plane", "a" * 41, "plane;drop"])
    def test_invalid_icon_is_422(self, api, icon):
        c, _ = api
        assert c.post("/api/v1/goals", json=_savings(icon=icon)).status_code == 422

    def test_update_changes_color_and_icon(self, api):
        c, db = api
        goal_id = c.post("/api/v1/goals", json=_savings(color="accent", icon="piggy-bank")).json()["id"]
        r = c.patch(f"/api/v1/goals/{goal_id}", json={"color": "cat-5", "icon": "gift"})
        assert r.status_code == 200
        assert (r.json()["color"], r.json()["icon"]) == ("cat-5", "gift")
        assert db.rows("goals")[0]["icon"] == "gift"

    def test_update_rejects_color_outside_the_palette(self, api):
        c, db = api
        goal_id = c.post("/api/v1/goals", json=_savings(color="accent")).json()["id"]
        assert c.patch(f"/api/v1/goals/{goal_id}", json={"color": "#ff0000"}).status_code == 422
        assert db.rows("goals")[0]["color"] == "accent"
