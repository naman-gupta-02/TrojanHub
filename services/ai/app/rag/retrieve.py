"""Retrieve USC sources for a question (ARCHITECTURE.md §7.1 "Retrieve").

Embed the query -> cosine top-k=8 -> small keyword boost -> keep the top 4 above the threshold.
Nothing above the threshold -> no_answer, with the closest page so Tommy can link it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.rag.embeddings import embed_query
from app.rag.index import vector_search

TOP_K = 8
KEEP = 4
THRESHOLD = 0.40  # tuned on evals/chat_questions.jsonl (see evals/run.py)
KEYWORD_WEIGHT = 0.10
MAX_PER_URL = 2  # keep variety: at most 2 chunks from the same page

_STOP = set("a an and are at be by can do does for from get how i in is it me my of on or the to what when where which who why with you your usc".split())


@dataclass
class Source:
    n: int
    url: str
    title: str
    section: str | None
    content: str
    contacts: dict
    score: float


@dataclass
class Retrieval:
    query: str
    sources: list[Source] = field(default_factory=list)
    no_answer: bool = False
    closest: Source | None = None


def _terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOP and len(w) > 1}


def keyword_overlap(query: str, text: str) -> float:
    q = _terms(query)
    return len(q & _terms(text)) / len(q) if q else 0.0


def retrieve(query: str, keep: int = KEEP, threshold: float = THRESHOLD) -> Retrieval:
    hits = vector_search(embed_query(query), TOP_K)
    scored = []
    for chunk, sim in hits:
        score = sim + KEYWORD_WEIGHT * keyword_overlap(query, chunk["title"] + " " + chunk["content"])
        scored.append((chunk, score))
    scored.sort(key=lambda x: -x[1])

    picked: list[tuple[dict, float]] = []
    per_url: dict[str, int] = {}
    for chunk, score in scored:
        if per_url.get(chunk["url"], 0) >= MAX_PER_URL:
            continue
        picked.append((chunk, score))
        per_url[chunk["url"]] = per_url.get(chunk["url"], 0) + 1

    def to_source(n: int, chunk: dict, score: float) -> Source:
        return Source(n, chunk["url"], chunk["title"], chunk.get("section"), chunk["content"], chunk.get("contacts") or {}, round(score, 3))

    good = [(c, s) for c, s in picked if s >= threshold][:keep]
    if not good:
        closest = to_source(1, *picked[0]) if picked else None
        return Retrieval(query, [], no_answer=True, closest=closest)
    return Retrieval(query, [to_source(i + 1, c, s) for i, (c, s) in enumerate(good)])
