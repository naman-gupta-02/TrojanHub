"""Server-side Supabase client (service role key: bypasses RLS, never leaves the server)."""

from functools import lru_cache

from app.core.config import settings


@lru_cache
def get_supabase():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (see .env.example)")
    from supabase import create_client  # imported lazily so mock mode works without it

    return create_client(settings.supabase_url, settings.supabase_service_role_key)
