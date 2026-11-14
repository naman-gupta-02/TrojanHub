"""log_complaint -> P4 Jaymin's POST /complaints (draft, then confirm:true)."""

from __future__ import annotations

from app.chat import store
from app.chat.tools.base import ToolContext, ToolOutcome
from app.chat.tools.http import call


async def log_complaint(args: dict, ctx: ToolContext) -> ToolOutcome:
    text = args["text"]
    res = await call("POST", "/complaints", ctx.auth_header, json={"text": text, "room": args.get("room"), "source": "chat"})
    if "error" in res:
        return ToolOutcome(res)
    if res.get("safety"):  # never create a ticket for safety issues
        return ToolOutcome({"safety": res["safety"], "note": "Do NOT file a ticket. Give this safety info right away."})

    d = res["draft"]
    dup = res.get("duplicate_ticket")
    draft = {**d, "text": text, "anonymous": False}
    action = store.add_pending(session_id=ctx.session_id, user_id=ctx.user_id, tool="log_complaint",
                               args=args, draft=draft, auth_header=ctx.auth_header)
    where = " ".join(filter(None, [d.get("building"), d.get("room")]))
    summary = " · ".join(filter(None, [d["department"], d["category"], d["urgency"], where]))
    if dup:
        summary += f" · {dup['report_count']} others reported this"
    return ToolOutcome(
        {"status": "awaiting_confirmation", "action_id": action.action_id, "draft": d, "duplicate_ticket": dup},
        confirm={"type": "confirm", "action_id": action.action_id, "tool": "log_complaint",
                 "title": "Log a complaint", "summary": summary, "draft": draft},
    )


async def confirm_log_complaint(action: store.PendingAction, draft: dict) -> tuple[str, dict]:
    res = await call("POST", "/complaints", action.auth_header, json={
        "text": draft["text"], "building_id": draft.get("building_id"), "room": draft.get("room"),
        "anonymous": bool(draft.get("anonymous")), "confirm": True, "source": "chat",
    })
    if "error" in res:
        return "failed", res
    t = res["ticket"]
    msg = f"Logged! Sent to {t['department']} ({t['report_count']} reports on this issue)."
    if res.get("route_url"):
        msg += f" Official form: {res['route_url']}"
    return "done", {**res, "message": msg}
