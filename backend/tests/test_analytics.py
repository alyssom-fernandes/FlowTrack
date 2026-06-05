"""Tests for analytics, insights, and audit endpoints."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import date
from unittest.mock import MagicMock

TEST_USER_ID    = "test-user-00000000-0000-0000-0000-000000000001"
TEST_ACCOUNT_ID = "test-acc-00000000-0000-0000-0000-000000000001"
TEST_CAT_ID     = "test-cat-00000000-0000-0000-0000-000000000001"
TEST_TXN_ID     = "test-txn-00000000-0000-0000-0000-000000000001"
TEST_BUDGET_ID  = "test-bud-00000000-0000-0000-0000-000000000001"
TEST_LOG_ID     = "test-log-00000000-0000-0000-0000-000000000001"


# ── Summary ───────────────────────────────────────────────────
class TestMonthlySummary:
    def test_returns_sorted_list(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q
        q.execute.return_value = MagicMock(data=[
            {"transaction_date": "2026-01-15", "amount": 1000.0},
            {"transaction_date": "2026-01-20", "amount": -300.0},
            {"transaction_date": "2026-02-05", "amount": -150.0},
        ])
        sb.table.return_value.select.return_value = q
        r = c.get("/api/v1/summary/monthly?months=3")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        assert len(body) >= 1
        months = [item["month"] for item in body]
        assert months == sorted(months)

    def test_income_expense_split(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q
        q.execute.return_value = MagicMock(data=[
            {"transaction_date": "2026-06-01", "amount": 2000.0},
            {"transaction_date": "2026-06-10", "amount": -500.0},
            {"transaction_date": "2026-06-15", "amount": -200.0},
        ])
        sb.table.return_value.select.return_value = q
        r = c.get("/api/v1/summary/monthly?months=1")
        assert r.status_code == 200
        body = r.json()
        june = next((m for m in body if m["month"] == "2026-06"), None)
        assert june is not None
        assert june["income"] == 2000.0
        assert june["expense"] == 700.0

    def test_empty_returns_empty_list(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value.select.return_value = q
        r = c.get("/api/v1/summary/monthly")
        assert r.status_code == 200
        assert r.json() == []


# ── Alerts ────────────────────────────────────────────────────
class TestAlerts:
    def _wire_alerts(self, sb, txns=None, goals=None, accounts=None, budgets=None):
        """Wire all sub-queries that list_alerts makes."""
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.lte.return_value = q
        q.lt.return_value = q; q.limit.return_value = q; q.select.return_value = q
        q.not_.return_value = q; q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q
        return q

    def test_returns_alert_list(self, client):
        c, sb = client
        self._wire_alerts(sb)
        r = c.get("/api/v1/alerts")
        assert r.status_code == 200
        body = r.json()
        assert "alerts" in body
        assert "total" in body
        assert isinstance(body["alerts"], list)

    def test_negative_balance_produces_danger_alert(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.lte.return_value = q
        q.lt.return_value = q; q.limit.return_value = q; q.not_.return_value = q
        q.select.return_value = q

        call_count = [0]
        def execute_side_effect():
            call_count[0] += 1
            # txns query
            if call_count[0] == 1:
                return MagicMock(data=[])
            # goals query
            if call_count[0] == 2:
                return MagicMock(data=[])
            # negative accounts
            if call_count[0] == 3:
                return MagicMock(data=[{"name": "Conta Corrente", "balance": -50.0}])
            return MagicMock(data=[])

        q.execute.side_effect = execute_side_effect
        sb.table.return_value = q

        r = c.get("/api/v1/alerts")
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        danger = [a for a in alerts if a["type"] == "danger" and a["category"] == "account"]
        assert len(danger) >= 1
        assert "Conta Corrente" in danger[0]["message"]


# ── Net Worth ────────────────────────────────────────────────
class TestNetWorth:
    def test_returns_net_worth_structure(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.order.return_value = q; q.limit.return_value = q
        q.select.return_value = q

        call_results = [
            MagicMock(data=[{"balance": 5000.0}, {"balance": 3000.0}]),  # accounts
            MagicMock(data=[{"current_value": 2000.0}]),                 # investments
            MagicMock(data=[]),                                          # snapshots
        ]
        q.execute.side_effect = call_results
        sb.table.return_value = q

        r = c.get("/api/v1/net-worth")
        assert r.status_code == 200
        body = r.json()
        assert "total_accounts" in body
        assert "total_investments" in body
        assert "net_worth" in body
        assert "snapshots" in body

    def test_net_worth_calculation(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.order.return_value = q; q.limit.return_value = q
        q.select.return_value = q
        q.execute.side_effect = [
            MagicMock(data=[{"balance": 1000.0}]),
            MagicMock(data=[{"current_value": 500.0}]),
            MagicMock(data=[]),
        ]
        sb.table.return_value = q

        r = c.get("/api/v1/net-worth")
        assert r.status_code == 200
        body = r.json()
        assert body["total_accounts"] == 1000.0
        assert body["total_investments"] == 500.0
        assert body["net_worth"] == 1500.0


# ── Cashflow Projection ──────────────────────────────────────
class TestCashflowProjection:
    def test_returns_projection_structure(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.not_.return_value = q
        q.is_.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.get("/api/v1/cashflow/projection")
        assert r.status_code == 200
        body = r.json()
        assert "days" in body
        assert "starting_balance" in body
        assert "projected_balance" in body
        assert "has_negative_days" in body

    def test_empty_data_returns_valid_structure(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.not_.return_value = q
        q.is_.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.get("/api/v1/cashflow/projection")
        assert r.status_code == 200
        body = r.json()
        assert body["days"] == []
        assert body["has_negative_days"] is False


# ── Financial Projections ────────────────────────────────────
class TestFinancialProjections:
    def test_returns_projection_structure(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[
            {"transaction_date": "2026-01-15", "amount": 3000.0},
            {"transaction_date": "2026-01-20", "amount": -1000.0},
        ])
        sb.table.return_value = q

        r = c.get("/api/v1/projections")
        assert r.status_code == 200
        body = r.json()
        assert "history" in body
        assert "projections" in body
        assert "months_available" in body
        assert "avg_income" in body
        assert "avg_expense" in body

    def test_empty_data_returns_zero_projections(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.get("/api/v1/projections")
        assert r.status_code == 200
        body = r.json()
        assert body["history"] == []
        assert body["projections"] == []
        assert body["months_available"] == 0

    def test_projects_three_months_ahead(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[
            {"transaction_date": "2026-01-10", "amount": 2000.0},
            {"transaction_date": "2026-02-10", "amount": 2000.0},
            {"transaction_date": "2026-03-10", "amount": 2000.0},
        ])
        sb.table.return_value = q

        r = c.get("/api/v1/projections")
        assert r.status_code == 200
        body = r.json()
        assert len(body["projections"]) == 3
        for proj in body["projections"]:
            assert proj["is_projection"] is True


# ── Budgets ───────────────────────────────────────────────────
class TestBudgets:
    def test_list_budgets_returns_structure(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.lte.return_value = q
        q.lt.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.get("/api/v1/budgets?month=2026-06")
        assert r.status_code == 200
        body = r.json()
        assert "budgets" in body
        assert "total" in body

    def test_list_budgets_invalid_month_format(self, client):
        c, _ = client
        r = c.get("/api/v1/budgets?month=06-2026")
        assert r.status_code == 422

    def test_create_budget_success(self, client):
        c, sb = client
        budget = {
            "id": TEST_BUDGET_ID, "user_id": TEST_USER_ID,
            "category_id": TEST_CAT_ID, "month": "2026-06",
            "limit_amount": 500.0, "created_at": "2026-06-01T00:00:00",
        }
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[budget])
        r = c.post("/api/v1/budgets", json={
            "category_id": TEST_CAT_ID, "month": "2026-06", "limit_amount": 500.0
        })
        assert r.status_code == 201
        assert r.json()["limit_amount"] == 500.0

    def test_delete_budget_not_found(self, client):
        c, sb = client
        sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        r = c.delete(f"/api/v1/budgets/{TEST_BUDGET_ID}")
        assert r.status_code == 404


# ── Tags ──────────────────────────────────────────────────────
class TestTags:
    def test_list_tags_returns_sorted(self, client):
        c, sb = client
        mock_data = MagicMock(data=[
            {"tags": ["supermercado", "fixo"]},
            {"tags": ["fixo", "viagem"]},
        ])
        # chain: .table().select().eq().not_.is_().execute()
        sb.table.return_value.select.return_value.eq.return_value.not_.is_.return_value.execute.return_value = mock_data

        r = c.get("/api/v1/tags")
        assert r.status_code == 200
        body = r.json()
        assert "tags" in body
        assert body["tags"] == sorted(body["tags"])
        assert "fixo" in body["tags"]
        assert "supermercado" in body["tags"]

    def test_list_tags_empty(self, client):
        c, sb = client
        sb.table.return_value.select.return_value.eq.return_value.not_.is_.return_value.execute.return_value = MagicMock(data=[])

        r = c.get("/api/v1/tags")
        assert r.status_code == 200
        assert r.json()["tags"] == []


# ── Insights ──────────────────────────────────────────────────
class TestInsights:
    def test_insight_without_api_key_returns_text(self, client):
        """Without an Anthropic API key, should return a simple summary text."""
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.lte.return_value = q
        q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.post("/api/v1/insights", json={
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
        })
        assert r.status_code == 200
        body = r.json()
        assert "text" in body
        assert "generated_at" in body
        assert "cached" in body
        assert isinstance(body["text"], str)
        assert len(body["text"]) > 0

    def test_insight_cached_on_second_call(self, client):
        """Second call for same period should return cached=True."""
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.gte.return_value = q; q.lte.return_value = q
        q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        payload = {"start_date": "2026-05-01", "end_date": "2026-05-31"}
        r1 = c.post("/api/v1/insights", json=payload)
        assert r1.status_code == 200

        r2 = c.post("/api/v1/insights", json=payload)
        assert r2.status_code == 200
        assert r2.json()["cached"] is True

    def test_insight_missing_dates_returns_422(self, client):
        c, _ = client
        r = c.post("/api/v1/insights", json={"start_date": "2026-06-01"})
        assert r.status_code == 422


# ── Audit Log ────────────────────────────────────────────────
class TestAuditLog:
    def _make_entry(self, action="create", undone=False, **kwargs):
        base = {
            "id": TEST_LOG_ID, "user_id": TEST_USER_ID,
            "entity_type": "transaction", "entity_id": TEST_TXN_ID,
            "action": action, "old_values": None, "new_values": None,
            "undone": undone, "created_at": "2026-06-01T10:00:00",
        }
        base.update(kwargs)
        return base

    def test_list_audit_log_returns_structure(self, client):
        c, sb = client
        entry = self._make_entry()
        q = MagicMock()
        q.eq.return_value = q; q.order.return_value = q; q.limit.return_value = q
        q.select.return_value = q
        q.execute.return_value = MagicMock(data=[entry])
        sb.table.return_value = q

        r = c.get("/api/v1/audit-log")
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body
        assert "total" in body
        assert body["total"] == 1
        assert body["entries"][0]["action"] == "create"

    def test_list_audit_log_empty_returns_zero(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.order.return_value = q; q.limit.return_value = q
        q.select.return_value = q
        q.execute.return_value = MagicMock(data=[])
        sb.table.return_value = q

        r = c.get("/api/v1/audit-log")
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_undo_already_undone_returns_409(self, client):
        c, sb = client
        entry = self._make_entry(undone=True)
        q = MagicMock()
        q.eq.return_value = q; q.single.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=entry)
        sb.table.return_value = q

        r = c.post(f"/api/v1/audit-log/{TEST_LOG_ID}/undo")
        assert r.status_code == 409

    def test_undo_not_found_returns_404(self, client):
        c, sb = client
        q = MagicMock()
        q.eq.return_value = q; q.single.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=None)
        sb.table.return_value = q

        r = c.post(f"/api/v1/audit-log/{TEST_LOG_ID}/undo")
        assert r.status_code == 404

    def test_undo_non_transaction_entity_returns_400(self, client):
        c, sb = client
        entry = self._make_entry(entity_type="goal", undone=False)
        q = MagicMock()
        q.eq.return_value = q; q.single.return_value = q; q.select.return_value = q
        q.execute.return_value = MagicMock(data=entry)
        sb.table.return_value = q

        r = c.post(f"/api/v1/audit-log/{TEST_LOG_ID}/undo")
        assert r.status_code == 400
