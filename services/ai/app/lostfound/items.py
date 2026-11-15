"""Posting a Lost & Found item for real (P2, ARCHITECTURE.md §6 POST /items, §7.2).

photo -> shrink + save to Storage -> CLIP tier + embeddings -> building from words -> items row.
Everything here is blocking (CLIP on CPU, Supabase over HTTP), so routes.py runs it in a thread.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from functools import lru_cache

import numpy as np

from app.core.supabase import get_supabase
from app.lostfound import clip, tiers
from app.lostfound.dropoff import pick_dropoff

log = logging.getLogger(__name__)

BUCKET = "photos"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_SIDE = 1280  # px; plenty for a phone screen, keeps Storage small
EVERYDAY_DAYS = 14  # items left where they were found drop out of search after this
DPS_DAYS = 90  # "Found items are kept for a total of 90 days" (dps.usc.edu/services/lost-and-found)
# Photos of these show names, faces or card numbers, so they're never saved (the AI still uses the
# photo once to sort and index the item).
NEVER_STORE_PHOTO = {"ID card", "Credit card"}
EMBEDDING_COLUMNS = ("img_embedding", "text_embedding")


class ItemError(Exception):
    """A problem with the request itself. routes.py turns it into {error: {code, message}}."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---------------------------------------------------------------------------
# Building from free text: "Leavey Library, 2nd floor" -> Leavey Library's id
# ---------------------------------------------------------------------------
# Words that appear in many building names, so they don't identify one.
_GENERIC = {"hall", "library", "building", "of", "the", "and", "&", "usc", "memorial", "g."}


@lru_cache(maxsize=1)
def _buildings() -> tuple[dict, ...]:
    rows = get_supabase().table("buildings").select("id, code, name").execute().data or []
    return tuple(rows)


def similar_word(a: str, b: str) -> bool:
    """Typo-tolerant match for place names: "leavy" ~ "leavey", "dohenny" ~ "doheny".
    Only for words of 5+ letters with the same first letter, and very close spelling
    (so "paper" doesn't match "taper")."""
    a, b = a.lower(), b.lower()
    if a == b:
        return True
    if len(a) < 4 or len(b) < 5 or a[0] != b[0]:
        return False
    return SequenceMatcher(None, a, b).ratio() > 0.85


def match_building(text: str | None) -> str | None:
    """Best building for a place description, or None if nothing (or a tie) matches.
    Codes must match exactly ("SAL"); name words may have small typos ("leavy library")."""
    if not text:
        return None
    words = set(re.findall(r"[a-z0-9.&]+", text.lower()))
    scores: dict[str, float] = {}
    for b in _buildings():
        score = 3.0 if b["code"].lower() in words else 0.0
        for w in b["name"].lower().split():
            if w in words:
                score += 0.1 if w in _GENERIC else 1.0  # generic words only break ties ("Tutor Hall")
            elif w not in _GENERIC and any(similar_word(q, w) for q in words):
                score += 0.9  # a close misspelling counts a bit less than the exact word
        if score >= 0.9:
            scores[b["id"]] = score
    if not scores:
        return None
    best = max(scores.values())
    winners = [bid for bid, s in scores.items() if s == best]
    return winners[0] if len(winners) == 1 else None


# ---------------------------------------------------------------------------
# Photo -> Storage
# ---------------------------------------------------------------------------
def _to_jpeg(img) -> bytes:
    img = img.copy()
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _upload_photo(item_id: str, jpeg: bytes) -> tuple[str, str]:
    """Returns (storage path, public URL)."""
    path = f"items/{item_id}.jpg"
    bucket = get_supabase().storage.from_(BUCKET)
    bucket.upload(path, jpeg, {"content-type": "image/jpeg"})
    return path, bucket.get_public_url(path).rstrip("?")


