"""P2 Vishwa: Lost & Found (ARCHITECTURE.md §6, §7.2).

POST /items                    multipart {photo, kind, description?, building_id?, location_text?}
GET  /items/search             ?q=&building_id=
POST /items/search-by-image    multipart {photo}
POST /items/{id}/claim

While settings.mock("lostfound") is true (USE_MOCKS=true and "lostfound" not in REAL_FEATURES),
these serve packages/shared/mocks/items_*.json. Otherwise the real logic runs: items.py (post),
search.py (search), claim.py (claim). Response shapes follow types.ts.
Lost & Found is for signed-in USC students (items are only readable when signed in, see RLS);
posting and claiming always need a sign-in, even while mocked.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.auth import get_user_id, require_signed_in
from app.core.config import settings
from app.core.mocks import load_mock
from app.lostfound import claim, items, search, warmup

router = APIRouter(tags=["lost & found (P2)"])
warmup.start()  # real mode: load CLIP + the sentence model now, not on the first request

_VALUABLE_WORDS = re.compile(r"\b(airpods?|earbuds?|phone|iphone|laptop|macbook|tablet|ipad|wallet|id|keys?|card|watch|glasses)\b")
_VALUABLE_ITEM_ID = "c0000000-0000-0000-0000-000000000002"


@router.post("/items")
async def create_item(
    kind: Literal["found", "lost"] = Form(...),
    photo: UploadFile | None = File(None),
    description: str | None = Form(None),
    building_id: str | None = Form(None),
    location_text: str | None = Form(None),
    user_id: str = Depends(require_signed_in),  # posting always needs a USC sign-in
) -> dict:
    if settings.mock("lostfound"):
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
    if settings.mock("lostfound"):
        return load_mock("items_search")
    try:
        return await run_in_threadpool(search.search_text, q, building_id, user_id)
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e


@router.post("/items/search-by-image")
async def search_items_by_image(photo: UploadFile = File(...), user_id: str = Depends(get_user_id)) -> dict:
    if settings.mock("lostfound"):
        return load_mock("items_search")
    photo_bytes = await photo.read()
    try:
        return await run_in_threadpool(search.search_photo, photo_bytes, user_id)
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e


@router.post("/items/{item_id}/claim")
async def claim_item(item_id: str, user_id: str = Depends(require_signed_in)) -> dict:
    if settings.mock("lostfound"):
        return load_mock("items_claim_valuable" if item_id == _VALUABLE_ITEM_ID else "items_claim")
    try:
        return await run_in_threadpool(claim.claim_item, item_id, user_id)
    except items.ItemError as e:
        raise HTTPException(e.status, detail={"code": e.code, "message": e.message}) from e
