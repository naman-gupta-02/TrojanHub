"""P2 Vishwa: Lost & Found (ARCHITECTURE.md §6, §7.2).

POST /items                    multipart {photo, kind, description?, building_id?, location_text?}
GET  /items/search             ?q=&building_id=
POST /items/search-by-image    multipart {photo}
POST /items/{id}/claim

Mock mode serves packages/shared/mocks/items_*.json. Replace each `if settings.mock("lostfound")` branch
with the real logic (clip.py, tiers.py) when it's ready; keep the response shapes from types.ts.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock, not_built

router = APIRouter(tags=["lost & found (P2)"])
OWNER = "P2 Vishwa"

_VALUABLE_WORDS = re.compile(r"\b(airpods?|earbuds?|phone|iphone|laptop|macbook|tablet|ipad|wallet|id|keys?|card|watch|glasses)\b")
_VALUABLE_ITEM_ID = "c0000000-0000-0000-0000-000000000002"


@router.post("/items")
async def create_item(
    kind: Literal["found", "lost"] = Form(...),
    photo: UploadFile | None = File(None),
    description: str | None = Form(None),
    building_id: str | None = Form(None),
    location_text: str | None = Form(None),
    user_id: str = Depends(get_user_id),
) -> dict:
    if settings.mock("lostfound"):
        valuable = bool(description and _VALUABLE_WORDS.search(description.lower()))
        return load_mock("items_create_valuable" if valuable else "items_create")
    raise not_built(OWNER)


@router.get("/items/search")
async def search_items(q: str, building_id: str | None = None, user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("lostfound"):
        return load_mock("items_search")
    raise not_built(OWNER)


@router.post("/items/search-by-image")
async def search_items_by_image(photo: UploadFile = File(...), user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("lostfound"):
        return load_mock("items_search")
    raise not_built(OWNER)


@router.post("/items/{item_id}/claim")
async def claim_item(item_id: str, user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("lostfound"):
        return load_mock("items_claim_valuable" if item_id == _VALUABLE_ITEM_ID else "items_claim")
    raise not_built(OWNER)
