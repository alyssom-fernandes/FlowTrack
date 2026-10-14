"""Regras de cálculo que a demonstração do navegador também aplica (frontend/src/demo/backend.ts).

Usa o banco em memória (fake_supabase) e uma data fixa: 13 de outubro de 2026,
ou outra quando o caso pede (janeiro, para a janela de dois meses).
"""
from contextlib import ExitStack, contextmanager
from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.fake_supabase import FakeSupabase

USER = "user-alice"
ACC = "acc-alice"


def fixed_date(y, m, d):
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(y, m, d)
    return FixedDate


@contextmanager
def api(tables, today=(2026, 10, 13)):
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.rate_limit import limiter
    db = FakeSupabase(tables)
    app.dependency_overrides[get_current_user_id] = lambda: USER
    limiter.enabled = False
    with ExitStack() as stack:
        stack.enter_context(patch("app.api.v1.analytics.get_supabase", return_value=db))
        stack.enter_context(patch("app.api.v1.analytics.date", fixed_date(*today)))
        stack.enter_context(patch("app.api.v1._helpers.date", fixed_date(*today)))
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, db
    limiter.enabled = True
    app.dependency_overrides.clear()


def tx(desc, amount, day, recurring=False, type_="debit", user=USER):
    return {"id": f"{desc}-{day}", "user_id": user, "account_id": ACC, "description": desc, "amount": amount,
            "transaction_date": day, "type": type_, "is_recurring": recurring, "category_id": None}


BASE = {"accounts": [{"id": ACC, "user_id": USER, "balance": 1000.0, "is_active": True}],
        "goals": [], "budgets": [], "categories": []}


class TestRecurringAlert:
    def test_only_after_the_usual_day(self):
        tables = {**BASE, "transactions": [
            tx("Salário", 6200, "2026-09-05", recurring=True, type_="credit"),   # dia 5 já passou: deveria ter caído
            tx("Alura", -99, "2026-09-20", recurring=True),                        # dia 20 ainda não chegou
            tx("Netflix", -44.9, "2026-09-12", recurring=True),                    # dia 12 + 2 de folga: ainda não
        ]}
        with api(tables) as (c, _):
            msgs = [a["message"] for a in c.get("/api/v1/alerts").json()["alerts"]]
        assert any("Salário" in m for m in msgs)
        assert not any("Alura" in m for m in msgs)
        assert not any("Netflix" in m for m in msgs)

    def test_no_alert_when_it_already_appeared(self):
        tables = {**BASE, "transactions": [
            tx("Salário", 6200, "2026-09-05", recurring=True, type_="credit"),
            tx("Salário", 6200, "2026-10-05", recurring=True, type_="credit"),
        ]}
        with api(tables) as (c, _):
            assert c.get("/api/v1/alerts").json()["alerts"] == []

    def test_money_in_brazilian_format(self):
        tables = {**BASE,
                  "categories": [{"id": "cat-1", "name": "Moradia", "user_id": None, "is_default": True}],
                  "budgets": [{"id": "b1", "user_id": USER, "category_id": "cat-1", "month": "2026-10", "limit_amount": 2250}],
                  "transactions": [{**tx("Aluguel", -2223.77, "2026-10-06"), "category_id": "cat-1"}]}
        with api(tables) as (c, _):
            msgs = [a["message"] for a in c.get("/api/v1/alerts").json()["alerts"]]
        assert "Orçamento “Moradia” acima do ritmo, faltam R$ 26,23" in msgs


def cat_tx(desc, amount, day, cat="cat-1", recurring=False):
    return {**tx(desc, amount, day, recurring=recurring), "category_id": cat}


