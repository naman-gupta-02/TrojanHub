"""Search Lost & Found by words or by photo (P2, ARCHITECTURE.md §6, §7.2).

Typed search understands meaning, not just keywords. Score 0..1 per item:
- item with a photo:    0.60 x picture match + 0.25 x meaning match + 0.15 x keywords
- item without a photo: 0.75 x meaning match + 0.25 x keywords
- + 0.1 if it was found in the building the owner names; capped at 1.

picture match = CLIP(query words, item photo): "transparent" finds a clear bottle from the photo alone.
meaning match = sentence model (semantic.py) on the item's title + description:
                "spectacles" ~ "glasses", "puffer coat" ~ "jacket", "student card" ~ "ID card".
keywords      = share of the query's meaningful words found in the title + description (brands,
                details like "JanSport", "Trojan keychain").
Filler ("lost my", "anyone find", "at Leavey") is stripped first; the building, even misspelled
("leavy"), counts through the building bonus instead.
If the sentence model can't load, CLIP compares the words with the description instead.

Photo search compares the photos (and descriptions for items without one) with CLIP.
Only open, unexpired found items are searched, including items posted without a photo. Top 10.
The `match_items` SQL function skips items without a photo and doesn't check expiry, so this ranks
in Python instead. Fine for a few hundred items; move to SQL if it grows.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import numpy as np

from app.core.supabase import get_supabase
from app.lostfound import clip, semantic
from app.lostfound.items import MAX_UPLOAD_BYTES, ItemError, _buildings, match_building, public_item, similar_word

TOP_K = 10
MIN_SCORE = 0.3  # below this it's almost surely a different item; "no match" beats a wrong one
BUILDING_BONUS = 0.1

# Typed search, with the sentence model
W_PHOTO, W_MEANING, W_KEYWORDS = 0.60, 0.25, 0.15  # item with a photo
W_MEANING_ONLY, W_KEYWORDS_ONLY = 0.75, 0.25  # item without a photo
# Fallback without the sentence model (CLIP for words-vs-description)
FB_PHOTO, FB_DESC, FB_KEYWORDS = 0.70, 0.30, 0.25
FB_DESC_ONLY, FB_KEYWORDS_ONLY = 0.50, 0.50

# Words that say nothing about the item itself.
_FILLER = {
    "lost", "lose", "losing", "missing", "misplaced", "left", "forgot", "my", "mine", "a", "an", "the", "i", "me",
    "did", "does", "do", "anyone", "anybody", "someone", "somebody", "find", "found", "see", "seen", "saw", "has",
    "have", "had", "please", "help", "with", "at", "in", "on", "near", "by", "of", "for", "to", "from", "it", "its",
    "is", "was", "this", "that", "any", "some", "and", "or", "around", "today", "yesterday",
}

# Raw similarities sit on different scales depending on what's compared. Each is mapped to 0..1
# with (low, high): low ~ a typical non-match, high ~ a strong match. Measured 2026-11-14: CLIP on
# 10 item types x 2 photos; meaning on 20 everyday phrasings vs the 15 demo items (non-match mean
# 0.19, match mean 0.57). Retune with real phone photos.
SCALES = {
    "text>photo": (0.13, 0.35),
    "text>desc": (0.56, 0.90),
    "photo>photo": (0.33, 0.80),
    "photo>desc": (0.11, 0.35),
    "meaning": (0.20, 0.70),
}


def _scaled(kind: str, sim: float) -> float:
    lo, hi = SCALES[kind]
    return float(np.clip((sim - lo) / (hi - lo), 0.0, 1.0))


def _stem(word: str) -> str:
    """Tiny plural folding so "keys" ~ "key" and "glasses" ~ "glass"."""
    if len(word) > 4 and word.endswith(("ses", "xes")):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _words(text: str | None) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in _FILLER and len(w) > 1}


def _building_words(building_id: str | None) -> set[str]:
    for b in _buildings() if building_id else ():
        if b["id"] == building_id:
            return _words(f"{b['code']} {b['name']}")
    return set()


def _keyword_score(query_words: set[str], row: dict) -> float:
    if not query_words:
        return 0.0
    return len(query_words & _words(f"{row.get('title')} {row.get('description')}")) / len(query_words)


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


def _results(scored: list[tuple[float, dict]], building_id: str | None) -> dict:
    out = []
    for score, row in scored:
        if building_id and row.get("building_id") == building_id:
            score += BUILDING_BONUS
        score = min(1.0, score)
        if score >= MIN_SCORE:
            out.append((score, row))
    out.sort(key=lambda s: s[0], reverse=True)
    return {"results": [{"item": public_item(row), "score": round(score, 2)} for score, row in out[:TOP_K]]}


def _rank_words(clip_query: np.ndarray, meaning_query: np.ndarray | None, query_words: set[str], building_id: str | None) -> dict:
    rows = _open_found_items()
    meanings = semantic.item_vectors(rows) if meaning_query is not None else None
    scored = []
    for row in rows:
        img = _vec(row.get("img_embedding"))
        p = _scaled("text>photo", float(clip_query @ img)) if img is not None else None
        k = _keyword_score(query_words, row)
        if meanings is not None:
            m = _scaled("meaning", float(meaning_query @ meanings[row["id"]]))
            score = W_PHOTO * p + W_MEANING * m + W_KEYWORDS * k if p is not None else W_MEANING_ONLY * m + W_KEYWORDS_ONLY * k
        else:  # no sentence model: CLIP compares the words with the description
            txt = _vec(row.get("text_embedding"))
            t = _scaled("text>desc", float(clip_query @ txt)) if txt is not None else 0.0
            score = FB_PHOTO * p + FB_DESC * t + FB_KEYWORDS * k if p is not None else FB_DESC_ONLY * t + FB_KEYWORDS_ONLY * k
        scored.append((score, row))
    return _results(scored, building_id)


def _rank_photo(query: np.ndarray) -> dict:
    scored = []
    for row in _open_found_items():
        img, txt = _vec(row.get("img_embedding")), _vec(row.get("text_embedding"))
        p = _scaled("photo>photo", float(query @ img)) if img is not None else None
        t = _scaled("photo>desc", float(query @ txt)) if txt is not None else None
        if p is None and t is None:
            continue
        scored.append((FB_PHOTO * p + FB_DESC * (t or 0.0) if p is not None else t, row))
    return _results(scored, None)


def search_text(q: str, building_id: str | None = None) -> dict:
    """GET /items/search. The building can come as an id or inside the words ("...at Leavey"),
    which is how Tommy's search_lost_items tool sends it."""
    q = (q or "").strip()
    if not q:
        raise ItemError(422, "missing_query", "Describe the item you lost, e.g. 'black Hydro Flask'.")
    building_id = building_id or match_building(q)

    # "lost my airpods at Leavey" -> "airpods" (the building counts through BUILDING_BONUS instead)
    bwords = _building_words(building_id)

    def keep(word: str) -> bool:
        w = word.lower()
        if w in _FILLER or w in bwords or _stem(w) in bwords:
            return False
        return not any(similar_word(w, b) for b in bwords)  # "leavy" ~ "leavey"

    cleaned = " ".join(w for w in re.findall(r"[A-Za-z0-9'-]+", q) if keep(w)) or q
    meaning = semantic.embed([cleaned])
    return _rank_words(
        clip.embed_text(f"a photo of {cleaned}"),
        meaning[0] if meaning is not None else None,
        _words(cleaned) - bwords,
        building_id,
    )


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
    return _rank_photo(vec)
