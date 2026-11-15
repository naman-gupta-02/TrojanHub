"""Routing (ARCHITECTURE.md §7.4): which office gets a ticket, and the link that takes it there.

The `routes` table maps a department (and optionally a category) to that office's own request
form or email. We only hand the student a link to the existing channel:
- email on file -> a mailto: link with the subject and details filled in
- otherwise     -> the office's request form (we can't prefill someone else's form)

TrojanHub is not an official channel and never submits anything on the student's behalf.
"""

from urllib.parse import quote

from app.complaints import store


def find_route(department: str, category: str) -> dict | None:
    """The route row for this department: the exact category if there is one, else the '*' default."""
    rows = store.routes_for(department)
    by_category = {r["category"]: r for r in rows}
    return by_category.get(category) or by_category.get("*")


def build_route(
    route: dict | None, *, department: str, summary: str, building_code: str | None, room: str | None, urgency: str
) -> tuple[str | None, str | None]:
    """(route_url, forwarded_to), e.g. ("https://fpm.usc.edu/...", "Facilities form"). (None, None) if no route."""
    if not route:
        return None, None

    if route.get("email"):
        location = " ".join(p for p in (building_code, room) if p) or "location not given"
        subject = f"Maintenance report: {summary} ({location})"
        body = (
            f"Issue: {summary}\n"
            f"Location: {location}\n"
            f"Urgency: {urgency}\n\n"
            "Sent by a student through TrojanHub, a student-built app. "
            "TrojanHub is not an official USC reporting channel."
        )
        return f"mailto:{route['email']}?subject={quote(subject)}&body={quote(body)}", f"{department} email"

    if route.get("form_url"):
        return route["form_url"], f"{department} form"

    return None, None
