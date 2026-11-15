"""Meaning-based text matching for Lost & Found search (P2).

CLIP is great at words-vs-photo but weak at words-vs-words ("umbrella" scored closer to "brown
leather wallet" than to "navy compact umbrella"). A sentence model understands meaning:
"spectacles" ~ "glasses", "puffer coat" ~ "jacket", "student card" ~ "ID card".

Model: EMBED_MODEL (all-MiniLM-L6-v2, ~90 MB). If P4's shared loader `app.core.embeddings` is
present (branch p4/complaints), it's reused so the process holds one copy. Item vectors are
cached in memory (they only change if the description does). Every function returns None when the
model can't load, and search falls back to keywords + CLIP.
"""

from __future__ import annotations

import logging
import threading

import numpy as np

from app.core.config import settings

log = logging.getLogger(__name__)

_lock = threading.Lock()
_model = None
_failed = False
_cache: dict[tuple[str, str], np.ndarray] = {}  # (item id, text) -> unit vector
_CACHE_MAX = 5000


def _shared_embed():
    try:
        from app.core.embeddings import embed_text  # P4's shared model, once merged into main
    except ImportError:
        return None
    return embed_text


def _own_model():
    global _model, _failed
    if _model is not None or _failed:
        return _model
    with _lock:
        if _model is None and not _failed:
            try:
                from sentence_transformers import SentenceTransformer  # heavy, so imported lazily

                _model = SentenceTransformer(settings.embed_model, device="cpu")
            except Exception as e:  # noqa: BLE001 - any failure means "no meaning matching"
                _failed = True
                log.warning("Sentence model %s unavailable, search uses keywords + CLIP: %s", settings.embed_model, e)
    return _model


def embed(texts: list[str]) -> np.ndarray | None:
    """Texts -> unit vectors (len(texts), dim), or None if no model is available."""
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    if shared := _shared_embed():
        vecs = [shared(t) for t in texts]
        if any(v is None for v in vecs):
            return None
        return np.asarray(vecs, dtype=np.float32)
    model = _own_model()
    if model is None:
        return None
    return np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float32)


def item_text(row: dict) -> str:
    """What an item 'means' in words: its AI title plus the finder's description."""
    return ". ".join(p for p in (row.get("title"), row.get("description")) if p)


def item_vectors(rows: list[dict]) -> dict[str, np.ndarray] | None:
    """Item id -> vector, embedding only items not seen before."""
    keys = [(r["id"], item_text(r)) for r in rows]
    missing = [k for k in keys if k not in _cache]
    if missing:
        vecs = embed([text for _, text in missing])
        if vecs is None:
            return None
        if len(_cache) + len(missing) > _CACHE_MAX:
            _cache.clear()
        _cache.update(zip(missing, vecs))
    return {item_id: _cache[(item_id, text)] for item_id, text in keys}


def warm_up() -> None:
    embed(["warm up"])
