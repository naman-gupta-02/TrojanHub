"""Embed chunks and store them (ARCHITECTURE.md §7.1, step 5). Rerun to refresh.

Always writes a local index (scripts/scrape/out/index.npz), so Tommy works before Supabase
exists. If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, also replaces those pages' rows in
`doc_chunks`.

Run from services/ai (after chunk.py):
    python -m scripts.scrape.embed            # local + Supabase if configured
    python -m scripts.scrape.embed --local    # local only
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from app.core.config import settings
from app.rag.embeddings import embed_texts
from app.rag.index import CHUNKS_PATH, INDEX_PATH, embedding_text


def upload_to_supabase(chunks: list[dict], vectors: np.ndarray) -> None:
    from app.core.supabase import get_supabase

    sb = get_supabase()
    urls = sorted({c["url"] for c in chunks})
    for url in urls:  # replace, don't duplicate, on re-runs
        sb.table("doc_chunks").delete().eq("url", url).execute()
    rows = [
        {
            "url": c["url"], "title": c["title"], "section": c["section"], "content": c["content"],
            "contacts": c["contacts"], "embedding": v.tolist(), "scraped_at": c["scraped_at"],
        }
        for c, v in zip(chunks, vectors)
    ]
    for i in range(0, len(rows), 100):
        sb.table("doc_chunks").insert(rows[i : i + 100]).execute()
    print(f"Supabase: replaced {len(urls)} pages, inserted {len(rows)} rows into doc_chunks")


def main(local_only: bool) -> None:
    chunks = [json.loads(l) for l in CHUNKS_PATH.open()]
    vectors = embed_texts([embedding_text(c) for c in chunks])
    np.savez_compressed(INDEX_PATH, embeddings=vectors.astype(np.float32))
    print(f"Local index: {len(chunks)} chunks x {vectors.shape[1]} dims -> {INDEX_PATH}")
    if not local_only and settings.supabase_url and settings.supabase_service_role_key:
        upload_to_supabase(chunks, vectors)
    elif not local_only:
        print("Supabase not configured: skipped upload (local index is enough for now)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="skip the Supabase upload")
    main(ap.parse_args().local)
