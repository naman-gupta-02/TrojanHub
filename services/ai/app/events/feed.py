"""Home feed (ARCHITECTURE.md §7.3): "3 things for you today" + today's freebies.

Every candidate gets points from a few simple signals. The strongest signal becomes the
one-line `reason` shown on the card, so students see *why* it was picked.
"""

from datetime import timedelta

from app.events import store
from app.events.dates import LA, friendly, friendly_time, la_day_bounds, la_today, now_utc, parse_ts

FOR_YOU = 3
LOOKAHEAD = timedelta(days=7)

CATEGORY_LABEL = {
    "cultural": "cultural", "career": "career", "free_food": "free food", "sports": "sports",
    "social": "social", "academic": "academic", "other": "campus",
}


def _day_label(start) -> str:
    day = start.astimezone(LA).date()
    today = la_today()
    if day == today:
        return f"today at {friendly_time(start)}"
    if day == today + timedelta(days=1):
        return f"tomorrow at {friendly_time(start)}"
    return friendly(start)


def score_event(e: dict, interests: set[str], saved: dict[str, bool],
                program_progress: dict[str, tuple[str, int, int]]) -> tuple[float, str]:
    """(points, reason) for one event."""
    now = now_utc()
    start = parse_ts(e["starts_at"])
    hours = (start - now).total_seconds() / 3600
    signals: list[tuple[float, str]] = []

    if e["id"] in saved and hours <= 3:
        signals.append((6, f"You saved this · starts {_day_label(start)}"))
    if e["id"] in program_progress:
        name, done, need = program_progress[e["id"]]
        signals.append((4, f"Counts toward {name} ({done}/{need})"))
    if e["category"] in interests:
        signals.append((3, f"Matches your interest: {CATEGORY_LABEL.get(e['category'], e['category'])}"))
    if e["has_freebie"]:
        what = e.get("freebie_desc") or "freebies"
        bonus = 1.5 if "free_food" in interests else 0
        signals.append((2 + bonus, f"Free {what.lower().removeprefix('free ')} {_day_label(start)}"))
    if e.get("tickets_open_at"):
        opens = parse_ts(e["tickets_open_at"])
        if now < opens < now + timedelta(days=3):
            signals.append((2.5, f"Tickets open {friendly(opens)}, set a reminder"))
    if e.get("org_verified"):
        signals.append((0.5, f"Hosted by {e['org_name']}"))

    # closer is better: today +2, tomorrow +1, later in the week a little
    closeness = 2 if hours <= 12 else 1 if hours <= 36 else 0.5 if hours <= 72 else 0
    points = closeness + sum(p for p, _ in signals)
    reason = max(signals)[1] if signals else f"Happening {_day_label(start)}"
    if e["id"] in saved and hours > 3:
        points -= 2  # already on their calendar; make room for something new
    return points, reason


def score_deal(d: dict, interests: set[str]) -> tuple[float, str]:
    if d["kind"] == "one_time":
        ends = parse_ts(d["expires_at"])
        if ends and ends - now_utc() < timedelta(hours=12):
            return 3.5, f"Today only · ends {friendly_time(ends)}"
        return 2, "Limited-time freebie"
    votes = d["still_active_votes"]
    return 1 + min(votes / 5, 1.5), (f"{votes} students say it still works" if votes >= 3 else "Student deal")


def today_freebies(events: list[dict], deals: list[dict]) -> list[dict]:
    start, end = la_day_bounds()
    now = now_utc()
    items = [
        {"kind": "event", "event": e}
        for e in events
        if e["has_freebie"] and start <= parse_ts(e["starts_at"]) < end
        and (parse_ts(e["ends_at"]) or parse_ts(e["starts_at"]) + timedelta(hours=2)) > now
    ]
    items += [
        {"kind": "deal", "deal": d}
        for d in deals
        if d["kind"] == "one_time" and (not d["starts_at"] or parse_ts(d["starts_at"]) < end)
    ]
    # events by start time, then deals ending soonest
    return sorted(items, key=lambda i: (0, i["event"]["starts_at"]) if i["kind"] == "event"
                  else (1, i["deal"]["expires_at"] or "9999"))


def build(user_id: str) -> dict:
    """FeedResponse for one user."""
    events = store.search_events(start=None, end=now_utc() + LOOKAHEAD)
    deals = store.search_deals(active=True)
    profile = store.profile(user_id) or {}
    interests = set(profile.get("interests") or [])
    saved = store.saves_for_user(user_id) if profile else {}
    attended = store.attended_ids(user_id) if profile else set()

    # events that count toward a reward program the student has started
    program_progress: dict[str, tuple[str, int, int]] = {}
    for program, ids in store.reward_programs():
        done = len(ids & attended)
        if done:
            for event_id in ids - attended:
                program_progress[event_id] = (program["name"], done, program["required_count"])

    scored = [(*score_event(e, interests, saved, program_progress), "event", e) for e in events]
    scored += [(*score_deal(d, interests), "deal", d) for d in deals]
    scored.sort(key=lambda s: s[0], reverse=True)

    return {"for_you": pick_varied(scored), "today_freebies": today_freebies(events, deals)}


def pick_varied(scored: list[tuple[float, str, str, dict]]) -> list[dict]:
    """Best 3, one per category (deals count as one category); top up if there aren't 3 categories."""
    picks, categories, taken = [], set(), set()
    for _, reason, kind, row in scored:
        cat = row["category"] if kind == "event" else "deal"
        if cat not in categories and len(picks) < FOR_YOU:
            picks.append({"kind": kind, kind: row, "reason": reason})
            categories.add(cat)
            taken.add(row["id"])
    for _, reason, kind, row in scored:
        if len(picks) >= FOR_YOU:
            break
        if row["id"] not in taken:
            picks.append({"kind": kind, kind: row, "reason": reason})
            taken.add(row["id"])
    return picks
