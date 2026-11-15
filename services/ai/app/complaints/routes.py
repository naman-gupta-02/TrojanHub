"""P4 Jaymin: Smart Complaints (ARCHITECTURE.md §6, §7.4).

POST /complaints            {text, building_id?, building?, room?, anonymous?, confirm?, source?}
GET  /complaints/mine
POST /tickets/{id}/upvote

Mock mode serves packages/shared/mocks/complaints_*.json. Real mode: classify.py sorts the
report, dedupe.py finds a ticket to join, routing.py picks the office link, store.py is the DB.
"""

import logging
import re
import time
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.complaints import store
from app.complaints.classify import Classification, classify, find_building
from app.complaints.dedupe import find_duplicate
from app.complaints.routing import build_route, find_route
from app.core.auth import get_user_id
from app.core.config import settings
from app.core.embeddings import embed_text
from app.core.mocks import load_mock

log = logging.getLogger(__name__)
router = APIRouter(tags=["complaints (P4)"])

_SAFETY_WORDS = re.compile(r"\b(gas|smoke|fire|hurt|injured|bleeding|weapon|gun|threat|unsafe|assault)\b")  # mock mode only
SAFETY_MESSAGE = "This sounds like a safety issue. Contact USC DPS now, or call 911 in an emergency."
MAX_TEXT_CHARS = 2000


class ComplaintRequest(BaseModel):
    text: str
    building_id: str | None = None
    building: str | None = None  # code or name ("GFS", "Leavey Library"); Tommy sends this. building_id wins.
    room: str | None = None
    anonymous: bool = False
    confirm: bool = False
    source: Literal["chat", "form"] = "form"


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


async def _run(fn, *args):
    """Run blocking work (LLM, Supabase, embeddings) off the event loop; unknown failures become a 502."""
    try:
        return await run_in_threadpool(fn, *args)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("complaints: %s failed", fn.__name__)
        raise _error(502, "complaints_unavailable", f"{type(e).__name__}: {e}") from e


# ---------------------------------------------------------------------------
# Sorting a report. The result is kept for 10 minutes, keyed on the student's words, so that
# "confirm" files exactly the draft the student just saw, without a second LLM call that could
# answer differently. (Tommy sends building_id only on confirm, so the key can't include it.)
# ---------------------------------------------------------------------------
_SORTED_TTL_S = 600
_SORTED_MAX = 500
_sorted: dict[str, tuple[float, Classification, list[float] | None]] = {}


def _classify_cached(text: str, buildings: list[dict]) -> tuple[Classification, list[float] | None]:
    hit = _sorted.get(text)
    if hit and time.monotonic() - hit[0] < _SORTED_TTL_S:
        return hit[1], hit[2]

    result = classify(text, buildings)
    # Safety reports never become tickets, so they need no embedding.
    embedding = None if result.is_safety else embed_text(result.summary)

    # Keyword-rule answers are a fallback for an LLM hiccup: don't pin them for 10 minutes.
    if result.engine == "llm" or not settings.llm_model:
        if len(_sorted) >= _SORTED_MAX:
            _sorted.clear()
        _sorted[text] = (time.monotonic(), result, embedding)
    return result, embedding


def _sort_report(req: ComplaintRequest) -> tuple[Classification, dict | None, list[float] | None]:
    """(classification, building row or None, summary embedding or None)."""
    buildings = store.list_buildings()
    cached, embedding = _classify_cached(req.text, buildings)
    result = replace(cached)  # copy: the request's own fields must not leak into the cache

    # What the student picked in the form wins over what the AI read from the text.
    if req.building_id:
        building = next((b for b in buildings if b["id"] == req.building_id), None)
        if not building:
            raise _error(422, "unknown_building", "building_id is not a known building")
        result.building_code = building["code"]
    else:
        named = find_building(req.building, buildings) if req.building else None
        if named:
            result.building_code = named
        building = next((b for b in buildings if b["code"] == result.building_code), None)
    if req.room and req.room.strip():
        result.room = req.room.strip().upper()[:20]
    return result, building, embedding


