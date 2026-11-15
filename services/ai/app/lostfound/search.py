"""Search Lost & Found by words or by photo (P2, ARCHITECTURE.md §6, §7.2).

Score = 0.7 x (match with the item's photo) + 0.3 x (match with its description)
        + 0.1 if it was found in the building the owner names.
Only open, unexpired found items are searched, including items posted without a photo (those
are scored on their description alone). Top 10, best first.

Note: the `match_items` SQL function skips items without a photo and doesn't check expiry, so
this ranks in Python instead. Fine for a few hundred items; move to SQL if it grows.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np

from app.core.supabase import get_supabase
from app.lostfound import clip
from app.lostfound.items import MAX_UPLOAD_BYTES, ItemError, match_building, public_item

TOP_K = 10
MIN_SCORE = 0.2  # below this it's almost surely a different item; "no match" beats a wrong one
BUILDING_BONUS = 0.1
W_PHOTO, W_TEXT = 0.7, 0.3

# Raw CLIP similarities sit on different scales depending on what's compared (a description
# that doesn't match scores higher than a photo that does). Each is mapped to 0..1 with
# (low, high): low ~ a typical non-match, high ~ a strong match. Measured 2026-11-14 on 10 item
# types x 2 photos each (try_tiers samples); retune with real phone photos.
SCALES = {
    "text>photo": (0.13, 0.35),
    "text>desc": (0.56, 0.90),
    "photo>photo": (0.33, 0.80),
    "photo>desc": (0.11, 0.35),
}


def _scaled(kind: str, sim: float) -> float:
    lo, hi = SCALES[kind]
    return float(np.clip((sim - lo) / (hi - lo), 0.0, 1.0))


def _vec(value) -> np.ndarray | None:
    """pgvector comes back from PostgREST as the text '[0.1,...]'."""
    if value is None:
        return None
    return np.asarray(json.loads(value) if isinstance(value, str) else value, dtype=np.float32)


def _open_found_items() -> list[dict]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    res = (
        get_supabase()
        .table("items")
        .select("*")
        .eq("status", "open")
        .eq("kind", "found")
        .or_(f"expires_at.is.null,expires_at.gt.{now}")
        .execute()
    )
    return res.data or []


def _rank(query: np.ndarray, *, from_photo: bool, building_id: str | None) -> dict:
    src = "photo" if from_photo else "text"
    scored: list[tuple[float, dict]] = []
    for row in _open_found_items():
        img, txt = _vec(row.get("img_embedding")), _vec(row.get("text_embedding"))
        p = _scaled(f"{src}>photo", float(query @ img)) if img is not None else None
        t = _scaled(f"{src}>desc", float(query @ txt)) if txt is not None else None
        if p is not None and t is not None:
            score = W_PHOTO * p + W_TEXT * t
        elif p is not None or t is not None:
            score = p if p is not None else t
        else:
            continue
        if building_id and row.get("building_id") == building_id:
            score = min(1.0, score + BUILDING_BONUS)
        if score >= MIN_SCORE:
            scored.append((score, row))
    scored.sort(key=lambda s: s[0], reverse=True)
    return {"results": [{"item": public_item(row), "score": round(score, 2)} for score, row in scored[:TOP_K]]}


def search_text(q: str, building_id: str | None = None) -> dict:
    """GET /items/search. The building can come as an id or inside the words ("...at Leavey"),
    which is how Tommy's search_lost_items tool sends it."""
    q = (q or "").strip()
    if not q:
        raise ItemError(422, "missing_query", "Describe the item you lost, e.g. 'black Hydro Flask'.")
    building_id = building_id or match_building(q)
    return _rank(clip.embed_text(f"a photo of {q}"), from_photo=False, building_id=building_id)


def search_photo(photo: bytes) -> dict:
    """POST /items/search-by-image: an old photo of your item -> similar found items."""
    if not photo:
        raise ItemError(422, "missing_photo", "Add a photo of the item you lost.")
    if len(photo) > MAX_UPLOAD_BYTES:
        raise ItemError(413, "photo_too_large", "That photo is over 10 MB. Try a smaller one.")
    try:
        vec = clip.embed_image(photo)
    except ValueError as e:
        raise ItemError(400, "bad_photo", str(e)) from e
    return _rank(vec, from_photo=True, building_id=None)
