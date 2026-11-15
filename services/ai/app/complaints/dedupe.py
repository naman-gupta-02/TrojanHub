"""Duplicate grouping (ARCHITECTURE.md §7.4): "5 students reported AC not working in GFS 213".

A new report joins an existing ticket when all of these hold:
- same building, and the ticket is open and less than 7 days old
- same room (if the report names no room, any ticket in the building can match)
- the problem is the same, judged by the embedding of the two summaries:
    - same category and cosine >= 0.45, or
    - any category and cosine >= 0.80

Why two cutoffs: ARCHITECTURE.md says "cosine > 0.8", but measured on all-MiniLM-L6-v2
(2026-11-14) that alone misses most real duplicates. Reports of the same problem scored
0.46-0.93 ("AC broken, room is very warm" vs "Classroom overheating, cooling not working" = 0.48).
Different problems in the same category scored 0.13-0.43, and different categories under 0.30.
So building + room + category does most of the work, and the embedding only has to tell
"same problem" from "another problem of the same kind in the same room".

Known limit: "too hot" and "too cold" in the same room score 0.74 and merge into one HVAC ticket.

A report with no building is never merged: there is nothing to anchor it to.
"""

from app.complaints import store

SAME_CATEGORY_MIN = 0.45
ANY_CATEGORY_MIN = 0.80


def _norm_room(room: str | None) -> str | None:
    return room.strip().upper() if room and room.strip() else None


def _room_ok(report_room: str | None, ticket_room: str | None) -> bool:
    report_room = _norm_room(report_room)
    return report_room is None or report_room == _norm_room(ticket_room)


def find_duplicate(
    *, embedding: list[float] | None, building_id: str | None, room: str | None, category: str
) -> dict | None:
    """The open ticket this report should join, or None. Returns the ticket row."""
    if not building_id:
        return None

    if embedding is None:
        # No embedding model: fall back to exact building + room + category.
        for ticket in store.recent_open_tickets(building_id, category):
            if _room_ok(room, ticket.get("room")):
                return ticket
        return None

    matches = store.similar_open_tickets(embedding, building_id)
    tickets = {t["id"]: t for t in store.get_tickets([m["id"] for m in matches])}
    for match in matches:  # most similar first
        ticket = tickets.get(match["id"])
        if not ticket or not _room_ok(room, ticket.get("room")):
            continue
        similarity = match.get("similarity") or 0.0
        needed = SAME_CATEGORY_MIN if ticket.get("category") == category else ANY_CATEGORY_MIN
        if similarity >= needed:
            return ticket
    return None
