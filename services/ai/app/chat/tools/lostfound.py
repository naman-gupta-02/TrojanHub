"""Lost & Found tools -> P2 Vishwa's endpoints (GET /items/search, POST /items)."""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from app.chat import store
from app.chat.tools.base import GUEST_USER_ID, ToolContext, ToolOutcome
from app.chat.tools.http import call, download
from app.core.config import settings


async def search_lost_items(args: dict, ctx: ToolContext) -> ToolOutcome:
    q = " ".join(filter(None, [args["query"], args.get("building")]))
    guest = ctx.user_id == GUEST_USER_ID
    if guest and not settings.mock("lostfound"):
        res = await _guest_search(q)
    else:
        res = await call("GET", "/items/search", ctx.auth_header, params={"q": q})
    if "error" in res:
        return ToolOutcome(res)
    results = [
        {
            "id": r["item"]["id"], "title": r["item"]["title"], "tier": r["item"]["tier"],
            "where_found": r["item"].get("location_text"), "match_score": round(r["score"], 2),
            "link": f"/lost-found/{r['item']['id']}",
        }
        for r in res.get("results", [])[:5]
    ]
    note = "Valuables are picked up at DPS / IT, not handed off in chat."
    if guest:
        note += " The student is a guest: they need to sign in with their @usc.edu email to open an item or claim it."
    return ToolOutcome({"results": results, "note": note})


async def _guest_search(q: str) -> dict:
    """GET /items/search is for signed-in students, so for a guest Tommy runs the same search
    in-process. Only titles, tiers and where each item was found reach the guest (see above);
    photos, details and claiming stay behind sign-in on the item page."""
    from app.lostfound import items, search

    try:
        return await run_in_threadpool(search.search_text, q)
    except items.ItemError as e:
        return {"error": {"code": e.code, "message": e.message}, "status": e.status}


async def report_found_item(args: dict, ctx: ToolContext) -> ToolOutcome:
    draft = {"description": args["description"], "location": args["location"], "image_url": args.get("image_url")}
    real_image = store.resolve_photo(ctx.session_id, args.get("image_url"))
    action = store.add_pending(session_id=ctx.session_id, user_id=ctx.user_id, tool="report_found_item",
                               args={**args, "_image": real_image}, draft=draft, auth_header=ctx.auth_header)
    summary = f"Found item · {args['description']} · {args['location']}" + (" · with photo" if args.get("image_url") else "")
    return ToolOutcome(
        {"status": "awaiting_confirmation", "action_id": action.action_id, "draft": draft},
        confirm={"type": "confirm", "action_id": action.action_id, "tool": "report_found_item",
                 "title": "Post a found item", "summary": summary, "draft": draft},
    )


async def confirm_report_found_item(action: store.PendingAction, draft: dict) -> tuple[str, dict]:
    files = None
    image = action.args.get("_image") or draft.get("image_url")
    if image and (photo := await download(image)):
        files = {"photo": ("photo.jpg", photo[0], photo[1])}
    res = await call("POST", "/items", action.auth_header, data={
        "kind": "found", "description": draft["description"], "location_text": draft["location"],
    }, files=files)
    if "error" in res:
        return "failed", res
    if res.get("tier") == "valuable" and res.get("dropoff"):
        d = res["dropoff"]
        return "done", {**res, "message": f"Posted! This looks valuable, so please drop it at {d['name']} ({d['map']})."}
    return "done", {**res, "message": "Posted! Owners searching for it will find it in Lost & Found."}
