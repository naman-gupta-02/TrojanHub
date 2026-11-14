"""P1 Naman: Tommy chat (ARCHITECTURE.md §6, §7.1).

POST /chat           {session_id, message, image_url?} -> SSE stream
POST /chat/confirm   {session_id, action_id, approved, edits?}

Phase 0: with USE_MOCKS=true both endpoints serve packages/shared/mocks/chat_stream.json,
so the chat UI (mobile + web) can be built before the real agent exists.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock

router = APIRouter(tags=["chat (P1)"])

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


@router.post("/chat")
async def chat(req: ChatRequest, user_id: str = Depends(get_user_id)) -> StreamingResponse:
    if not settings.use_mocks:
        # TODO(P1, Phase 1): agent loop -> LLM + tools -> stream tokens/sources.
        raise HTTPException(501, detail={"code": "not_implemented", "message": "Real agent not built yet"})
    return StreamingResponse(
        _mock_stream(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chat/confirm")
async def chat_confirm(req: ConfirmRequest, user_id: str = Depends(get_user_id)) -> dict:
    if not settings.use_mocks:
        # TODO(P1, Phase 2): look up the pending draft by action_id and call the owner's endpoint.
        raise HTTPException(501, detail={"code": "not_implemented", "message": "Confirm not built yet"})
    if not req.approved:
        return {"action_id": req.action_id, "status": "cancelled", "message": "No problem, I didn't file anything."}
    mock = {k: v for k, v in load_mock("chat_stream")["confirm_response"].items() if not k.startswith("_")}
    return {**mock, "action_id": req.action_id}