def _draft(result: Classification, building: dict | None) -> dict:
    return {
        "department": result.department,
        "category": result.category,
        "urgency": result.urgency,
        "building": result.building_code,
        "building_id": building["id"] if building else None,
        "room": result.room,
        "summary": result.summary,
        "confidence": result.confidence,
        "reason": result.reason,
    }


def _handle_complaint(req: ComplaintRequest, user_id: str) -> dict:
    result, building, embedding = _sort_report(req)
    draft = _draft(result, building)

    if result.is_safety:  # show DPS contact info; never create a ticket
        return {"draft": draft, "safety": {"dps_phone": settings.dps_emergency_phone, "message": SAFETY_MESSAGE}}

    building_id = building["id"] if building else None
    duplicate = find_duplicate(embedding=embedding, building_id=building_id, room=result.room, category=result.category)

    if not req.confirm:
        response: dict = {"draft": draft}
        if duplicate:
            response["duplicate_ticket"] = {"id": duplicate["id"], "report_count": duplicate["report_count"]}
        return response

    reporter_id = None if req.anonymous else user_id
    route = find_route(result.department, result.category)
    route_url, forwarded_to = build_route(
        route, department=result.department, summary=result.summary,
        building_code=result.building_code, room=result.room, urgency=result.urgency,
    )

    if duplicate:
        ticket = duplicate
        # The same student reporting the same problem again must not inflate the count.
        if reporter_id and store.has_reported(ticket["id"], reporter_id):
            return {"ticket": ticket, "route_url": ticket.get("route_url")}
        ticket = store.add_report(ticket["id"]) or ticket
    else:
        ticket = store.insert_ticket({
            "building_id": building_id,
            "room": result.room,
            "department": result.department,
            "category": result.category,
            "urgency": result.urgency,
            "summary": result.summary,
            # "sent" = routed to the office's own form or email. No route on file -> stays "reported".
            "status": "sent" if route_url else "reported",
            "route_url": route_url,
            "embedding": embedding,
        })

    store.insert_complaint({
        "ticket_id": ticket["id"],
        "reporter_id": reporter_id,
        "raw_text": req.text,
        "room": result.room,
        "building_id": building_id,
        "source": req.source,
        "ai_department": result.department,
        "ai_confidence": result.confidence,
        "ai_reason": result.reason,
        "forwarded_to": forwarded_to,
        "forwarded_at": datetime.now(timezone.utc).isoformat() if forwarded_to else None,
    })
    return {"ticket": ticket, "route_url": ticket.get("route_url")}


def _my_complaints(user_id: str) -> dict:
    rows = store.complaints_for(user_id)
    return {"complaints": [{"complaint": {k: v for k, v in row.items() if k != "ticket"}, "ticket": row.get("ticket")} for row in rows]}


def _upvote(ticket_id: str) -> dict:
    try:
        uuid.UUID(ticket_id)
    except ValueError:
        raise _error(404, "not_found", "Ticket not found") from None
    ticket = store.add_report(ticket_id)
    if not ticket:
        raise _error(404, "not_found", "Ticket not found")
    return {"report_count": ticket["report_count"]}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/complaints")
async def create_complaint(req: ComplaintRequest, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        if _SAFETY_WORDS.search(req.text.lower()):
            return load_mock("complaints_safety")  # never creates a ticket
        return load_mock("complaints_confirm" if req.confirm else "complaints_draft")

    req.text = req.text.strip()
    if not req.text:
        raise _error(422, "empty_text", "Describe the problem in a sentence.")
    if len(req.text) > MAX_TEXT_CHARS:
        raise _error(422, "text_too_long", f"Keep the report under {MAX_TEXT_CHARS} characters.")
    return await _run(_handle_complaint, req, user_id)


@router.get("/complaints/mine")
async def my_complaints(user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("complaints_mine")
    return await _run(_my_complaints, user_id)


@router.post("/tickets/{ticket_id}/upvote")
async def upvote_ticket(ticket_id: str, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("tickets_upvote")
    return await _run(_upvote, ticket_id)
