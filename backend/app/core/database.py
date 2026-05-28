from supabase import create_client, Client
from functools import lru_cache
from app.core.config import get_settings


@lru_cache()
def get_supabase() -> Client:
    """Returns Supabase client with anon key (for user-scoped operations)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache()
def get_supabase_admin() -> Client:
    """Returns Supabase client with service role key (for admin operations like demo reset)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
