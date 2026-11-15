"""All Supabase reads and writes for complaints, in one place.

The other complaint modules (dedupe, routing, routes) call these functions and never touch the
client directly, so tests can swap this module for an in-memory fake.
"""

import time
from datetime import datetime, timedelta, timezone

from app.core.supabase import get_supabase

# Everything in `tickets` except the embedding, which never leaves the server.
TICKET_COLS = "id,building_id,room,department,category,urgency,summary,status,report_count,route_url,created_at"
DEDUPE_WINDOW_DAYS = 7  # same window as match_open_tickets() in the schema

_BUILDINGS_TTL_S = 600
_buildings: tuple[float, list[dict]] | None = None


# --- buildings -------------------------------------------------------------
def list_buildings() -> list[dict]:
    """[{id, code, name}], cached for 10 minutes (buildings rarely change)."""
    global _buildings
    if _buildings and time.monotonic() - _buildings[0] < _BUILDINGS_TTL_S:
        return _buildings[1]
    rows = get_supabase().table("buildings").select("id,code,name").order("code").execute().data or []
    _buildings = (time.monotonic(), rows)
    return rows


# --- tickets ---------------------------------------------------------------
def get_ticket(ticket_id: str) -> dict | None:
    rows = get_supabase().table("tickets").select(TICKET_COLS).eq("id", ticket_id).limit(1).execute().data
    return rows[0] if rows else None


def get_tickets(ticket_ids: list[str]) -> list[dict]:
    if not ticket_ids:
        return []
    return get_supabase().table("tickets").select(TICKET_COLS).in_("id", ticket_ids).execute().data or []


def similar_open_tickets(embedding: list[float], building_id: str, limit: int = 10) -> list[dict]:
    """Open tickets in one building from the last 7 days, most similar first: [{id, similarity, ...}]."""
    params = {"query_embedding": embedding, "match_building": building_id, "match_count": limit}
    return get_supabase().rpc("match_open_tickets", params).execute().data or []


def recent_open_tickets(building_id: str, category: str) -> list[dict]:
    """Open tickets with this building and category from the last 7 days, newest first."""
    since = (datetime.now(timezone.utc) - timedelta(days=DEDUPE_WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (
        get_supabase().table("tickets").select(TICKET_COLS)
        .eq("building_id", building_id).eq("category", category).neq("status", "resolved")
        .gte("created_at", since).order("created_at", desc=True).limit(20)
        .execute().data
        or []
    )


def insert_ticket(row: dict) -> dict:
    created = get_supabase().table("tickets").insert(row).execute().data[0]
    created.pop("embedding", None)
    return created


def add_report(ticket_id: str) -> dict | None:
    """report_count + 1. Returns the updated ticket, or None if it doesn't exist.

    Read-then-write, so two reports in the same instant can count as one. Good enough here;
    an atomic version needs a SQL function (a migration).
    """
    ticket = get_ticket(ticket_id)
    if not ticket:
        return None
    count = ticket["report_count"] + 1
    get_supabase().table("tickets").update({"report_count": count}).eq("id", ticket_id).execute()
    return {**ticket, "report_count": count}


# --- complaints ------------------------------------------------------------
def has_reported(ticket_id: str, reporter_id: str) -> bool:
    rows = (
        get_supabase().table("complaints").select("id")
        .eq("ticket_id", ticket_id).eq("reporter_id", reporter_id).limit(1)
        .execute().data
    )
    return bool(rows)


def insert_complaint(row: dict) -> dict:
    return get_supabase().table("complaints").insert(row).execute().data[0]


def complaints_for(reporter_id: str) -> list[dict]:
    """The user's complaints, newest first, each with its ticket under the "ticket" key."""
    return (
        get_supabase().table("complaints").select(f"*, ticket:tickets({TICKET_COLS})")
        .eq("reporter_id", reporter_id).order("created_at", desc=True).limit(100)
        .execute().data
        or []
    )


# --- routes ----------------------------------------------------------------
def routes_for(department: str) -> list[dict]:
    return get_supabase().table("routes").select("department,category,form_url,email").eq("department", department).execute().data or []


# --- admin dashboard -------------------------------------------------------
ADMIN_MAX_ROWS = 2000


def admin_complaints(since: str | None = None, complaint_id: str | None = None) -> list[dict]:
    """Complaints, newest first, each with its ticket ("ticket") and building code ("building")."""
    query = get_supabase().table("complaints").select(
        "*, ticket:tickets(status,urgency,report_count), building:buildings(code)"
    )
    if complaint_id:
        query = query.eq("id", complaint_id)
    if since:
        query = query.gte("created_at", since)
    return query.order("created_at", desc=True).limit(ADMIN_MAX_ROWS).execute().data or []


def update_complaint(complaint_id: str, fields: dict) -> None:
    get_supabase().table("complaints").update(fields).eq("id", complaint_id).execute()


def update_ticket_complaints(ticket_id: str, fields: dict) -> None:
    """Update every complaint grouped under one ticket."""
    get_supabase().table("complaints").update(fields).eq("ticket_id", ticket_id).execute()


def update_ticket(ticket_id: str, fields: dict) -> None:
    get_supabase().table("tickets").update(fields).eq("id", ticket_id).execute()


# ---------------------------------------------------------------------------
# Complaint photos (private bucket, see supabase/migrations/202611150200_p4_complaint_photos.sql)
# ---------------------------------------------------------------------------
PHOTO_BUCKET = "complaint-photos"
PHOTO_LINK_SECONDS = 3600


def upload_photo(path: str, data: bytes, mime: str) -> None:
    get_supabase().storage.from_(PHOTO_BUCKET).upload(path, data, {"content-type": mime, "upsert": "false"})


def delete_photo(path: str) -> None:
    get_supabase().storage.from_(PHOTO_BUCKET).remove([path])


def signed_photo_urls(paths: list[str]) -> dict[str, str]:
    """path -> signed link that works for an hour (for the admin dashboard)."""
    if not paths:
        return {}
    items = get_supabase().storage.from_(PHOTO_BUCKET).create_signed_urls(paths, PHOTO_LINK_SECONDS)
    return {i["path"]: i.get("signedUrl") or i.get("signedURL") for i in items if i.get("path") and (i.get("signedUrl") or i.get("signedURL"))}