class TestBudgetPaceAlert:
    """O alerta segue o mesmo estado da barra e da pílula (lib/pace.ts, budgetState)."""
    CATS = [{"id": "cat-1", "name": "Moradia", "user_id": None, "is_default": True},
            {"id": "cat-2", "name": "Lazer", "user_id": None, "is_default": True}]

    def tables(self, budgets, transactions):
        return {**BASE, "categories": self.CATS, "transactions": transactions,
                "budgets": [{"id": f"b{i}", "user_id": USER, "category_id": c, "month": "2026-10", "limit_amount": v}
                            for i, (c, v) in enumerate(budgets)]}

    def alerts(self, tables, today=(2026, 10, 14)):
        with api(tables, today=today) as (c, _):
            return [a for a in c.get("/api/v1/alerts").json()["alerts"] if a["category"] == "budget"]

    def test_fixed_bills_already_paid_do_not_alert(self):
        # Moradia em 99% depois do aluguel, do condomínio e da luz: "fixo · pago", sem aviso
        bills = [("Aluguel", -1650, 6), ("Condomínio", -380, 6), ("Enel Energia", -168, 12)]
        txs = [cat_tx(d, v, f"2026-09-{day:02d}", recurring=True) for d, v, day in bills]
        txs += [cat_tx("Aluguel", -1650, "2026-10-06", recurring=True), cat_tx("Condomínio", -380, "2026-10-06", recurring=True),
                cat_tx("Enel Energia", -193.77, "2026-10-12", recurring=True)]
        assert self.alerts(self.tables([("cat-1", 2250)], txs)) == []

    def test_variable_spending_ahead_of_pace_warns_with_subject(self):
        alerts = self.alerts(self.tables([("cat-2", 350)], [cat_tx("Cinema", -312.40, "2026-10-10", cat="cat-2")]))
        assert alerts == [{"type": "warning", "message": "Orçamento “Lazer” acima do ritmo, faltam R$ 37,60",
                           "category": "budget", "subject": "Lazer", "amount": 37.6}]

    def test_over_budget_is_danger_with_the_amount(self):
        alerts = self.alerts(self.tables([("cat-2", 350)], [cat_tx("Show", -374.67, "2026-10-10", cat="cat-2")]))
        assert [(a["type"], a["message"]) for a in alerts] == [("danger", "Orçamento “Lazer” estourado em R$ 24,67")]

    def test_seventy_percent_late_in_the_month_is_on_pace(self):
        # A regra antiga avisava a partir de 80% do limite, sem olhar o dia
        alerts = self.alerts(self.tables([("cat-2", 350)], [cat_tx("Cinema", -300, "2026-10-10", cat="cat-2")]), today=(2026, 10, 29))
        assert alerts == []


class TestGoalLimitAlert:
    def goal(self, target):
        return {"id": "g1", "user_id": USER, "name": "Delivery", "type": "spending_limit", "is_active": True,
                "target_amount": target, "period": "monthly", "category_id": None, "start_date": "2026-10-01", "end_date": None}

    def alerts(self, spent, today):
        tables = {**BASE, "goals": [self.goal(1000)], "transactions": [tx("iFood", -spent, "2026-10-02")]}
        with api(tables, today=today) as (c, _):
            return [a for a in c.get("/api/v1/alerts").json()["alerts"] if a["category"] == "goal"]

    def test_ahead_of_pace_warns(self):
        assert [a["message"] for a in self.alerts(500, (2026, 10, 13))] == ["Meta “Delivery” acima do ritmo, faltam R$ 500,00"]

    def test_same_spending_near_the_end_is_on_pace(self):
        assert self.alerts(800, (2026, 10, 29)) == []


class TestCashflowProjection:
    def test_transfers_between_own_accounts_are_not_events(self):
        tables = {**BASE, "transactions": [
            tx("Aluguel", -1650, "2026-09-20", recurring=True),
            tx("Transferência para Poupança", -1000, "2026-09-25", recurring=True, type_="transfer"),
            tx("Aporte na reserva", 1000, "2026-09-25", recurring=True, type_="transfer"),
        ]}
        with api(tables) as (c, _):
            days = c.get("/api/v1/cashflow/projection").json()["days"]
        descs = {e["description"] for d in days for e in d["events"]}
        assert "Aluguel" in descs
        assert not descs & {"Transferência para Poupança", "Aporte na reserva"}

    def test_lookback_is_two_months_in_january(self):
        # Antes, em janeiro e fevereiro a janela voltava até outubro
        tables = {**BASE, "transactions": [
            tx("Seguro", -300, "2025-11-15", recurring=True),    # dois meses antes: entra
            tx("Antigo", -50, "2025-10-15", recurring=True),     # três meses antes: fica fora
        ]}
        with api(tables, today=(2026, 1, 10)) as (c, _):
            days = c.get("/api/v1/cashflow/projection").json()["days"]
        descs = {e["description"] for d in days for e in d["events"]}
        assert "Seguro" in descs and "Antigo" not in descs


class TestProjections:
    def test_uses_twelve_months_of_history(self):
        months = [f"2025-{m:02d}" for m in range(11, 13)] + [f"2026-{m:02d}" for m in range(1, 11)]
        tables = {**BASE, "transactions": [tx(f"Salário {k}", 6000, f"{k}-05", type_="credit") for k in months]}
        with api(tables) as (c, _):
            body = c.get("/api/v1/projections").json()
        # 12 meses no histórico; o corrente (outubro, ainda parcial) fica fora da média
        assert len(body["history"]) == 12
        assert body["months_available"] == 11
