"""Attendance rewards (ARCHITECTURE.md §7.3): "3 of 5 events attended", what counted, what to go to next."""

from app.events import perks, store
from app.events.dates import now_utc, parse_ts

NEXT_EVENTS = 3


def progress(user_id: str, programs: list[tuple[dict, set[str]]] | None = None,
             attended: set[str] | dict[str, str] | None = None) -> list[dict]:
    """RewardsProgressResponse for one student.

    `attended` is a set of event ids, or {event_id: checked_in_at} for the full history.
    """
    programs = store.reward_programs() if programs is None else programs
    checkins: dict[str, str | None] = (
        store.attendance(user_id) if attended is None
        else attended if isinstance(attended, dict)
        else {event_id: None for event_id in attended}
    )
    all_ids = set().union(*(ids for _, ids in programs)) if programs else set()
    events = {e["id"]: e for e in store.events_by_ids(all_ids)}
    now = now_utc()

    out = []
    for program, ids in programs:
        upcoming = [
            events[i] for i in ids
            if i in events and i not in checkins and events[i]["status"] == "published"
            and parse_ts(events[i]["starts_at"]) > now
        ]
        upcoming.sort(key=lambda e: e["starts_at"])
        counted = sorted(
            ({"id": i, "title": events[i]["title"], "starts_at": events[i]["starts_at"], "checked_in_at": checkins[i]}
             for i in ids & checkins.keys() if i in events),
            key=lambda c: c["checked_in_at"] or c["starts_at"],
        )
        required = program["required_count"]
        # earned on the check-in that reached the goal
        completed_at = None
        if len(counted) >= required and required > 0:
            hit = counted[required - 1]
            completed_at = hit["checked_in_at"] or hit["starts_at"]
        out.append({
            "program": program,
            "attended": len(counted),
            "required": required,
            "next_eligible_events": upcoming[:NEXT_EVENTS],
            "style": perks.style(program["id"]),
            "attended_events": counted,
            "completed_at": completed_at,
        })
    return out


def programs_for_event(event_id: str, programs: list[tuple[dict, set[str]]] | None = None) -> list[dict]:
    programs = store.reward_programs() if programs is None else programs
    return [p for p, ids in programs if event_id in ids]
