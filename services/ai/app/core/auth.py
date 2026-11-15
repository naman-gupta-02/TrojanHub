"""Auth dependencies (owned by P4). Every endpoint gets the caller's user id from here.

- Token sent + Supabase configured -> verified with Supabase Auth, returns the real user id.
- No token + the feature is mocked -> demo user, so screens work before login exists.
- Otherwise                        -> 401. Real features (USE_MOCKS=false or REAL_FEATURES)
                                      always need a signed-in student.
"""

from fastapi import Depends, Header, HTTPException, Request

import httpx

from app.core.config import settings

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
ADMIN_ROLES = {"dept_admin", "usg_admin"}


# URL prefix -> feature name used by settings.mock()
_FEATURES = (
    ("/api/chat", "chat"),
    ("/api/items", "lostfound"),
    ("/api/flyers", "events"), ("/api/events", "events"), ("/api/deals", "events"),
    ("/api/rewards", "events"), ("/api/feed", "events"),
    ("/api/notify", "notify"), ("/api/me/notify", "notify"),
    ("/api/me/events", "events"),
    ("/api/complaints", "complaints"), ("/api/tickets", "complaints"),
    ("/api/admin", "admin"),
)


def feature_of(path: str) -> str:
    return next((name for prefix, name in _FEATURES if path.startswith(prefix)), "")


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


async def get_user_id(request: Request, authorization: str | None = Header(default=None)) -> str:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token and settings.supabase_url and settings.supabase_anon_key:
        return await _verify_with_supabase(token)
    if settings.mock(feature_of(request.url.path)):
        return DEMO_USER_ID
    raise _unauthorized("Sign in with your @usc.edu email to do this.")


async def require_admin(user_id: str = Depends(get_user_id)) -> str:
    """dept_admin / usg_admin only. Skipped while the admin feature is mocked.

    The signed-out fallback (DEMO_USER_ID) is never an admin for real admin features, even if
    seed data gave the demo profile an admin role: otherwise any visitor could use admin-only
    actions such as sending the digest email to any address."""
    if settings.mock("admin"):
        return user_id
    if user_id == DEMO_USER_ID:
        raise _unauthorized("Sign in with an admin account to do this.")
    from app.core.supabase import get_supabase

    res = get_supabase().table("profiles").select("role").eq("id", user_id).maybe_single().execute()
    if not res or not res.data or res.data.get("role") not in ADMIN_ROLES:
        raise HTTPException(403, detail={"code": "forbidden", "message": "Admins only"})
    return user_id


async def require_cron_secret(x_cron_secret: str | None = Header(default=None)) -> None:
    """For /notify/* cron endpoints: header `X-Cron-Secret: <CRON_SECRET>`."""
    if settings.mock("notify") and not settings.cron_secret:
        return
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(403, detail={"code": "forbidden", "message": "Bad cron secret"})
