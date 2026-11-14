"""P4 Jaymin: Smart Complaints (ARCHITECTURE.md §6, §7.4).

POST /complaints            {text, building_id?, room?, anonymous?, confirm?, source?}
GET  /complaints/mine
POST /tickets/{id}/upvote

Mock mode serves packages/shared/mocks/complaints_*.json. classify.py / dedupe.py / routing.py
go next to this file.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock, not_built

router = APIRouter(tags=["complaints (P4)"])
OWNER = "P4 Jaymin"

_SAFETY_WORDS = re.compile(r"\b(gas|smoke|fire|hurt|injured|bleeding|weapon|gun|threat|unsafe|assault)\b")


class ComplaintRequest(BaseModel):
    text: str
    building_id: str | None = None
    room: str | None = None
    anonymous: bool = False
    confirm: bool = False
    source: Literal["chat", "form"] = "form"


@router.post("/complaints")
async def create_complaint(req: ComplaintRequest, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        if _SAFETY_WORDS.search(req.text.lower()):
            return load_mock("complaints_safety")  # never creates a ticket
        return load_mock("complaints_confirm" if req.confirm else "complaints_draft")
    raise not_built(OWNER)


@router.get("/complaints/mine")
async def my_complaints(user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("complaints_mine")
    raise not_built(OWNER)


@router.post("/tickets/{ticket_id}/upvote")
async def upvote_ticket(ticket_id: str, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("tickets_upvote")
    raise not_built(OWNER)
