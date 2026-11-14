"""Call the other features' endpoints exactly like their screens do (ARCHITECTURE.md §1.1).

Requests go through the same FastAPI app in-process (no network, no port config), with the
student's own Authorization header, so an item reported from chat and one reported from the
Lost & Found screen are identical.
"""

from __future__ import annotations

from typing import Any

import httpx


async def call(
    method: str,
    path: str,
    auth_header: str | None,
    *,
    json: Any = None,
    params: dict | None = None,
    data: dict | None = None,
    files: dict | None = None,
) -> Any:
    """Returns the JSON body, or {"error": {...}, "status": int} for non-2xx responses."""
    from app.main import app  # imported here to avoid a circular import

    headers = {"Authorization": auth_header} if auth_header else {}
    params = {k: v for k, v in (params or {}).items() if v is not None}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://trojanhub.internal", timeout=60) as client:
        r = await client.request(method, f"/api{path}", headers=headers, json=json, params=params, data=data, files=files)
    body = r.json() if "json" in r.headers.get("content-type", "") else r.text
    if r.status_code >= 400:
        err = body.get("error") if isinstance(body, dict) else {"code": f"http_{r.status_code}", "message": str(body)[:200]}
        return {"error": err, "status": r.status_code}
    return body


async def download(url: str) -> tuple[bytes, str] | None:
    """Fetch a photo the student uploaded (Supabase Storage URL) to forward as multipart."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.content, r.headers.get("content-type", "image/jpeg")
    except httpx.HTTPError:
        return None
