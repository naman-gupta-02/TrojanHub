"""P1 Naman: Tommy chat (ARCHITECTURE.md §6, §7.1).

POST /chat           {session_id, message, image_url?} -> SSE stream
POST /chat/confirm   {session_id, action_id, approved, edits?}

Guests: a visitor who isn't signed in can still chat (CHAT_GUESTS=0 turns this off). They get
the read-only tools (USC answers, events, deals, lost-item search); anything that saves or posts
asks them to sign in first (tools/runner.py). Guests are limited to GUEST_LIMIT messages an hour
per IP, so a public demo can't run up the LLM bill.

Real agent when LLM_MODEL is set (its tools call the other endpoints, which may still be
mocks). With no LLM configured, /chat streams packages/shared/mocks/chat_stream.json so the chat
UI can be built anyway.
"""

import asyncio
import json
import os
import re
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.chat import store
from app.chat.agent import run_turn
from app.chat.tools.base import GUEST_USER_ID
from app.chat.tools.runner import run_confirmed
from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock

router = APIRouter(tags=["chat (P1)"])


def _warm_up() -> None:
    """Load the embedding model and index now, so the first question isn't ~10 s slower."""
    try:
        from app.rag.retrieve import retrieve

        retrieve("warm up")
    except Exception as e:  # noqa: BLE001 - e.g. no index built yet
        print(f"[chat] warm-up skipped: {e}")


if settings.llm_model and os.getenv("CHAT_WARMUP", "1") != "0":
    threading.Thread(target=_warm_up, daemon=True, name="tommy-warmup").start()

CHAT_GUESTS = os.getenv("CHAT_GUESTS", "1") != "0"
GUEST_LIMIT = int(os.getenv("CHAT_GUEST_LIMIT", "30"))  # messages per hour per IP
_guest_hits: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")  # Replit sits behind a proxy
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _guest_allowed(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _guest_hits.get(ip, []) if now - t < 3600]
    if len(hits) >= GUEST_LIMIT:
        _guest_hits[ip] = hits
        return False
    _guest_hits[ip] = [*hits, now]
    return True


async def chat_user(request: Request, authorization: str | None = Header(default=None)) -> str:
    """The signed-in student, or a guest when nobody is signed in (instead of a 401)."""
    if override := request.app.dependency_overrides.get(get_user_id):  # tests that "log in"
        return override()
    try:
        return await get_user_id(request, authorization)
    except HTTPException as e:
        if e.status_code != 401 or authorization or not CHAT_GUESTS:
            raise  # a bad or expired token still means "sign in again"
    if not _guest_allowed(_client_ip(request)):
        raise HTTPException(429, detail={"code": "rate_limited",
                                         "message": "Guests can send a few messages an hour. Sign in to keep chatting."})
    return GUEST_USER_ID


MOCK_TOKEN_DELAY = 0.05  # seconds between events, so the UI can show streaming


class ChatRequest(BaseModel):
    session_id: str
    message: str
    image_url: str | None = None


class ConfirmRequest(BaseModel):
    session_id: str
    action_id: str
    approved: bool
    edits: dict[str, Any] | None = None


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _pick_scenario(message: str, image_url: str | None) -> list[dict]:
    """First scenario with a whole-word match wins (so "photo" doesn't match "hot")."""
    scenarios = load_mock("chat_stream")["scenarios"]
    if image_url and "flyer" in scenarios:
        return scenarios["flyer"]["events"]
    text = message.lower()
    for name, s in scenarios.items():
        if name != "no_answer" and any(re.search(rf"\b{re.escape(w)}\b", text) for w in s["match"]):
            return s["events"]
    return scenarios["no_answer"]["events"]


async def _mock_stream(req: ChatRequest) -> AsyncIterator[str]:
    for event in _pick_scenario(req.message, req.image_url):
        if event["type"] == "done":
            event = {**event, "session_id": req.session_id}
        yield _sse(event)
        await asyncio.sleep(MOCK_TOKEN_DELAY)


async def _agent_stream(req: ChatRequest, user_id: str, authorization: str | None) -> AsyncIterator[str]:
    async for event in run_turn(req.session_id, req.message, user_id, authorization, req.image_url):
        yield _sse(event)


def _agent_enabled() -> bool:
    return bool(settings.llm_model)


@router.post("/chat")
async def chat(
    req: ChatRequest, user_id: str = Depends(chat_user), authorization: str | None = Header(default=None)
) -> StreamingResponse:
    stream = _agent_stream(req, user_id, authorization) if _agent_enabled() else _mock_stream(req)
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/chat/confirm")
async def chat_confirm(req: ConfirmRequest, user_id: str = Depends(get_user_id)) -> dict:
    action = store.pop_pending(req.action_id, req.session_id, user_id)
    if action is None:
        if not _agent_enabled():  # mock chat stream -> mock confirm
            if not req.approved:
                return {"action_id": req.action_id, "status": "cancelled", "message": "No problem, I didn't file anything."}
            data = load_mock("chat_stream")
            mock = data.get("confirm_responses", {}).get(req.action_id) or data["confirm_response"]
            return {**{k: v for k, v in mock.items() if not k.startswith("_")}, "action_id": req.action_id}
        raise HTTPException(404, detail={"code": "not_found", "message": "That card expired. Ask Tommy again."})

    if not req.approved:
        store.remember(req.session_id, {"role": "assistant", "content": f"(The student cancelled the {action.tool} draft.)"})
        return {"action_id": req.action_id, "status": "cancelled", "message": "No problem, I didn't do anything."}

    status, result = await run_confirmed(action, req.edits)
    message = (result.get("message") or (result.get("error") or {}).get("message")
               or ("Done!" if status == "done" else "That didn't work."))
    store.remember(req.session_id, {"role": "assistant", "content": f"({action.tool} confirmed: {message})"})
    return {"action_id": req.action_id, "status": status, "message": message, "result": result}
