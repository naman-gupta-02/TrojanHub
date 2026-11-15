"""P3 Parnavi: Events, Deals & Freebies (ARCHITECTURE.md §6, §7.3).

POST   /flyers/upload            multipart {photo}            -> {image_url}
POST   /flyers/scan              {image_url}                  -> FlyerScanResponse (+ confidence, extra, duplicate)
GET    /events/search            ?q=&from=&to=&category=&free=&freebie=
GET    /events/{id}              -> {event, saved, registered, attended, counts_toward, google_calendar_url, can_edit}
POST   /events                   create (from a scanned flyer or the form); 409 if it's a duplicate, 422 if it ended
PATCH  /events/{id}              edit (only the poster, the org owner or an admin) -> {event}
DELETE /events/{id}              take it down (same people; status -> cancelled) -> {deleted}
POST   /events/{id}/save         {register?}
DELETE /events/{id}/save
GET    /events/{id}/ics
POST   /events/{id}/checkin      {code?}                      -> attendance + updated reward progress
GET    /events/{id}/checkin-code -> code for the QR on the event screen
GET    /me/events                -> my saved / registered events
GET    /deals/search             ?q=&active=true
POST   /deals                    create
POST   /deals/{id}/vote          {still_active}
GET    /rewards/progress         -> per program: attended, events that counted, completed_at, style
GET    /rewards/perks            -> ways to earn around USC (public)
GET    /rewards/checkins         -> every event I checked in to
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
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.auth import ADMIN_ROLES, DEMO_USER_ID, get_user_id, require_signed_in
from app.core.config import settings
from app.core.mocks import load_mock
from app.core.supabase import get_supabase
from app.events import categories, dedupe, feed as feed_builder, flyer, ics, perks, rewards, store
from app.events.dates import has_ended, iso, now_utc, parse_ts
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
    still_active: bool | None = True  # None = take my vote back


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

    @field_validator("register_url", "ticket_url")
    @classmethod
    def _add_scheme(cls, v: str | None) -> str | None:
        return _https(v)

    @field_validator("flyer_url")
    @classmethod
    def _flyer(cls, v: str | None) -> str | None:
        # a data: URL (photo straight from the phone) is uploaded to Storage in create_event
        if v and v.strip().startswith("data:image/"):
            return v.strip()
        return _https(v)


class EventUpdate(BaseModel):
    """Fix a mistake in a posted event. Only the fields sent are changed."""
    title: str | None = Field(None, min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location_text: str | None = Field(None, max_length=200)
    building_id: str | None = None
    category: Category | None = None
    is_free: bool | None = None
    has_freebie: bool | None = None
    freebie_desc: str | None = Field(None, max_length=200)
    register_url: str | None = None
    ticket_url: str | None = None
    tickets_open_at: datetime | None = None
    org_name: str | None = Field(None, max_length=120)

    @field_validator("register_url", "ticket_url")
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
    force: bool = False  # true = "post anyway" after a duplicate warning

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
    if not event or event.get("status") == "cancelled":  # deleted by its poster
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


def _is_organizer(event: dict, user_id: str) -> bool:
    if event.get("posted_by") and event["posted_by"] == user_id:
        return True
    if event.get("org_id"):
        org = store.get_org(event["org_id"])
        if org and org.get("owner_id") == user_id:
            return True
    profile = store.profile(user_id)
    return bool(profile and profile.get("role") in ADMIN_ROLES)


def _can_edit(event: dict, user_id: str) -> bool:
    """Real signed-in organizers only (seed events are "posted" by the signed-out demo user)."""
    return db_live() and user_id != DEMO_USER_ID and _is_organizer(event, user_id)


def _organizer_or_403(event: dict, user_id: str, action: str) -> None:
    if db_live() and not _can_edit(event, user_id):
        raise HTTPException(403, detail={"code": "forbidden", "message": f"Only the person who posted this event can {action} it"})


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
# Photo types we store. No SVG: the flyers bucket is public, and SVG can carry scripts.
_IMAGE_TYPES = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
                "image/heic": "heic", "image/heif": "heif", "image/gif": "gif"}


def _store_flyer(data: bytes, mime: str, user_id: str) -> str:
    """Bytes -> public URL in the `flyers` bucket."""
    if mime not in _IMAGE_TYPES:
        raise HTTPException(415, detail={"code": "not_an_image", "message": "Upload a JPG, PNG, WebP or HEIC photo of the flyer"})
    if len(data) > flyer.MAX_IMAGE_BYTES:
        raise HTTPException(413, detail={"code": "image_too_large", "message": "Flyer photo must be under 8 MB"})
    path = f"{user_id}/{uuid.uuid4().hex}.{_IMAGE_TYPES[mime]}"
    bucket = get_supabase().storage.from_("flyers")
    try:
        bucket.upload(path, data, {"content-type": mime})
    except Exception as e:
        raise HTTPException(502, detail={"code": "upload_failed", "message": "Couldn't save the flyer photo. Try again."}) from e
    return bucket.get_public_url(path).rstrip("?")


def _flyer_url_for_event(flyer_url: str | None, user_id: str) -> str | None:
    """What we keep in events.flyer_url: our own Storage URL, or nothing."""
    if not flyer_url:
        return None
    if flyer_url.startswith("data:image/"):
        header, _, data = flyer_url.partition(",")
        try:
            raw = base64.b64decode(data, validate=True)
        except ValueError:
            return None
        try:
            return _store_flyer(raw, header.removeprefix("data:").split(";")[0], user_id)
        except HTTPException:
            return None  # the event matters more than its picture
    storage_host = urlparse(settings.supabase_url).hostname
    return flyer_url if storage_host and urlparse(flyer_url).hostname == storage_host else None


@router.post("/flyers/upload")
async def upload_flyer(photo: UploadFile = File(...), user_id: str = Depends(require_signed_in)) -> dict:
    """Stores the photo in the public `flyers` bucket -> {image_url} for /flyers/scan and events.flyer_url.
    Server-side, so it works before login (Storage only lets signed-in users upload directly)."""
    data = await photo.read()
    mime = (photo.content_type or "image/jpeg").split(";")[0].lower()
    if not db_live():
        if not mime.startswith("image/"):
            raise HTTPException(415, detail={"code": "not_an_image", "message": "Upload a photo of the flyer"})
        return {"image_url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}
    return {"image_url": _store_flyer(data, mime, user_id)}


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
            events = [e for e in events if categories.matches(e, category)]
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
            {"program_id": p["program"]["id"], "name": p["program"]["name"], "attended": p["attended"],
             "required": p["required"], "style": p["style"]}
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
        "can_edit": _can_edit(event, user_id),
    }


@router.post("/events", status_code=201)
def create_event(req: EventCreate, user_id: str = Depends(require_signed_in)) -> dict:
    starts, ends = parse_ts(req.starts_at), parse_ts(req.ends_at)
    if ends and ends <= starts:
        raise HTTPException(422, detail={"code": "bad_dates", "message": "The end time must be after the start time"})
    if has_ended(starts, ends):
        raise HTTPException(422, detail={"code": "event_in_past",
                                         "message": "This event already ended. Only upcoming events can be posted."})
    if not db_live():
        return {"event": load_mock("events_search")["events"][0]}
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
    flyer_url = _flyer_url_for_event(req.flyer_url, user_id)
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
        "flyer_url": flyer_url,
        "status": "published",
    }
    return {"event": store.insert_event(row)}


@router.patch("/events/{event_id}")
def update_event(event_id: str, req: EventUpdate, user_id: str = Depends(require_signed_in)) -> dict:
    event = _event_or_404(event_id)
    _organizer_or_403(event, user_id, "edit")
    sent = req.model_dump(exclude_unset=True)
    if "title" in sent and not (sent["title"] or "").strip():
        raise HTTPException(422, detail={"code": "bad_title", "message": "The event needs a title"})

    fields: dict = {}
    for k in ("description", "location_text", "category", "is_free", "has_freebie", "freebie_desc",
              "register_url", "ticket_url"):
        if k in sent and not (k in ("category", "is_free", "has_freebie") and sent[k] is None):
            fields[k] = sent[k]
    if sent.get("title"):
        fields["title"] = sent["title"].strip()
    if "tickets_open_at" in sent:
        fields["tickets_open_at"] = iso(parse_ts(sent["tickets_open_at"]))

    if "starts_at" in sent or "ends_at" in sent:
        starts = parse_ts(sent.get("starts_at")) or parse_ts(event["starts_at"])
        ends = parse_ts(sent["ends_at"]) if "ends_at" in sent else parse_ts(event.get("ends_at"))
        if ends and ends <= starts:
            raise HTTPException(422, detail={"code": "bad_dates", "message": "The end time must be after the start time"})
        if has_ended(starts, ends):
            raise HTTPException(422, detail={"code": "event_in_past",
                                             "message": "That time has already passed. Pick an upcoming date."})
        fields["starts_at"], fields["ends_at"] = iso(starts), iso(ends)

    if fields.get("has_freebie") is False:
        fields["freebie_desc"] = None

    if not db_live():
        return {"event": {**event, **fields}}

    if "org_name" in sent:
        org = store.find_org(sent["org_name"])
        fields["org_id"] = org["id"] if org else None
    if sent.get("building_id") and store.is_uuid(sent["building_id"]):
        fields["building_id"] = sent["building_id"]
    elif "location_text" in sent or "building_id" in sent:
        fields["building_id"] = flyer.match_building(None, fields.get("location_text", event.get("location_text")),
                                                     store.buildings())
    if not fields:
        return {"event": event}
    return {"event": store.update_event(event_id, fields) or {**event, **fields}}


@router.delete("/events/{event_id}")
def delete_event(event_id: str, user_id: str = Depends(require_signed_in)) -> dict:
    """Takes the event down. It's marked cancelled (not erased), so saves and check-ins stay valid."""
    event = _event_or_404(event_id)
    _organizer_or_403(event, user_id, "delete")
    if db_live():
        store.update_event(event_id, {"status": "cancelled"})
    return {"deleted": True}


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
    """For the QR on the event screen: the poster, the owner of the hosting org, or an admin."""
    event = _event_or_404(event_id)
    if db_live() and not _is_organizer(event, user_id):
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
    starts, expires = parse_ts(req.starts_at), parse_ts(req.expires_at)
    if starts and expires and expires <= starts:
        raise HTTPException(422, detail={"code": "bad_dates", "message": "The deal must expire after it starts"})
    if expires and expires <= now_utc():
        raise HTTPException(422, detail={"code": "deal_expired",
                                         "message": "This deal already expired. Only current deals can be posted."})
    if not db_live():
        return {"deal": load_mock("deals_search")["deals"][0]}
    if not req.force:
        dup = dedupe.find_duplicate_deal(req.title)
        if dup:
            raise HTTPException(409, detail={
                "code": "duplicate",
                "message": f"Looks like \"{dup['title']}\" is already posted",
                "duplicate_of": dup["id"],
            })
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
        return {"still_active_votes": 4, "my_vote": req.still_active}
    deal = store.get_deal(deal_id)
    if not deal:
        raise _not_found("Deal")
    votes = deal["still_active_votes"]
    previous = _votes.pop((user_id, deal_id), None)
    if previous is not None:
        votes -= 1 if previous else -1  # undo the old vote
    if req.still_active is not None:  # None = just take the vote back ("unlike")
        votes += 1 if req.still_active else -1
        _votes[(user_id, deal_id)] = req.still_active
    return {"still_active_votes": store.set_deal_votes(deal_id, max(votes, 0)), "my_vote": req.still_active}


# ---------------------------------------------------------------------------
# Rewards + feed
# ---------------------------------------------------------------------------
@router.get("/rewards/progress")
def rewards_progress(user_id: str = Depends(get_user_id)) -> list:
    if not db_live():
        return load_mock("rewards_progress")
    return rewards.progress(user_id)


@router.get("/rewards/perks")
def rewards_perks() -> dict:
    """Ways to earn around USC (perks.py). Public: the same list for everyone, signed in or not."""
    return perks.perks()


@router.get("/rewards/checkins")
def my_checkins(user_id: str = Depends(get_user_id)) -> dict:
    """Every event I checked in to, newest first (the history behind my rewards)."""
    if not db_live():
        return {"checkins": []}
    checkins = store.attendance(user_id)
    events = {e["id"]: e for e in store.events_by_ids(checkins)}
    rows = [{"event": events[i], "checked_in_at": at} for i, at in checkins.items() if i in events]
    rows.sort(key=lambda r: r["checked_in_at"] or "", reverse=True)
    return {"checkins": rows}


@router.get("/feed")
def feed(user_id: str = Depends(get_user_id)) -> dict:
    if not db_live():
        return load_mock("feed")
    return feed_builder.build(user_id)
