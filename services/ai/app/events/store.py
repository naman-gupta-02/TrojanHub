"""Data access for events, deals, saves, attendance and rewards (Supabase, service role).

Every query lives here so routes, feed, rewards and notify share one version of "upcoming",
"active deal", etc. Rows come back as plain dicts shaped like packages/shared/types.ts, plus
`org_name` / `org_verified` on events (for the verified badge).
"""

import re
import time
import uuid
from datetime import datetime, timedelta

from app.core.supabase import get_supabase
from app.events import categories
from app.events.dates import has_ended, iso, la_day_bounds, la_today, now_utc, parse_ts

EVENT_SELECT = "*, orgs(name, verified)"
_TWO_HOURS = timedelta(hours=2)


def is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def clean_query(q: str | None) -> str:
    """Keep words only: PostgREST `or=(...)` filters break on commas, parentheses and %."""
    return re.sub(r"[^\w\s'&-]", " ", q or "").strip()[:80]


# Words that don't narrow a search ("any events at Leavey tonight?" -> "leavey" + today)
_FILLER = set(
    "a an and any anything are around at campus deal deals discount discounts event events find for going happening "
    "i in is list me near now of on or show some something the there this to usc what whats where".split()
)
# "free food", "freebies", "swag": that's the freebie filter, not text to look for
_FREEBIE_PHRASE = re.compile(
    r"\b(free\s+(food|stuff|things|drinks?|snacks?|refreshments?|meals?)|freebies?|giveaways?|swag|merch)\b", re.I
)
# "free food", "free drinks": events that give away something to eat or drink (the "Free food" chip)
_FOOD_PHRASE = re.compile(r"\bfree\s+(food|drinks?|snacks?|refreshments?|meals?)\b", re.I)
_TIME_WORDS = {"today": 0, "tonight": 0, "tomorrow": 1}


def search_words(q: str | None) -> list[str]:
    """Each word is matched on its own (all must match), so "pizza night" finds "Hack Night · Free pizza"."""
    words = [w for w in clean_query(q).split() if re.search(r"\w", w)]
    return [w for w in words if w.lower().strip("'") not in _FILLER and w.lower() not in _TIME_WORDS and w.lower() != "week"][:6]


def parse_query(q: str | None) -> tuple[str | None, bool, tuple[datetime, datetime] | None]:
    """Text -> (remaining text, wants freebies, time range from "today"/"tonight"/"tomorrow"/"this week")."""
    if not q:
        return q, False, None
    freebie = bool(_FREEBIE_PHRASE.search(q))
    q = _FREEBIE_PHRASE.sub(" ", q)
    words = {w.lower() for w in clean_query(q).split()}
    when = None
    for word, offset in _TIME_WORDS.items():
        if word in words:
            start, end = la_day_bounds(la_today() + timedelta(days=offset))
            when = (start, end)
            break
    if when is None and "week" in words:
        start, _ = la_day_bounds()
        if "next" in words:  # "next week": the 7 days after this one
            start += timedelta(days=7)
        when = (start, start + timedelta(days=7))
    return q, freebie, when


def _event(row: dict) -> dict:
    org = row.pop("orgs", None) or {}
    row["org_name"] = org.get("name")
    row["org_verified"] = bool(org.get("verified"))
    return row


def _rows(res) -> list[dict]:
    return list(res.data or []) if res is not None else []


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
def search_events(
    q: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    category: str | None = None,
    free: bool | None = None,
    freebie: bool | None = None,
    limit: int = 200,
) -> list[dict]:
    """Published events, soonest first. Events that already ended are always left out.

    `category` is a chip: the event's own category, or one its text fits (categories.matches).
    """
    if not category and q and _FOOD_PHRASE.search(q):
        category = "free_food"
    q, wants_freebie, when = parse_query(q)
    if wants_freebie and freebie is None:
        freebie = True
    if when and not start and not end:
        # "today": still running or starting later today (not this morning's events that ended)
        end = when[1]
        if when[0] > now_utc():
            start = when[0]
    query = get_supabase().table("events").select(EVENT_SELECT).eq("status", "published")
    if start:
        query = query.gte("starts_at", iso(start))
    else:
        # still running or starting later (events without ends_at count as 2h long)
        query = query.gte("starts_at", iso(now_utc().replace(microsecond=0) - _TWO_HOURS))
    if end:
        query = query.lt("starts_at", iso(end))
    if free is not None:
        query = query.eq("is_free", free)
    if freebie is not None:
        query = query.eq("has_freebie", freebie)
    for word in search_words(q):  # one or=(...) per word; PostgREST ANDs them together
        like = f"%{word}%"
        query = query.or_(
            f"title.ilike.{like},description.ilike.{like},location_text.ilike.{like},freebie_desc.ilike.{like}"
        )
    rows = [_event(r) for r in _rows(query.order("starts_at").limit(limit).execute())]
    rows = [r for r in rows if categories.matches(r, category)]
    # never list events that already ended, even when `start` is in the past ("this week" on a Friday)
    now = now_utc()
    return [r for r in rows if not has_ended(r["starts_at"], r["ends_at"], now)]


