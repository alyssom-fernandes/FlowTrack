"""Shared fixtures for integration tests."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

TEST_USER_ID    = "test-user-00000000-0000-0000-0000-000000000001"
TEST_ACCOUNT_ID = "test-acc-00000000-0000-0000-0000-000000000001"
TEST_CAT_ID     = "test-cat-00000000-0000-0000-0000-000000000001"
TEST_TXN_ID     = "test-txn-00000000-0000-0000-0000-000000000001"


def make_chainable_mock():
    """Returns a MagicMock where every chainable method returns itself."""
    q = MagicMock()
    for method in ("eq","neq","lt","gt","gte","lte","in_","or_","not_","is_",
                   "ilike","order","range","limit","single","contains","upsert"):
        getattr(q, method).return_value = q
    q.execute.return_value = MagicMock(data=[], count=0)
    return q


def make_supabase_mock():
    """Returns a pre-wired Supabase mock with chainable query API."""
    sb = MagicMock()
    q = make_chainable_mock()
    # Wire table() to return a mock that has .select/.insert/.update/.delete
    t = MagicMock()
    t.select.return_value = q
    t.insert.return_value = q
    t.update.return_value = q
    t.delete.return_value = q
    t.upsert.return_value = q
    sb.table.return_value = t
    return sb, q


@pytest.fixture
def sb():
    sb_mock, q_mock = make_supabase_mock()
    return sb_mock, q_mock


@pytest.fixture
def client(sb):
    sb_mock, _ = sb
    from app.main import app
    from app.core.security import get_current_user_id
    from app.core.database import get_supabase

    # Clear lru_cache so patch works
    get_supabase.cache_clear()

    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    with patch("app.core.database.get_supabase", return_value=sb_mock), \
         patch("app.api.v1.routers.get_supabase", return_value=sb_mock):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, sb_mock

    app.dependency_overrides.clear()
