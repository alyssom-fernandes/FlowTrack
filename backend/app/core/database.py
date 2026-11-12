from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Returns Supabase client with service role key. JWT validation + explicit user_id
    filtering in routers handles auth; service role bypasses RLS for backend operations."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def get_supabase_admin() -> Client:
    """Returns Supabase client with service role key (for admin operations like demo reset)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
