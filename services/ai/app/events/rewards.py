"""Attendance rewards (ARCHITECTURE.md §7.3): "3 of 5 career events attended" + what to go to next."""

from app.events import store
from app.events.dates import now_utc, parse_ts

NEXT_EVENTS = 3


def progress(user_id: str, programs: list[tuple[dict, set[str]]] | None = None,
             attended: set[str] | None = None) -> list[dict]:
    """RewardsProgressResponse for one user."""
    programs = store.reward_programs() if programs is None else programs
    attended = store.attended_ids(user_id) if attended is None else attended
    all_ids = set().union(*(ids for _, ids in programs)) if programs else set()
    events = {e["id"]: e for e in store.events_by_ids(all_ids)}
    now = now_utc()

    out = []
    for program, ids in programs:
        upcoming = [
            events[i] for i in ids
            if i in events and i not in attended and events[i]["status"] == "published"
            and parse_ts(events[i]["starts_at"]) > now
        ]
        upcoming.sort(key=lambda e: e["starts_at"])
        out.append({
            "program": program,
            "attended": len(ids & attended),
            "required": program["required_count"],
            "next_eligible_events": upcoming[:NEXT_EVENTS],
        })
    return out


def programs_for_event(event_id: str, programs: list[tuple[dict, set[str]]] | None = None) -> list[dict]:
    programs = store.reward_programs() if programs is None else programs
    return [p for p, ids in programs if event_id in ids]
