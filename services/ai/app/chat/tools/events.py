"""Events / Deals / Flyer tools -> P3 Parnavi's endpoints."""

from __future__ import annotations

from datetime import datetime, time, timedelta

from app.chat import store
from app.chat.tools.base import LA, ToolContext, ToolOutcome, pacific
from app.chat.tools.http import call


def _date_range(spec: str | None) -> tuple[str | None, str | None]:
    """'today' | 'this_week' | 'YYYY-MM-DD/YYYY-MM-DD' -> UTC ISO bounds (Pacific days)."""
    if not spec:
        return None, None
    today = datetime.now(LA).date()
    if spec == "today":
        start, end = today, today
    elif spec == "this_week":
        start, end = today, today + timedelta(days=6)
    elif "/" in spec:
        a, b = spec.split("/", 1)
        start, end = datetime.fromisoformat(a).date(), datetime.fromisoformat(b).date()
    else:
        return None, None
    lo = datetime.combine(start, time.min, LA)
    hi = datetime.combine(end, time.max, LA)
    return lo.isoformat(), hi.isoformat()


# Words that say "something free on campus" but don't narrow the search any further.
_GENERIC = set("a an any anything are at around campus deal deals discount discounts event events food for free freebie freebies "
               "going happening i in is me near now of on or student students stuff that the there this to today tonight usc week what whats".split())


def specific_terms(query: str | None) -> str | None:
    """'free food on campus today' -> None (the filters already say that); 'free pizza' -> 'pizza'."""
    words = [w for w in (query or "").lower().replace("?", " ").replace("'", "").split() if w not in _GENERIC]
    return " ".join(words) or None


def _event(e: dict) -> dict:
    return {
        "id": e["id"], "title": e["title"], "when": pacific(e["starts_at"]), "ends": pacific(e.get("ends_at")),
        "where": e.get("location_text"), "category": e.get("category"), "is_free": e.get("is_free"),
        "freebie": e.get("freebie_desc") if e.get("has_freebie") else None,
        "register_url": e.get("register_url"), "tickets_open": pacific(e.get("tickets_open_at")),
        "link": f"/events/{e['id']}",
    }


async def search_events(args: dict, ctx: ToolContext) -> ToolOutcome:
    lo, hi = _date_range(args.get("date_range"))
    q = specific_terms(args.get("query"))  # the filters carry "free" / "today"; keep only real keywords
    res = await call("GET", "/events/search", ctx.auth_header, params={
        "q": q, "from": lo, "to": hi,
        "free": "true" if args.get("free_only") else None, "freebie": "true" if args.get("freebie_only") else None,
    })
    if "error" in res:
        return ToolOutcome(res)
    return ToolOutcome({"events": [_event(e) for e in res.get("events", [])[:8]]})


async def search_deals(args: dict, ctx: ToolContext) -> ToolOutcome:
    res = await call("GET", "/deals/search", ctx.auth_header, params={"q": specific_terms(args.get("query")), "active": "true"})
    if "error" in res:
        return ToolOutcome(res)
    deals = [
        {"id": d["id"], "title": d["title"], "kind": d["kind"], "how_to_claim": d.get("how_to_claim"),
         "expires": pacific(d.get("expires_at")), "link": d.get("link")}
        for d in res.get("deals", [])[:8]
    ]
    return ToolOutcome({"deals": deals})


async def scan_flyer(args: dict, ctx: ToolContext) -> ToolOutcome:
    real_image = store.resolve_photo(ctx.session_id, args["image_url"])
    if not real_image:
        return ToolOutcome({"error": {"code": "photo_missing", "message": "I lost that photo. Ask the student to attach it again."}})
    res = await call("POST", "/flyers/scan", ctx.auth_header, json={"image_url": real_image})
    if "error" in res:
        return ToolOutcome(res)
    draft = {**res["fields"], "type": res["type"], "missing": res.get("missing", []), "flyer_url": args["image_url"]}
    if res.get("duplicate_of"):
        return ToolOutcome({"duplicate_of": res["duplicate_of"], "fields": res["fields"],
                            "note": "This event is already on TrojanHub. Offer to save it instead."})
    action = store.add_pending(session_id=ctx.session_id, user_id=ctx.user_id, tool="scan_flyer",
                               args=args, draft=draft, auth_header=ctx.auth_header)
    f = res["fields"]
    summary = " · ".join(filter(None, [f.get("title"), pacific(f.get("starts_at")), f.get("location_text")]))
    if draft["missing"]:
        summary += f" · missing: {', '.join(draft['missing'])}"
    return ToolOutcome(
        {"status": "awaiting_confirmation", "action_id": action.action_id, "draft": draft},
        confirm={"type": "confirm", "action_id": action.action_id, "tool": "scan_flyer",
                 "title": f"Add this {res['type']}", "summary": summary, "draft": draft},
    )


async def confirm_scan_flyer(action: store.PendingAction, draft: dict) -> tuple[str, dict]:
    # TODO(P3 + P1): needs a "create event/deal from fields" endpoint (not in ARCHITECTURE.md §6 yet).
    return "failed", {"message": "Saving flyers from chat isn't wired up yet. Open Events → Scan flyer to post it.",
                      "draft": draft}


async def save_event(args: dict, ctx: ToolContext) -> ToolOutcome:
    draft = {"event_id": args["event_id"], "register": bool(args.get("register"))}
    action = store.add_pending(session_id=ctx.session_id, user_id=ctx.user_id, tool="save_event",
                               args=args, draft=draft, auth_header=ctx.auth_header)
    summary = "Save to your calendar" + (" and register" if draft["register"] else "")
    return ToolOutcome(
        {"status": "awaiting_confirmation", "action_id": action.action_id, "draft": draft},
        confirm={"type": "confirm", "action_id": action.action_id, "tool": "save_event",
                 "title": "Save event", "summary": summary, "draft": draft},
    )


async def confirm_save_event(action: store.PendingAction, draft: dict) -> tuple[str, dict]:
    res = await call("POST", f"/events/{draft['event_id']}/save", action.auth_header, json={"register": draft.get("register", False)})
    if "error" in res:
        return "failed", res
    msg = "Saved! Use the calendar link to add it to Google or Apple Calendar."
    if res.get("register_url"):
        msg += f" Finish registering here: {res['register_url']}"
    return "done", {**res, "message": msg}
