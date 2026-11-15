"""P3 Parnavi: Events, Deals & Freebies (ARCHITECTURE.md §6, §7.3).

POST /flyers/scan          {image_url}
GET  /events/search        ?q=&from=&to=&category=&free=&freebie=
GET  /deals/search         ?q=&active=true
POST /events/{id}/save     {register?}
GET  /events/{id}/ics
GET  /rewards/progress
GET  /feed

Mock mode serves packages/shared/mocks/{flyers_scan,events_search,deals_search,...}.json.
Replace each `if settings.mock("events")` branch with the real logic; keep the shapes from types.ts.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock, not_built

router = APIRouter(tags=["events & deals (P3)"])
OWNER = "P3 Parnavi"


class FlyerScanRequest(BaseModel):
    image_url: str


class SaveEventRequest(BaseModel):
    # JSON field is "register"; renamed in Python because BaseModel has a .register attribute
    model_config = ConfigDict(populate_by_name=True)
    register_: bool = Field(False, alias="register")


@router.post("/flyers/scan")
async def scan_flyer(req: FlyerScanRequest, user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("events"):
        return load_mock("flyers_scan")
    raise not_built(OWNER)


@router.get("/events/search")
async def search_events(
    q: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    category: str | None = None,
    free: bool | None = None,
    freebie: bool | None = None,
    user_id: str = Depends(get_user_id),
) -> dict:
    if settings.mock("events"):
        events = load_mock("events_search")["events"]
        if q:
            events = [e for e in events if q.lower() in e["title"].lower() or q.lower() in (e["freebie_desc"] or "").lower()]
        if category:
            events = [e for e in events if e["category"] == category]
        if free is not None:
            events = [e for e in events if e["is_free"] == free]
        if freebie is not None:
            events = [e for e in events if e["has_freebie"] == freebie]
        return {"events": events}
    raise not_built(OWNER)


@router.get("/deals/search")
async def search_deals(q: str | None = None, active: bool = True, user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("events"):
        deals = load_mock("deals_search")["deals"]
        if q:
            deals = [d for d in deals if q.lower() in d["title"].lower()]
        return {"deals": deals}
    raise not_built(OWNER)


@router.post("/events/{event_id}/save")
async def save_event(event_id: str, req: SaveEventRequest | None = None, user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("events"):
        event = _mock_event(event_id)
        return {"saved": True, "ics_url": f"/api/events/{event_id}/ics", "register_url": event.get("register_url")}
    raise not_built(OWNER)


@router.get("/events/{event_id}/ics")
async def event_ics(event_id: str) -> Response:
    """Public (no auth) so calendar apps can open the link directly."""
    if settings.mock("events"):
        return Response(_ics(_mock_event(event_id)), media_type="text/calendar",
                        headers={"Content-Disposition": f'attachment; filename="{event_id}.ics"'})
    raise not_built(OWNER)


@router.get("/rewards/progress")
async def rewards_progress(user_id: str = Depends(get_user_id)) -> list:
    if settings.mock("events"):
        return load_mock("rewards_progress")
    raise not_built(OWNER)


@router.get("/feed")
async def feed(user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("events"):
        return load_mock("feed")
    raise not_built(OWNER)


def _mock_event(event_id: str) -> dict:
    for e in load_mock("events_search")["events"]:
        if e["id"] == event_id:
            return e
    raise HTTPException(404, detail={"code": "not_found", "message": "Event not found"})


def _ics_time(iso: str) -> str:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y%m%dT%H%M%SZ")


def _ics(e: dict) -> str:
    """Minimal RFC 5545 calendar file that Google / Apple Calendar accept."""
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TrojanHub//Events//EN", "BEGIN:VEVENT",
        f"UID:{e['id']}@trojanhub", f"DTSTAMP:{_ics_time(e['created_at'])}",
        f"DTSTART:{_ics_time(e['starts_at'])}",
    ]
    if e.get("ends_at"):
        lines.append(f"DTEND:{_ics_time(e['ends_at'])}")
    lines.append("SUMMARY:" + e["title"].replace(",", "\\,"))
    if e.get("location_text"):
        lines.append("LOCATION:" + e["location_text"].replace(",", "\\,"))
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