def get_event(event_id: str) -> dict | None:
    if not is_uuid(event_id):
        return None
    rows = _rows(get_supabase().table("events").select(EVENT_SELECT).eq("id", event_id).limit(1).execute())
    return _event(rows[0]) if rows else None


def events_by_ids(ids: list[str] | set[str]) -> list[dict]:
    ids = [i for i in ids if is_uuid(i)]
    if not ids:
        return []
    res = get_supabase().table("events").select(EVENT_SELECT).in_("id", ids).order("starts_at").execute()
    return [_event(r) for r in _rows(res)]


def events_starting_between(start: datetime, end: datetime) -> list[dict]:
    res = (
        get_supabase().table("events").select(EVENT_SELECT).eq("status", "published")
        .gte("starts_at", iso(start)).lt("starts_at", iso(end)).order("starts_at").execute()
    )
    return [_event(r) for r in _rows(res)]


def events_tickets_open_between(start: datetime, end: datetime) -> list[dict]:
    res = (
        get_supabase().table("events").select(EVENT_SELECT).eq("status", "published")
        .gte("tickets_open_at", iso(start)).lt("tickets_open_at", iso(end)).execute()
    )
    return [_event(r) for r in _rows(res)]


def insert_event(row: dict) -> dict:
    res = get_supabase().table("events").insert(row).execute()
    return get_event(_rows(res)[0]["id"]) or _rows(res)[0]


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------
def search_deals(q: str | None = None, active: bool = True, limit: int = 100) -> list[dict]:
    """Active = not expired. One-time deals ending soonest first, then ongoing deals by votes."""
    query = get_supabase().table("deals").select("*")
    for word in search_words(q):
        like = f"%{word}%"
        query = query.or_(f"title.ilike.{like},description.ilike.{like},how_to_claim.ilike.{like}")
    rows = _rows(query.limit(limit).execute())
    if active:
        now = now_utc()
        rows = [d for d in rows if not d["expires_at"] or parse_ts(d["expires_at"]) > now]
    far = parse_ts("2999-01-01T00:00:00Z")
    rows.sort(key=lambda d: (d["kind"] != "one_time", parse_ts(d["expires_at"]) or far, -d["still_active_votes"]))
    return rows


def get_deal(deal_id: str) -> dict | None:
    if not is_uuid(deal_id):
        return None
    rows = _rows(get_supabase().table("deals").select("*").eq("id", deal_id).limit(1).execute())
    return rows[0] if rows else None


def insert_deal(row: dict) -> dict:
    return _rows(get_supabase().table("deals").insert(row).execute())[0]


def set_deal_votes(deal_id: str, votes: int) -> int:
    get_supabase().table("deals").update({"still_active_votes": votes}).eq("id", deal_id).execute()
    return votes


# ---------------------------------------------------------------------------
# Saves, attendance, profiles
# ---------------------------------------------------------------------------
def save_event(user_id: str, event_id: str, registered: bool) -> None:
    row = {"user_id": user_id, "event_id": event_id}
    existing = _rows(get_supabase().table("event_saves").select("registered").match(row).limit(1).execute())
    # never "un-register" someone just because they tapped Save again
    row["registered"] = registered or bool(existing and existing[0]["registered"])
    get_supabase().table("event_saves").upsert(row, on_conflict="user_id,event_id").execute()


def unsave_event(user_id: str, event_id: str) -> None:
    get_supabase().table("event_saves").delete().match({"user_id": user_id, "event_id": event_id}).execute()


