"""Text embeddings (owned by P4). One model, loaded once, shared by every feature that needs it.

EMBED_MODEL defaults to sentence-transformers/all-MiniLM-L6-v2 (384 dims), which matches the
vector(384) columns in the schema (doc_chunks, tickets).

embed_text() returns None instead of raising when the model can't load (package missing, no
memory, no network for the first download). Callers must handle None with a fallback.
"""

import logging
import threading

from app.core.config import settings

log = logging.getLogger(__name__)

_lock = threading.Lock()
_model = None
_failed = False  # don't retry a broken load on every request


def _load():
    try:
        # P1's RAG loader (app/rag/embeddings.py) uses the same EMBED_MODEL. When it is present,
        # reuse its copy so the process holds one model in memory, not two.
        from app.rag.embeddings import _model as rag_model
    except ImportError:
        from sentence_transformers import SentenceTransformer  # heavy, so imported lazily

        return SentenceTransformer(settings.embed_model, device="cpu")
    return rag_model()


def _get_model():
    global _model, _failed
    if _model is not None or _failed:
        return _model
    with _lock:
        if _model is None and not _failed:
            try:
                _model = _load()
            except Exception as e:  # noqa: BLE001 - any failure means "no embeddings"
                _failed = True
                log.warning("Embedding model %s unavailable: %s", settings.embed_model, e)
    return _model


def embed_text(text: str) -> list[float] | None:
    """Unit-length embedding of `text`, or None if the model is unavailable."""
    model = _get_model()
    if model is None:
        return None
    try:
        return model.encode(text, normalize_embeddings=True).tolist()
    except Exception as e:  # noqa: BLE001
        log.warning("Embedding failed: %s", e)
        return None
