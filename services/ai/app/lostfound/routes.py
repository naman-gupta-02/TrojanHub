"""P2 Vishwa: Lost & Found (ARCHITECTURE.md §6, §7.2).

POST /items                    multipart {photo, kind, description?, building_id?, location_text?}
GET  /items/search             ?q=&building_id=
POST /items/search-by-image    multipart {photo}
POST /items/{id}/claim

Mock mode serves packages/shared/mocks/items_*.json. Replace each `if settings.use_mocks` branch
with the real logic (clip.py, tiers.py) when it's ready; keep the response shapes from types.ts.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.auth import get_user_id
from app.core.config import settings
from app.core.mocks import load_mock, not_built
from app.lostfound import items, search

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
    if settings.use_mocks:
        valuable = bool(description and _VALUABLE_WORDS.search(description.lower()))
        return load_mock("items_create_valuable" if valuable else "items_create")

    photo_bytes = await photo.read() if photo else None
    try:
        # CLIP + Supabase calls block, so they run in a worker thread, not on the event loop
        return await run_in_threadpool(
            items.create_item,
            user_id=user_id,
            kind=kind,
            photo=photo_bytes or None,
            description=description,
            building_id=building_id,
            location_text=location_text,
        )
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e


@router.get("/items/search")
async def search_items(q: str, building_id: str | None = None, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("items_search")
    try:
        return await run_in_threadpool(search.search_text, q, building_id)
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e


@router.post("/items/search-by-image")
async def search_items_by_image(photo: UploadFile = File(...), user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("items_search")
    photo_bytes = await photo.read()
    try:
        return await run_in_threadpool(search.search_photo, photo_bytes)
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e


@router.post("/items/{item_id}/claim")
async def claim_item(item_id: str, user_id: str = Depends(get_user_id)) -> dict:
    if settings.use_mocks:
        return load_mock("items_claim_valuable" if item_id == _VALUABLE_ITEM_ID else "items_claim")
    raise not_built(OWNER)