def saves_for_user(user_id: str) -> dict[str, bool]:
    """event_id -> registered"""
    rows = _rows(get_supabase().table("event_saves").select("event_id, registered").eq("user_id", user_id).execute())
    return {r["event_id"]: r["registered"] for r in rows}


def saves_for_events(event_ids: list[str]) -> list[dict]:
    if not event_ids:
        return []
    return _rows(get_supabase().table("event_saves").select("*").in_("event_id", event_ids).execute())


def mark_reminder_sent(save_id: str) -> None:
    get_supabase().table("event_saves").update({"reminder_sent_at": iso(now_utc())}).eq("id", save_id).execute()


def attended_ids(user_id: str) -> set[str]:
    rows = _rows(get_supabase().table("attendance").select("event_id").eq("user_id", user_id).execute())
    return {r["event_id"] for r in rows}


def attendance(user_id: str) -> dict[str, str]:
    """event_id -> checked_in_at, for one student"""
    rows = _rows(get_supabase().table("attendance").select("event_id, checked_in_at").eq("user_id", user_id).execute())
    return {r["event_id"]: r["checked_in_at"] for r in rows}


def check_in(user_id: str, event_id: str) -> bool:
    """Returns False if the user was already checked in."""
    if event_id in attended_ids(user_id):
        return False
    get_supabase().table("attendance").insert({"user_id": user_id, "event_id": event_id}).execute()
    return True


def profile(user_id: str) -> dict | None:
    rows = _rows(get_supabase().table("profiles").select("*").eq("id", user_id).limit(1).execute())
    return rows[0] if rows else None


def notify_profiles() -> list[dict]:
    res = get_supabase().table("profiles").select("*").or_("notify_email.eq.true,notify_push.eq.true").execute()
    return _rows(res)


def update_profile(user_id: str, fields: dict) -> None:
    get_supabase().table("profiles").update(fields).eq("id", user_id).execute()


def user_email(user_id: str) -> str | None:
    try:
        res = get_supabase().auth.admin.get_user_by_id(user_id)
    except Exception:  # unknown user, or auth admin API unavailable
        return None
    return getattr(getattr(res, "user", None), "email", None)


def unlog_notification(user_id: str, kind: str, ref_id: str) -> None:
    """Give the slot back when nothing could be delivered, so the next run tries again."""
    get_supabase().table("notification_log").delete().match({"user_id": user_id, "type": kind, "ref_id": ref_id}).execute()


def log_notification(user_id: str, kind: str, ref_id: str) -> bool:
    """Claim a notification slot. False = this user already got it (unique user_id+type+ref_id)."""
    try:
        get_supabase().table("notification_log").insert({"user_id": user_id, "type": kind, "ref_id": ref_id}).execute()
        return True
    except Exception as e:
        if "23505" in str(e) or "duplicate" in str(e).lower():
            return False
        raise


# ---------------------------------------------------------------------------
# Rewards
# ---------------------------------------------------------------------------
def reward_programs() -> list[tuple[dict, set[str]]]:
    """[(program row, {event ids that count toward it})]"""
    sb = get_supabase()
    programs = _rows(sb.table("reward_programs").select("*").order("created_at").execute())
    links = _rows(sb.table("reward_program_events").select("program_id, event_id").execute())
    by_program: dict[str, set[str]] = {p["id"]: set() for p in programs}
    for link in links:
        by_program.setdefault(link["program_id"], set()).add(link["event_id"])
    return [(p, by_program[p["id"]]) for p in programs]


# ---------------------------------------------------------------------------
# Buildings + orgs (small, cached for a few minutes)
# ---------------------------------------------------------------------------
_cache: dict[str, tuple[float, list[dict]]] = {}


def buildings() -> list[dict]:
    hit = _cache.get("buildings")
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    rows = _rows(get_supabase().table("buildings").select("id, code, name, lat, lng").execute())
    _cache["buildings"] = (time.time(), rows)
    return rows


def get_org(org_id: str) -> dict | None:
    if not is_uuid(org_id):
        return None
    rows = _rows(get_supabase().table("orgs").select("*").eq("id", org_id).limit(1).execute())
    return rows[0] if rows else None


def find_org(name: str | None) -> dict | None:
    words = clean_query(name)
    if not words:
        return None
    rows = _rows(get_supabase().table("orgs").select("*").ilike("name", words).limit(1).execute())
    return rows[0] if rows else None
