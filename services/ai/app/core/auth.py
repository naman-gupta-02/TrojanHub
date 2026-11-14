"""Auth dependency (owned by P4). Every endpoint gets the user id from here."""

from fastapi import Header, HTTPException

from app.core.config import settings

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


async def get_user_id(authorization: str | None = Header(default=None)) -> str:
    """Returns the caller's user id.

    TODO(P4): verify the Supabase JWT (`Authorization: Bearer <token>`) and return its `sub`.
    Until then, mock mode lets requests through as a demo user.
    """
    if settings.use_mocks:
        return DEMO_USER_ID
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "Missing token"})
    raise HTTPException(status_code=501, detail={"code": "not_implemented", "message": "JWT check not built yet"})
