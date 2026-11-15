"""log_complaint -> P4 Jaymin's POST /complaints (draft, then confirm:true)."""

from __future__ import annotations

from app.chat import store
from app.chat.tools.base import ToolContext, ToolOutcome
from app.chat.tools.http import call


def _others(count: int) -> str:
    return "1 other student reported this" if count == 1 else f"{count} others reported this"


async def log_complaint(args: dict, ctx: ToolContext) -> ToolOutcome:
    text = args["text"]
    # `building` (code or name) is for when the building isn't in the student's own words.
    res = await call("POST", "/complaints", ctx.auth_header, json={
        "text": text, "building": args.get("building"), "room": args.get("room"), "source": "chat",
    })
    if "error" in res:
        return ToolOutcome(res)
    if res.get("safety"):  # never create a ticket for safety issues
        return ToolOutcome({"safety": res["safety"], "note": "Do NOT file a ticket. Give this safety info right away."})

    d = res["draft"]
    dup = res.get("duplicate_ticket")
    photo = store.resolve_photo(ctx.session_id, args.get("image_url"))  # the real image, never shown to the LLM
    draft = {**d, "text": text, "anonymous": False, "has_photo": bool(photo)}
    action = store.add_pending(session_id=ctx.session_id, user_id=ctx.user_id, tool="log_complaint",
                               args={**args, "_photo": photo}, draft=draft, auth_header=ctx.auth_header)
    where = " ".join(filter(None, [d.get("building"), d.get("room")]))
    summary = " · ".join(filter(None, [d["department"], d["category"], d["urgency"], where]))
    if dup:
        summary += f" · {_others(dup['report_count'])}"
    if photo:
        summary += " · with photo"
    return ToolOutcome(
        {"status": "awaiting_confirmation", "action_id": action.action_id, "draft": d, "duplicate_ticket": dup},
        confirm={"type": "confirm", "action_id": action.action_id, "tool": "log_complaint",
                 "title": "Log a complaint", "summary": summary, "draft": draft},
    )


async def confirm_log_complaint(action: store.PendingAction, draft: dict) -> tuple[str, dict]:
    # `draft` = what the student saw, plus any edits from the card. The same `text` must be sent
    # so the endpoint files exactly the draft it showed (it keeps the sorting keyed on the text).
    body = {"text": draft["text"], "room": draft.get("room"), "anonymous": bool(draft.get("anonymous")),
            "confirm": True, "source": "chat"}
    if action.args.get("_photo") and draft.get("has_photo", True):
        body["photo"] = action.args["_photo"]
    if draft.get("building") != action.draft.get("building"):
        body["building"] = draft.get("building")  # the student changed it on the card: send their words
    else:
        body["building_id"] = draft.get("building_id")
        body["building"] = draft.get("building")
    res = await call("POST", "/complaints", action.auth_header, json=body)
    if "error" in res:
        return "failed", res
    t = res["ticket"]
    count = t.get("report_count", 1)
    msg = f"Logged! Sent to {t['department']}. " + ("You're the first to report this." if count <= 1 else f"{count} reports on this issue so far.")
    if res.get("photo_saved"):
        msg += " Your photo is attached (only staff can see it)."
    if res.get("route_url"):
        msg += f" Official form: {res['route_url']}"
    return "done", {**res, "message": msg}
