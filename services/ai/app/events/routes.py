"""P3 Parnavi: Events, Deals & Freebies (ARCHITECTURE.md §6, §7.3).

POST   /flyers/upload            multipart {photo}            -> {image_url}
POST   /flyers/scan              {image_url}                  -> FlyerScanResponse (+ confidence, extra, duplicate)
GET    /events/search            ?q=&from=&to=&category=&free=&freebie=
GET    /events/{id}              -> {event, saved, registered, attended, counts_toward, google_calendar_url}
POST   /events                   create (from a scanned flyer or the form); 409 if it's a duplicate
POST   /events/{id}/save         {register?}
DELETE /events/{id}/save
GET    /events/{id}/ics
POST   /events/{id}/checkin      {code?}                      -> attendance + updated reward progress
GET    /events/{id}/checkin-code -> code for the QR on the event screen
GET    /me/events                -> my saved / registered events
GET    /deals/search             ?q=&active=true
POST   /deals                    create
POST   /deals/{id}/vote          {still_active}
GET    /rewards/progress
GET    /feed

Real data whenever Supabase is configured (see settings.py); otherwise the mocks in
packages/shared/mocks/, so teammates without keys still get working screens.
"""

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.auth import get_user_id, require_signed_in
from app.core.mocks import load_mock
from app.core.supabase import get_supabase
from app.events import dedupe, feed as feed_builder, flyer, ics, rewards, store
from app.events.dates import iso, now_utc, parse_ts
from app.events.settings import db_live, llm_live, signing_secret

router = APIRouter(tags=["events & deals (P3)"])
OWNER = "P3 Parnavi"

Category = Literal["cultural", "career", "free_food", "sports", "social", "academic", "other"]


class FlyerScanRequest(BaseModel):
    image_url: str


class SaveEventRequest(BaseModel):
    # JSON field is "register"; renamed in Python because BaseModel has a .register attribute
    model_config = ConfigDict(populate_by_name=True)
    register_: bool = Field(False, alias="register")


class CheckinRequest(BaseModel):
    code: str | None = None


class DealVoteRequest(BaseModel):
    still_active: bool = True


def _https(v: str | None) -> str | None:
    if not v or not v.strip():
        return None
    v = v.strip()
    return v if v.lower().startswith(("http://", "https://")) else f"https://{v}"


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    starts_at: datetime
    ends_at: datetime | None = None
    location_text: str | None = Field(None, max_length=200)
    building_id: str | None = None
    category: Category = "other"
    is_free: bool = True
    has_freebie: bool = False
    freebie_desc: str | None = Field(None, max_length=200)
    register_url: str | None = None
    ticket_url: str | None = None
    tickets_open_at: datetime | None = None
    org_name: str | None = Field(None, max_length=120)
    flyer_url: str | None = None
    force: bool = False  # true = "post anyway" after a duplicate warning

    @field_validator("register_url", "ticket_url", "flyer_url")
    @classmethod
    def _add_scheme(cls, v: str | None) -> str | None:
        return _https(v)


class DealCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    kind: Literal["ongoing", "one_time"]
    how_to_claim: str | None = Field(None, max_length=300)
    link: str | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    @field_validator("link")
    @classmethod
    def _add_scheme(cls, v: str | None) -> str | None:
        return _https(v)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _not_found(what: str = "Event") -> HTTPException:
    return HTTPException(404, detail={"code": "not_found", "message": f"{what} not found"})


def _event_or_404(event_id: str) -> dict:
    if not db_live():
        return _mock_event(event_id)
    event = store.get_event(event_id)
    if not event:
        raise _not_found()
    return event


def _needs_profile(e: Exception) -> Exception:
    """Writes that reference profiles fail (FK 23503) for users who haven't signed in yet."""
    if "23503" in str(e):
        return HTTPException(401, detail={"code": "sign_in_required", "message": "Sign in with your @usc.edu email first"})
    return e


def _mock_event(event_id: str) -> dict:
    for e in load_mock("events_search")["events"]:
        if e["id"] == event_id:
            return e
    raise _not_found()


def checkin_code(event_id: str) -> str:
    return hmac.new(signing_secret(), f"checkin:{event_id}".encode(), hashlib.sha256).hexdigest()[:8].upper()


def _in_checkin_window(e: dict) -> bool:
    start = parse_ts(e["starts_at"])
    end = parse_ts(e["ends_at"]) or start + timedelta(hours=2)
    now = now_utc()
    return start - timedelta(minutes=30) <= now <= end + timedelta(minutes=30)


