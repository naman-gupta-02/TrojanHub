"""Auth dependencies (owned by P4). Every endpoint gets the caller's user id from here.

- Token sent + Supabase configured -> verified with Supabase Auth, returns the real user id.
- No token + USE_MOCKS=true        -> demo user, so screens work before login exists.
- Otherwise                        -> 401.
"""

from fastapi import Depends, Header, HTTPException

import httpx

from app.core.config import settings

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
ADMIN_ROLES = {"dept_admin", "usg_admin"}


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status_code=401, detail={"code": "unauthorized", "message": message})


async def _verify_with_supabase(token: str) -> str:
    """Ask Supabase Auth who this token belongs to (works with any JWT signing setup)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(503, detail={"code": "auth_unavailable", "message": str(e)}) from e
    if r.status_code != 200:
        raise _unauthorized("Invalid or expired token")
    return r.json()["id"]


async def get_user_id(authorization: str | None = Header(default=None)) -> str:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token and settings.supabase_url and settings.supabase_anon_key:
        return await _verify_with_supabase(token)
    if settings.use_mocks:
        return DEMO_USER_ID
    raise _unauthorized("Missing token")


async def require_admin(user_id: str = Depends(get_user_id)) -> str:
    """dept_admin / usg_admin only. Skipped in mock mode."""
    if settings.use_mocks:
        return user_id
    from app.core.supabase import get_supabase

    res = get_supabase().table("profiles").select("role").eq("id", user_id).maybe_single().execute()
    if not res or not res.data or res.data.get("role") not in ADMIN_ROLES:
        raise HTTPException(403, detail={"code": "forbidden", "message": "Admins only"})
    return user_id


async def require_cron_secret(x_cron_secret: str | None = Header(default=None)) -> None:
    """For /notify/* cron endpoints: header `X-Cron-Secret: <CRON_SECRET>`."""
    if settings.use_mocks and not settings.cron_secret:
        return
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(403, detail={"code": "forbidden", "message": "Bad cron secret"})
