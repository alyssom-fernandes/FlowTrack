"""Supabase em memória para os testes de autorização.

Diferente dos MagicMock dos outros testes, aqui os filtros (eq, in_, or_...)
filtram de verdade: dá para provar que um usuário não alcança os dados de outro.
Só cobre o pedaço da API do supabase-py que o backend usa.
"""
import copy
import uuid
from types import SimpleNamespace


_DEFAULTS = {
    "transactions": {"currency": "BRL", "is_recurring": False, "sync_status": "synced"},
    "goals": {"currency": "BRL", "current_amount": 0.0, "is_active": True},
}


class _Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db, self.table = db, table
        self.op, self.payload = "select", None
        self.filters: list = []
        self._limit: int | None = None
        self._single = False

    # operações
    def select(self, *_args, **_kwargs): self.op = "select"; return self
    def insert(self, data): self.op, self.payload = "insert", data; return self
    def upsert(self, data, **_kwargs): self.op, self.payload = "upsert", data; return self
    def update(self, data): self.op, self.payload = "update", data; return self
    def delete(self): self.op = "delete"; return self

    # filtros
    def eq(self, col, val): self.filters.append(lambda r: r.get(col) == val); return self
    def neq(self, col, val): self.filters.append(lambda r: r.get(col) != val); return self
    def in_(self, col, vals): self.filters.append(lambda r: r.get(col) in vals); return self
    def gte(self, col, val): self.filters.append(lambda r: r.get(col) is not None and r.get(col) >= val); return self
    def lte(self, col, val): self.filters.append(lambda r: r.get(col) is not None and r.get(col) <= val); return self
    def gt(self, col, val): self.filters.append(lambda r: r.get(col) is not None and r.get(col) > val); return self
    def lt(self, col, val): self.filters.append(lambda r: r.get(col) is not None and r.get(col) < val); return self

    @property
    def not_(self):
        """Negação no estilo do supabase-py: .not_.is_("col", "null"), .not_.eq(...)."""
        q = self

        class _Not:
            def is_(self, col, val):
                if val in (None, "null"):
                    q.filters.append(lambda r: r.get(col) is not None)
                else:
                    q.filters.append(lambda r: r.get(col) != val)
                return q

            def eq(self, col, val):
                q.filters.append(lambda r: r.get(col) != val)
                return q
        return _Not()

    def is_(self, col, val):
        target = None if val in (None, "null") else val
        self.filters.append(lambda r: r.get(col) is target if target is None else r.get(col) == target)
        return self

    def or_(self, expr: str):
        # Formatos usados pelo backend: "col.eq.valor", "col.is.null" e "and(...)", separados por vírgula
        def split(text):
            parts, depth, cur = [], 0, ""
            for ch in text:
                if ch == "," and depth == 0:
                    parts.append(cur); cur = ""
                    continue
                depth += ch == "("
                depth -= ch == ")"
                cur += ch
            return parts + [cur]

        def term(t):
            if t.startswith("and(") and t.endswith(")"):
                subs = [term(x) for x in split(t[4:-1])]
                return lambda r: all(f(r) for f in subs)
            col, op, val = t.split(".", 2)
            if op == "is":
                return lambda r: r.get(col) is None if val == "null" else r.get(col) == val
            v = {"true": True, "false": False}.get(val, val)
            return (lambda r: r.get(col) == v) if op == "eq" else (lambda r: r.get(col) != v)

        tests = [term(t) for t in split(expr)]
        self.filters.append(lambda r: any(f(r) for f in tests))
        return self

    def order(self, *_a, **_k): return self
    def range(self, *_a, **_k): return self
    def limit(self, n): self._limit = n; return self
    def single(self): self._single = True; return self

    def _rows(self):
        return [r for r in self.db.tables.setdefault(self.table, []) if all(f(r) for f in self.filters)]

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op in ("insert", "upsert"):
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            now = "2026-10-10T12:00:00+00:00"
            for item in items:
                # Valores padrão das colunas (como no schema.sql)
                row = {"id": str(uuid.uuid4()), "created_at": now, "updated_at": now,
                       **_DEFAULTS.get(self.table, {}), **copy.deepcopy(item)}
                rows.append(row)
                out.append(copy.deepcopy(row))
            return SimpleNamespace(data=out, count=len(out))
        matched = self._rows()
        if self.op == "update":
            for r in matched:
                r.update(copy.deepcopy(self.payload))
        elif self.op == "delete":
            self.db.tables[self.table] = [r for r in rows if r not in matched]
        out = [copy.deepcopy(r) for r in matched]
        if self._limit is not None:
            out = out[: self._limit]
        if self._single:
            if len(out) != 1:
                raise RuntimeError("single() sem exatamente uma linha")
            return SimpleNamespace(data=out[0], count=1)
        return SimpleNamespace(data=out, count=len(out))


class FakeSupabase:
    def __init__(self, tables: dict | None = None):
        self.tables: dict[str, list[dict]] = copy.deepcopy(tables or {})

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rows(self, name: str) -> list[dict]:
        return self.tables.get(name, [])
