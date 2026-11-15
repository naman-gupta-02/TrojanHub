"""Tool name -> wrapper, and running a confirmed action."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from app.chat import store
from app.chat.tools import complaints, events, lostfound, usc_info
from app.chat.tools import WRITE_TOOLS
from app.chat.tools.base import GUEST_USER_ID, ToolContext, ToolOutcome

Handler = Callable[[dict, ToolContext], Awaitable[ToolOutcome]]
# Guests (not signed in) can search; these save something or are about the student's own account.
SIGNED_IN_ONLY = WRITE_TOOLS | {"get_rewards"}
GUEST_NOTE = ("The student is chatting as a guest (not signed in). Tell them to sign in with their @usc.edu "
              "email to do this. They can still ask about USC and browse events and deals.")

ConfirmHandler = Callable[[store.PendingAction, dict], Awaitable[tuple[str, dict]]]

HANDLERS: dict[str, Handler] = {
    "search_usc_info": usc_info.search_usc_info,
    "search_lost_items": lostfound.search_lost_items,
    "report_found_item": lostfound.report_found_item,
    "search_events": events.search_events,
    "search_deals": events.search_deals,
    "get_rewards": events.get_rewards,
    "scan_flyer": events.scan_flyer,
    "save_event": events.save_event,
    "log_complaint": complaints.log_complaint,
}

CONFIRM_HANDLERS: dict[str, ConfirmHandler] = {
    "report_found_item": lostfound.confirm_report_found_item,
    "scan_flyer": events.confirm_scan_flyer,
    "save_event": events.confirm_save_event,
    "log_complaint": complaints.confirm_log_complaint,
}


async def run_tool(name: str, raw_args: str, ctx: ToolContext) -> ToolOutcome:
    handler = HANDLERS.get(name)
    if not handler:
        return ToolOutcome({"error": {"code": "unknown_tool", "message": f"No tool named {name}"}})
    if ctx.user_id == GUEST_USER_ID and name in SIGNED_IN_ONLY:
        return ToolOutcome({"error": {"code": "sign_in_required", "message": "Sign in to do this."}, "note": GUEST_NOTE})
    try:
        args = json.loads(raw_args or "{}")
    except json.JSONDecodeError:
        return ToolOutcome({"error": {"code": "bad_arguments", "message": "Arguments were not valid JSON"}})
    try:
        outcome = await handler(args, ctx)
    except KeyError as e:
        return ToolOutcome({"error": {"code": "missing_argument", "message": f"Missing argument {e}"}})
    except Exception as e:  # noqa: BLE001 - one broken tool must not kill the chat
        return ToolOutcome({"error": {"code": "tool_failed", "message": f"{type(e).__name__}: {e}"}})
    ctx.known_text.append(json.dumps(outcome.result, ensure_ascii=False))
    return outcome


async def run_confirmed(action: store.PendingAction, edits: dict | None) -> tuple[str, dict]:
    draft = {**action.draft, **(edits or {})}
    try:
        return await CONFIRM_HANDLERS[action.tool](action, draft)
    except Exception as e:  # noqa: BLE001
        return "failed", {"message": f"Something went wrong: {type(e).__name__}: {e}"}
