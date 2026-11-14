"""Tool name -> wrapper, and running a confirmed action."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from app.chat import store
from app.chat.tools import complaints, events, lostfound, usc_info
from app.chat.tools.base import ToolContext, ToolOutcome

Handler = Callable[[dict, ToolContext], Awaitable[ToolOutcome]]
ConfirmHandler = Callable[[store.PendingAction, dict], Awaitable[tuple[str, dict]]]

HANDLERS: dict[str, Handler] = {
    "search_usc_info": usc_info.search_usc_info,
    "search_lost_items": lostfound.search_lost_items,
    "report_found_item": lostfound.report_found_item,
    "search_events": events.search_events,
    "search_deals": events.search_deals,
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
