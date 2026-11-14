"""Where chunks live: the local index (always) or Supabase doc_chunks (once configured)."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.core.config import SERVICE_DIR, settings

OUT_DIR = SERVICE_DIR / "scripts" / "scrape" / "out"
CHUNKS_PATH = OUT_DIR / "chunks.jsonl"
INDEX_PATH = OUT_DIR / "index.npz"


def embedding_text(chunk: dict) -> str:
    """What gets embedded: the chunk with markdown links reduced to their text."""
    return re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", chunk["content"])


class LocalIndex:
    def __init__(self, chunks: list[dict], vectors: np.ndarray):
        self.chunks = chunks
        self.vectors = vectors

    @classmethod
    def load(cls, chunks_path: Path = CHUNKS_PATH, index_path: Path = INDEX_PATH) -> "LocalIndex | None":
        if not chunks_path.exists() or not index_path.exists():
            return None
        chunks = [json.loads(l) for l in chunks_path.open()]
        vectors = np.load(index_path)["embeddings"]
        if len(chunks) != len(vectors):
            raise RuntimeError("chunks.jsonl and index.npz are out of sync: rerun scripts.scrape.embed")
        return cls(chunks, vectors)

    def search(self, query_vec: np.ndarray, k: int) -> list[tuple[dict, float]]:
        sims = self.vectors @ query_vec
        top = np.argsort(-sims)[:k]
        return [(self.chunks[i], float(sims[i])) for i in top]


@lru_cache
def local_index() -> LocalIndex | None:
    return LocalIndex.load()


def supabase_search(query_vec: np.ndarray, k: int) -> list[tuple[dict, float]]:
    from app.core.supabase import get_supabase

    res = get_supabase().rpc("match_doc_chunks", {"query_embedding": query_vec.tolist(), "match_count": k}).execute()
    return [(row, float(row["similarity"])) for row in (res.data or [])]


def vector_search(query_vec: np.ndarray, k: int) -> list[tuple[dict, float]]:
    """Supabase if configured and non-empty, else the local index."""
    if settings.supabase_url and settings.supabase_service_role_key:
        try:
            hits = supabase_search(query_vec, k)
            if hits:
                return hits
        except Exception as e:  # noqa: BLE001 - fall back to local rather than fail the chat
            print(f"[rag] Supabase search failed, using local index: {e}")
    idx = local_index()
    if idx is None:
        raise RuntimeError("No index yet. Run: python -m scripts.scrape.crawl && python -m scripts.scrape.chunk && python -m scripts.scrape.embed")
    return idx.search(query_vec, k)