# ---------------------------------------------------------------------------
# Flyers
# ---------------------------------------------------------------------------
@router.post("/flyers/upload")
async def upload_flyer(photo: UploadFile = File(...), user_id: str = Depends(require_signed_in)) -> dict:
    """Stores the photo in the public `flyers` bucket -> {image_url} for /flyers/scan and events.flyer_url.
    Server-side, so it works before login (Storage only lets signed-in users upload directly)."""
    data = await photo.read()
    mime = (photo.content_type or "image/jpeg").split(";")[0]
    if not mime.startswith("image/"):
        raise HTTPException(415, detail={"code": "not_an_image", "message": "Upload a photo of the flyer"})
    if len(data) > flyer.MAX_IMAGE_BYTES:
        raise HTTPException(413, detail={"code": "image_too_large", "message": "Flyer photo must be under 8 MB"})
    if not db_live():
        return {"image_url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}
    path = f"{user_id}/{uuid.uuid4().hex}.{mime.split('/')[1].replace('jpeg', 'jpg')}"
    bucket = get_supabase().storage.from_("flyers")
    bucket.upload(path, data, {"content-type": mime})
    return {"image_url": bucket.get_public_url(path).rstrip("?")}


@router.post("/flyers/scan")
def scan_flyer(req: FlyerScanRequest, user_id: str = Depends(require_signed_in)) -> dict:
    if not llm_live():
        return load_mock("flyers_scan")
    return flyer.scan(req.image_url)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
@router.get("/events/search")
def search_events(
    q: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    category: str | None = None,
    free: bool | None = None,
    freebie: bool | None = None,
    user_id: str = Depends(get_user_id),
) -> dict:
    if not db_live():
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
    try:
        start, end = parse_ts(from_), parse_ts(to)
    except ValueError as e:
        raise HTTPException(422, detail={"code": "bad_date", "message": "from/to must be ISO dates"}) from e
    return {"events": store.search_events(q, start, end, category, free, freebie)}


@router.get("/me/events")
def my_events(user_id: str = Depends(get_user_id)) -> dict:
    """Upcoming events I saved or registered for, soonest first."""
    if not db_live():
        return {"saved": [{"event": e, "registered": False, "attended": False} for e in load_mock("events_search")["events"][:1]]}
    saves = store.saves_for_user(user_id)
    attended = store.attended_ids(user_id)
    cutoff = now_utc() - timedelta(hours=3)
    events = [e for e in store.events_by_ids(saves) if parse_ts(e["starts_at"]) > cutoff]
    return {"saved": [{"event": e, "registered": saves[e["id"]], "attended": e["id"] in attended} for e in events]}


@router.get("/events/{event_id}")
def get_event(event_id: str, user_id: str = Depends(get_user_id)) -> dict:
    event = _event_or_404(event_id)
    saved, attended, counts_toward = {}, set(), []
    if db_live():
        saved = store.saves_for_user(user_id)
        attended = store.attended_ids(user_id)
        programs = [(p, ids) for p, ids in store.reward_programs() if event_id in ids]
        counts_toward = [
            {"program_id": p["program"]["id"], "name": p["program"]["name"], "attended": p["attended"], "required": p["required"]}
            for p in rewards.progress(user_id, programs=programs, attended=attended)
        ]
    return {
        "event": event,
        "saved": event_id in saved,
        "registered": saved.get(event_id, False),
        "attended": event_id in attended,
        "counts_toward": counts_toward,
        "google_calendar_url": ics.google_calendar_url(event),
        "ics_url": f"/api/events/{event_id}/ics",
    }


@router.post("/events", status_code=201)
def create_event(req: EventCreate, user_id: str = Depends(require_signed_in)) -> dict:
    if not db_live():
        return {"event": load_mock("events_search")["events"][0]}
    starts, ends = parse_ts(req.starts_at), parse_ts(req.ends_at)
    if ends and ends <= starts:
        raise HTTPException(422, detail={"code": "bad_dates", "message": "The end time must be after the start time"})
    if not req.force:
        dup = dedupe.find_duplicate(req.title, starts, req.location_text)
        if dup:
            raise HTTPException(409, detail={
                "code": "duplicate",
                "message": f"Looks like \"{dup['title']}\" is already posted",
                "duplicate_of": dup["id"],
            })

    org = store.find_org(req.org_name)
    poster = store.profile(user_id)
    # "org" (verified badge) only when the poster owns that verified org
    if org and org["verified"] and poster and org["owner_id"] == user_id:
        source = "org"
    else:
        source = "flyer" if req.flyer_url else "community"
    building_id = req.building_id if req.building_id and store.is_uuid(req.building_id) else None
    if not building_id:
        building_id = flyer.match_building(None, req.location_text, store.buildings())

    row = {
        "title": req.title.strip(),
        "description": req.description,
        "starts_at": iso(starts),
        "ends_at": iso(ends),
        "location_text": req.location_text,
        "building_id": building_id,
        "category": req.category,
        "is_free": req.is_free,
        "has_freebie": req.has_freebie,
        "freebie_desc": req.freebie_desc if req.has_freebie else None,
        "register_url": req.register_url,
        "ticket_url": req.ticket_url,
        "tickets_open_at": iso(parse_ts(req.tickets_open_at)),
        "org_id": org["id"] if org else None,
        "posted_by": user_id if poster else None,
        "source": source,
        "flyer_url": req.flyer_url,
        "status": "published",
    }
    return {"event": store.insert_event(row)}


@router.post("/events/{event_id}/save")
def save_event(event_id: str, req: SaveEventRequest | None = None, user_id: str = Depends(require_signed_in)) -> dict:
    event = _event_or_404(event_id)
    if db_live():
        try:
            store.save_event(user_id, event_id, registered=bool(req and req.register_))
        except Exception as e:
            raise _needs_profile(e) from e
    return {"saved": True, "ics_url": f"/api/events/{event_id}/ics", "register_url": event.get("register_url")}


@router.delete("/events/{event_id}/save")
def unsave_event(event_id: str, user_id: str = Depends(require_signed_in)) -> dict:
    _event_or_404(event_id)
    if db_live():
        store.unsave_event(user_id, event_id)
    return {"saved": False}


@router.get("/events/{event_id}/ics")
def event_ics(event_id: str) -> Response:
    """Public (no auth) so calendar apps can open the link directly."""
    event = _event_or_404(event_id)
    return Response(ics.ics(event), media_type="text/calendar",
                    headers={"Content-Disposition": f'attachment; filename="trojanhub-{event_id[:8]}.ics"'})


@router.get("/events/{event_id}/checkin-code")
def get_checkin_code(event_id: str, user_id: str = Depends(get_user_id)) -> dict:
    """For the QR on the event screen. Only the poster can see it once real login is on."""
    event = _event_or_404(event_id)
    if db_live() and event.get("posted_by") and event["posted_by"] != user_id and store.profile(user_id):
        raise HTTPException(403, detail={"code": "forbidden", "message": "Only the organizer can show the check-in code"})
    return {"code": checkin_code(event_id), "checkin_url": f"trojanhub://checkin/{event_id}?code={checkin_code(event_id)}"}


@router.post("/events/{event_id}/checkin")
def check_in(event_id: str, req: CheckinRequest | None = None, user_id: str = Depends(require_signed_in)) -> dict:
    """Valid with the organizer's QR code, or by tapping "I'm here" while the event is on."""
    event = _event_or_404(event_id)
    code_ok = bool(req and req.code) and hmac.compare_digest(req.code.strip().upper(), checkin_code(event_id))
    if not code_ok and not _in_checkin_window(event):
        raise HTTPException(403, detail={
            "code": "checkin_closed",
            "message": "Check-in opens 30 minutes before the event. Scan the organizer's QR code to check in.",
        })
    if not db_live():
        return {"checked_in": True, "already": False, "rewards": load_mock("rewards_progress")}
    try:
        new = store.check_in(user_id, event_id)
    except Exception as e:
        raise _needs_profile(e) from e
    affected = {p["id"] for p in rewards.programs_for_event(event_id)}
    progress = [p for p in rewards.progress(user_id) if p["program"]["id"] in affected]
    return {"checked_in": True, "already": not new, "rewards": progress}


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------
@router.get("/deals/search")
def search_deals(q: str | None = None, active: bool = True, user_id: str = Depends(get_user_id)) -> dict:
    if not db_live():
        deals = load_mock("deals_search")["deals"]
        if q:
            deals = [d for d in deals if q.lower() in d["title"].lower()]
        return {"deals": deals}
    return {"deals": store.search_deals(q, active)}


@router.post("/deals", status_code=201)
def create_deal(req: DealCreate, user_id: str = Depends(require_signed_in)) -> dict:
    if not db_live():
        return {"deal": load_mock("deals_search")["deals"][0]}
    starts, expires = parse_ts(req.starts_at), parse_ts(req.expires_at)
    if starts and expires and expires <= starts:
        raise HTTPException(422, detail={"code": "bad_dates", "message": "The deal must expire after it starts"})
    row = {
        "title": req.title.strip(),
        "description": req.description,
        "kind": req.kind,
        "how_to_claim": req.how_to_claim,
        "link": req.link,
        "starts_at": iso(starts),
        "expires_at": iso(expires),
        "posted_by": user_id if store.profile(user_id) else None,
    }
    return {"deal": store.insert_deal(row)}


# one vote per user per deal while the server runs (good enough for the demo, no extra table)
_votes: dict[tuple[str, str], bool] = {}


@router.post("/deals/{deal_id}/vote")
def vote_deal(deal_id: str, req: DealVoteRequest, user_id: str = Depends(require_signed_in)) -> dict:
    if not db_live():
        return {"still_active_votes": 4}
    deal = store.get_deal(deal_id)
    if not deal:
        raise _not_found("Deal")
    votes = deal["still_active_votes"]
    previous = _votes.get((user_id, deal_id))
    if previous is not None:
        votes -= 1 if previous else -1  # undo the old vote
    votes += 1 if req.still_active else -1
    _votes[(user_id, deal_id)] = req.still_active
    return {"still_active_votes": store.set_deal_votes(deal_id, max(votes, 0))}


# ---------------------------------------------------------------------------
# Rewards + feed
# ---------------------------------------------------------------------------
@router.get("/rewards/progress")
def rewards_progress(user_id: str = Depends(get_user_id)) -> list:
    if not db_live():
        return load_mock("rewards_progress")
    return rewards.progress(user_id)


@router.get("/feed")
def feed(user_id: str = Depends(get_user_id)) -> dict:
    if not db_live():
        return load_mock("feed")
    return feed_builder.build(user_id)
