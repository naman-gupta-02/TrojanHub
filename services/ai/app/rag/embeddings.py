"""Text embeddings (MiniLM, 384-d, local CPU). Loaded once, on first use."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from app.core.config import settings

EMBED_DIM = 384


@lru_cache
def _model():
    from sentence_transformers import SentenceTransformer  # heavy import, so only when needed

    return SentenceTransformer(settings.embed_model, device="cpu")


def embed_texts(texts: list[str]) -> np.ndarray:
    """L2-normalized float32 matrix, one row per text."""
    return np.asarray(_model().encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32)


def embed_query(text: str) -> np.ndarray:
    return embed_texts([text])[0]
