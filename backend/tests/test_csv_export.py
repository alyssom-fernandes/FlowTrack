"""Exportação CSV: texto que começa com = + - @ tab ou CR não pode virar fórmula na planilha."""
import csv
import io

import pytest

from app.api.v1._helpers import csv_safe
from tests.test_review import api, base_tables, tx


class TestCsvSafe:
    @pytest.mark.parametrize("value", ["=HYPERLINK(\"http://exemplo.invalid\")", "+55 11", "-cmd", "@SUM(A1)", "\tTAB", "\rCR"])
    def test_formula_like_text_gets_an_apostrophe(self, value):
        assert csv_safe(value) == "'" + value

    @pytest.mark.parametrize("value", ["MERCADO EXEMPLO", "", "a=b", -50.0, 0.85, None, True])
    def test_other_values_are_kept(self, value):
        assert csv_safe(value) == value


class TestExportEndpoint:
    def test_description_and_notes_are_neutralized_and_amounts_stay_numbers(self):
        rows = [tx("t1", -50.0, description="=1+1", notes="@nota"),
                tx("t2", 120.0, description="SALARIO EXEMPLO", notes=None)]
        with api(base_tables(rows)) as (c, _):
            res = c.get("/api/v1/export/transactions")
        assert res.status_code == 200
        out = {r["id"]: r for r in csv.DictReader(io.StringIO(res.text))}
        assert out["t1"]["description"] == "'=1+1"
        assert out["t1"]["notes"] == "'@nota"
        assert out["t1"]["amount"] == "-50.0"
        assert out["t2"]["description"] == "SALARIO EXEMPLO"
