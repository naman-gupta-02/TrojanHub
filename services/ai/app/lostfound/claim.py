"""'This is mine': claiming a found item (P2, ARCHITECTURE.md §6 POST /items/{id}/claim, §7.2).

- valuable -> no chat; return where to pick it up (DPS checks proof of ownership)
- everyday -> open (or reopen) a private thread between owner and finder, with a first message

The chat itself goes straight between the apps and Supabase (`messages` table + Realtime).
RLS in the initial migration lets only the two people in a thread read or send its messages.
"""

from __future__ import annotations

import logging
import uuid

from app.core.supabase import get_supabase
from app.lostfound.dropoff import pick_dropoff
from app.lostfound.items import ItemError

log = logging.getLogger(__name__)

FIRST_MESSAGE = "Hi! I think this is mine. When could we meet to hand it off?"


def _existing_thread(item_id: str, owner_id: str) -> str | None:
    rows = (
        get_supabase()
        .table("item_threads")
        .select("id")
        .eq("item_id", item_id)
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["id"] if rows else None


def claim_item(item_id: str, user_id: str) -> dict:
    try:
        uuid.UUID(item_id)
    except ValueError:
        raise ItemError(404, "not_found", "That item doesn't exist.") from None

    sb = get_supabase()
    rows = (
        sb.table("items")
        .select("id, kind, tier, status, posted_by, building_id")
        .eq("id", item_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ItemError(404, "not_found", "That item doesn't exist.")
    item = rows[0]

    if item["kind"] != "found":
        raise ItemError(400, "not_a_found_item", "Only items someone found can be claimed.")
    if item["status"] != "open":
        raise ItemError(409, "not_available", "This item was already handed off or archived.")
    if item["posted_by"] == user_id:
        raise ItemError(400, "own_item", "You posted this item, so you can't claim it.")

    # Valuables: DPS handles the handoff and checks ownership, so no chat.
    if item["tier"] == "valuable":
        _, pickup = pick_dropoff(item.get("building_id"))
        return {"pickup": pickup}

    if not item["posted_by"]:
        raise ItemError(409, "finder_gone", "The finder's account is gone. Try DPS Lost & Found.")

    # Tapping twice reopens the same thread (unique on item_id + owner_id).
    if thread_id := _existing_thread(item_id, user_id):
        return {"thread_id": thread_id}
    try:
        thread = (
            sb.table("item_threads")
            .insert({"item_id": item_id, "owner_id": user_id, "finder_id": item["posted_by"]})
            .execute()
            .data[0]
        )
    except Exception:
        # Two taps at once: the other request created it first.
        if thread_id := _existing_thread(item_id, user_id):
            return {"thread_id": thread_id}
        raise

    sb.table("messages").insert({"thread_id": thread["id"], "sender_id": user_id, "body": FIRST_MESSAGE}).execute()
    log.info("Claim: item %s -> thread %s", item_id, thread["id"])
    return {"thread_id": thread["id"]}