def _vector_literal(vec: np.ndarray) -> str:
    """pgvector's text format: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.6f}" for x in vec.tolist()) + "]"


def public_item(row: dict) -> dict:
    """DB row -> Item for clients (embeddings are server-only, types.ts)."""
    return {k: v for k, v in row.items() if k not in EMBEDDING_COLUMNS}


def item_for(row: dict, viewer_id: str | None) -> dict:
    """What `viewer_id` may see of an item.

    Items at DPS (tier "valuable") hide their photo, description and exact spot from everyone but
    the finder: the real owner proves it's theirs by describing it to DPS, so we don't hand out
    the answers. Only the type ("AirPods") and the building stay visible. Search still uses the
    photo and description behind the scenes.
    """
    item = public_item(row)
    if item.get("tier") == "valuable" and item.get("posted_by") != viewer_id:
        item["photo_url"] = None
        item["description"] = None
        if item.get("building_id"):
            item["location_text"] = None  # the building name is enough to say where it was found
    return item


# ---------------------------------------------------------------------------
# POST /items
# ---------------------------------------------------------------------------
def create_item(
    *,
    user_id: str,
    kind: str,
    photo: bytes | None,
    description: str | None,
    building_id: str | None,
    location_text: str | None,
) -> dict:
    description = (description or "").strip() or None
    location_text = (location_text or "").strip() or None
    if not photo and not description:
        raise ItemError(422, "missing_input", "Add a photo or a short description of the item.")
    if photo and len(photo) > MAX_UPLOAD_BYTES:
        raise ItemError(413, "photo_too_large", "That photo is over 10 MB. Try a smaller one.")

    # 1. AI: tier + title + embeddings
    img = None
    if photo:
        try:
            img = clip.open_image(photo)
        except ValueError as e:
            raise ItemError(400, "bad_photo", str(e)) from e
        img_vec = clip.embed_pil(img)
        result = tiers.classify_vector(img_vec)
    else:
        img_vec = None
        result = tiers.classify_text(description)
    text_vec = clip.embed_text(f"a photo of {description or result.title}")

    # 2. Where it was found
    building_id = building_id or match_building(location_text)

    # 3. Rules. tier is where the item is now (the finder can switch it right after posting):
    #    valuable -> taken to DPS (kept there 90 days); everyday -> left where it was found (14 days)
    item_id = str(uuid.uuid4())
    dropoff_point_id, dropoff = (None, None)
    if kind == "found" and result.tier == "valuable":
        dropoff_point_id, dropoff = pick_dropoff(building_id)
    days = DPS_DAYS if result.tier == "valuable" else EVERYDAY_DAYS
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    # 4. Save the photo, then the row (remove the photo again if the row fails)
    photo_path, photo_url = (None, None)
    if img is not None and result.title not in NEVER_STORE_PHOTO:
        photo_path, photo_url = _upload_photo(item_id, _to_jpeg(img))

    row = {
        "id": item_id,
        "kind": kind,
        "tier": result.tier,
        "title": result.title,
        "description": description,
        "photo_url": photo_url,
        "img_embedding": _vector_literal(img_vec) if img_vec is not None else None,
        "text_embedding": _vector_literal(text_vec),
        "building_id": building_id,
        "location_text": location_text,
        "dropoff_point_id": dropoff_point_id,
        "posted_by": user_id,
        "expires_at": expires_at,
    }
    try:
        saved = get_supabase().table("items").insert(row).execute().data[0]
    except Exception:
        if photo_path:
            try:
                get_supabase().storage.from_(BUCKET).remove([photo_path])
            except Exception:  # noqa: BLE001 - best effort cleanup
                log.warning("Could not remove orphan photo %s", photo_path)
        raise

    log.info("Item %s: %s %s (conf %.2f, top %s)", item_id, result.tier, result.title, result.confidence, result.top)
    response = {"item": public_item(saved), "tier": result.tier, "ask_tier": result.ask_tier}
    if dropoff:
        response["dropoff"] = dropoff
    return response
