"""Tests for pure helper functions in routers.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import date
from unittest.mock import MagicMock

from app.api.v1._helpers import (
    normalize_desc,
    dedup_hash,
    calc_progress,
    calc_profitability,
    _goal_period_range,
    _calc_goal_current,
    _parse_ofx,
)


# ── normalize_desc ────────────────────────────────────────────
class TestNormalizeDesc:
    def test_uppercases(self):
        assert normalize_desc("supermercado abc") == "SUPERMERCADO ABC"

    def test_strips_special_chars(self):
        assert normalize_desc("Pag*Nubank!@#") == "PAGNUBANK"

    def test_collapses_spaces(self):
        assert normalize_desc("  compra   online  ") == "COMPRA ONLINE"

    def test_truncates_at_100(self):
        long = "A" * 200
        assert len(normalize_desc(long)) == 100

    def test_empty(self):
        assert normalize_desc("") == ""


# ── dedup_hash ────────────────────────────────────────────────
class TestDedupHash:
    def test_returns_64_char_hex(self):
        h = dedup_hash("acc1", date(2024, 1, 15), -50.0, "MERCADO")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_same_inputs_same_hash(self):
        h1 = dedup_hash("acc1", date(2024, 1, 15), -50.0, "MERCADO")
        h2 = dedup_hash("acc1", date(2024, 1, 15), -50.0, "MERCADO")
        assert h1 == h2

    def test_different_inputs_different_hash(self):
        h1 = dedup_hash("acc1", date(2024, 1, 15), -50.0, "MERCADO")
        h2 = dedup_hash("acc1", date(2024, 1, 15), -60.0, "MERCADO")
        assert h1 != h2

    def test_amount_precision(self):
        h1 = dedup_hash("acc1", date(2024, 1, 1), -50.0, "DESC")
        h2 = dedup_hash("acc1", date(2024, 1, 1), -50.001, "DESC")
        # Both round to -50.00 so should be equal
        assert h1 == h2


# ── calc_progress ─────────────────────────────────────────────
class TestCalcProgress:
    def test_half(self):
        assert calc_progress(50.0, 100.0) == 50.0

    def test_zero_current(self):
        assert calc_progress(0.0, 100.0) == 0.0

    def test_exceeds_target_capped_at_100(self):
        assert calc_progress(150.0, 100.0) == 100.0

    def test_zero_target(self):
        assert calc_progress(50.0, 0.0) == 0.0

    def test_full(self):
        assert calc_progress(100.0, 100.0) == 100.0

    def test_rounding(self):
        # 1/3 ≈ 33.33
        assert calc_progress(100.0, 300.0) == 33.33


# ── calc_profitability ────────────────────────────────────────
class TestCalcProfitability:
    def test_profit(self):
        profit, pct = calc_profitability(1000.0, 1200.0)
        assert profit == 200.0
        assert pct == 20.0

    def test_loss(self):
        profit, pct = calc_profitability(1000.0, 800.0)
        assert profit == -200.0
        assert pct == -20.0

    def test_zero_invested(self):
        profit, pct = calc_profitability(0.0, 500.0)
        assert profit == 500.0
        assert pct == 0.0

    def test_breakeven(self):
        profit, pct = calc_profitability(500.0, 500.0)
        assert profit == 0.0
        assert pct == 0.0


# ── _goal_period_range ────────────────────────────────────────
class TestGoalPeriodRange:
    def test_monthly_returns_current_month(self):
        today = date.today()
        start, end = _goal_period_range({"period": "monthly"})
        assert start == date(today.year, today.month, 1).isoformat()
        # end should be last day of current month
        assert end >= start
        assert end[:7] == start[:7]  # same year-month

    def test_yearly_returns_current_year(self):
        today = date.today()
        start, end = _goal_period_range({"period": "yearly"})
        assert start == f"{today.year}-01-01"
        assert end == f"{today.year}-12-31"

    def test_custom_uses_goal_dates(self):
        goal = {
            "period": "custom",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        }
        start, end = _goal_period_range(goal)
        assert start == "2024-01-01"
        assert end == "2024-03-31"

    def test_default_period_is_monthly(self):
        today = date.today()
        start, _ = _goal_period_range({})
        assert start == date(today.year, today.month, 1).isoformat()


# ── _calc_goal_current ────────────────────────────────────────
class TestCalcGoalCurrent:
    def _make_sb(self, amounts: list[float]) -> MagicMock:
        sb = MagicMock()
        q = sb.table.return_value.select.return_value
        q.eq.return_value = q
        q.gte.return_value = q
        q.lte.return_value = q
        q.execute.return_value.data = [{"amount": a} for a in amounts]
        return sb

    def test_spending_limit_sums_debits(self):
        sb = self._make_sb([-100.0, -50.0, 200.0])
        goal = {"period": "monthly", "type": "spending_limit"}
        result = _calc_goal_current(sb, "user1", goal)
        assert result == 150.0

    def test_savings_target_sums_credits(self):
        sb = self._make_sb([-100.0, 200.0, 300.0])
        goal = {"period": "monthly", "type": "savings_target"}
        result = _calc_goal_current(sb, "user1", goal)
        assert result == 500.0

    def test_no_transactions(self):
        sb = self._make_sb([])
        goal = {"period": "monthly", "type": "spending_limit"}
        assert _calc_goal_current(sb, "user1", goal) == 0.0

    def test_only_credits_for_spending_limit(self):
        sb = self._make_sb([100.0, 200.0])
        goal = {"period": "monthly", "type": "spending_limit"}
        assert _calc_goal_current(sb, "user1", goal) == 0.0

    def test_category_filter_applied(self):
        sb = self._make_sb([-50.0])
        goal = {"period": "monthly", "type": "spending_limit", "category_id": "cat-1"}
        _calc_goal_current(sb, "user1", goal)
        # verify .eq was called with category_id
        calls = str(sb.mock_calls)
        assert "cat-1" in calls


# ── _parse_ofx ────────────────────────────────────────────────
OFX_WITH_CLOSE_TAGS = b"""
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20241201000000
<TRNAMT>-150.50
<FITID>001
<MEMO>SUPERMERCADO ABC
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20241215
<TRNAMT>3500.00
<FITID>002
<NAME>SALARIO EMPRESA XYZ
</STMTTRN>
</BANKTRANLIST>
</OFX>
"""

OFX_SGML_NO_CLOSE = b"""
OFXHEADER:100
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20241110
<TRNAMT>-75.00
<MEMO>FARMACIA
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20241120
<TRNAMT>-200.00
<MEMO>RESTAURANTE
</BANKTRANLIST>
"""

OFX_ZERO_AMOUNT = b"""
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20241201
<TRNAMT>0.00
<MEMO>ESTORNO
</STMTTRN>
</BANKTRANLIST>
"""

OFX_LATIN1 = "OFXHEADER:100\n<BANKTRANLIST>\n<STMTTRN>\n<DTPOSTED>20241201\n<TRNAMT>-99.90\n<MEMO>Café São João\n</STMTTRN>\n</BANKTRANLIST>".encode("latin-1")


class TestParseOfx:
    def test_parses_debit_transaction(self):
        txns = _parse_ofx(OFX_WITH_CLOSE_TAGS)
        debit = next(t for t in txns if t["amount"] < 0)
        assert debit["amount"] == -150.50
        assert debit["type"] == "debit"
        assert debit["transaction_date"] == "2024-12-01"
        assert "SUPERMERCADO" in debit["description"]

    def test_parses_credit_transaction(self):
        txns = _parse_ofx(OFX_WITH_CLOSE_TAGS)
        credit = next(t for t in txns if t["amount"] > 0)
        assert credit["amount"] == 3500.00
        assert credit["type"] == "credit"
        assert "SALARIO" in credit["description"]

    def test_two_transactions_parsed(self):
        txns = _parse_ofx(OFX_WITH_CLOSE_TAGS)
        assert len(txns) == 2

    def test_sgml_no_close_tags(self):
        txns = _parse_ofx(OFX_SGML_NO_CLOSE)
        assert len(txns) >= 1
        assert any(t["description"] == "FARMACIA" for t in txns)

    def test_skips_zero_amount(self):
        txns = _parse_ofx(OFX_ZERO_AMOUNT)
        assert len(txns) == 0

    def test_empty_content(self):
        assert _parse_ofx(b"") == []

    def test_latin1_encoding(self):
        txns = _parse_ofx(OFX_LATIN1)
        assert len(txns) == 1
        assert txns[0]["amount"] == -99.90

    def test_date_formats(self):
        # YYYYMMDD (8 digits) and YYYYMMDDHHMMSS (14 digits) both work
        txns = _parse_ofx(OFX_WITH_CLOSE_TAGS)
        dates = {t["transaction_date"] for t in txns}
        assert "2024-12-01" in dates
        assert "2024-12-15" in dates

    def test_description_truncated_at_200(self):
        long_memo = "X" * 300
        content = f"<BANKTRANLIST><STMTTRN><DTPOSTED>20241201<TRNAMT>-10.00<MEMO>{long_memo}</STMTTRN></BANKTRANLIST>".encode()
        txns = _parse_ofx(content)
        assert len(txns[0]["description"]) <= 200

    def test_falls_back_to_trntype_when_no_memo(self):
        content = b"<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20241201<TRNAMT>-20.00</STMTTRN></BANKTRANLIST>"
        txns = _parse_ofx(content)
        assert txns[0]["description"] == "DEBIT"
