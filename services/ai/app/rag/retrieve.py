"""Retrieve USC sources for a question (ARCHITECTURE.md §7.1 "Retrieve").

Embed the query -> cosine top-k=40 -> boosts (keywords, title, hours/contact intent) -> keep the
best chunks above the threshold. If the best page is small, Tommy gets the whole page, so the
answer doesn't depend on which section happened to match.
Nothing above the threshold -> no_answer, with the closest page so Tommy can link it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.rag.embeddings import embed_query
from app.rag.index import page_chunks, vector_search

TOP_K = 40  # candidates from vector search, re-ranked below (big pages can crowd out a top-20)
KEEP = 4
THRESHOLD = 0.40  # tuned on evals/chat_questions.jsonl (see evals/run.py)
KEYWORD_WEIGHT = 0.10  # share of query words found in the chunk
TITLE_WEIGHT = 0.10  # share of query words found in the page title / section
INTENT_WEIGHT = 0.08  # the question asks for hours / a contact and the chunk has one
MAX_PER_URL = 2  # keep variety: at most 2 chunks from the same page
SMALL_PAGE = 5  # if the best page has this many chunks or fewer, include all of them
OTHER_PAGES = 2  # ...plus this many chunks from other pages

_HOURS_Q = re.compile(r"\b(hours?|open|opens|close[sd]?|closing|when|time|today|tonight|weekend)\b", re.I)
_CONTACT_Q = re.compile(r"\b(phone|number|call|email|e-mail|contact|reach)\b", re.I)

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


# Campus shorthand -> what the pages actually say. Case-sensitive on purpose ("IT" vs "it").
ALIASES = {
    "IT": "ITS information technology services",
    "DPS": "DPS Department of Public Safety",
    "OSAS": "OSAS Office of Student Accessibility Services",
    "EVK": "Everybody's Kitchen dining hall",
    "RA": "resident assistant housing",
}


def expand(query: str) -> str:
    return re.sub(r"\b(" + "|".join(ALIASES) + r")\b", lambda m: ALIASES[m.group(1)], query)


def _terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOP and len(w) > 1}


def keyword_overlap(query: str, text: str) -> float:
    q = _terms(query)
    return len(q & _terms(text)) / len(q) if q else 0.0


def intent_boost(query: str, contacts: dict) -> float:
    boost = 0.0
    if _HOURS_Q.search(query) and contacts.get("hours"):
        boost += INTENT_WEIGHT
    if _CONTACT_Q.search(query) and (contacts.get("phones") or contacts.get("emails")):
        boost += INTENT_WEIGHT
    return boost


def retrieve(query: str, keep: int = KEEP, threshold: float = THRESHOLD) -> Retrieval:
    q = expand(query)
    hits = vector_search(embed_query(q), TOP_K)

    # 1) Score chunks: similarity + keyword and title overlap.
    base: list[tuple[dict, float]] = []
    for chunk, sim in hits:
        heading = chunk["title"] + " " + (chunk.get("section") or "")
        base.append((chunk, sim + KEYWORD_WEIGHT * keyword_overlap(q, chunk["content"]) + TITLE_WEIGHT * keyword_overlap(q, heading)))

    # 2) Score pages: a page's best chunk, plus the intent boost if ANY of its candidate chunks
    #    has the hours / contact asked for (so a page isn't punished because its best-matching
    #    section and its hours sit in different chunks).
    page_boost: dict[str, float] = {}
    for chunk, _ in base:
        b = intent_boost(q, chunk.get("contacts") or {})
        page_boost[chunk["url"]] = max(page_boost.get(chunk["url"], 0.0), b)
    scored = sorted(((c, s + page_boost[c["url"]]) for c, s in base), key=lambda x: -x[1])

    def to_source(n: int, chunk: dict, score: float) -> Source:
        return Source(n, chunk["url"], chunk["title"], chunk.get("section"), chunk["content"], chunk.get("contacts") or {}, round(score, 3))

    if not scored or scored[0][1] < threshold:
        closest = to_source(1, *scored[0]) if scored else None
        return Retrieval(query, [], no_answer=True, closest=closest)

    best_url, best_score = scored[0][0]["url"], scored[0][1]
    page = page_chunks(best_url)
    picked: list[tuple[dict, float]] = []
    if 0 < len(page) <= SMALL_PAGE:
        # Whole small page; other pages fill the remaining slots.
        score_of = {c["content"]: s for c, s in scored}
        picked = [(c, score_of.get(c["content"], best_score)) for c in page]
        seen: set[str] = set()
        for c, s in scored:
            if len(picked) >= len(page) + OTHER_PAGES:
                break
            if c["url"] != best_url and s >= threshold and c["url"] not in seen:
                picked.append((c, s))
                seen.add(c["url"])
    else:
        # Big page (e.g. library or dining hours): best chunks, preferring ones that carry
        # the hours / contact asked for.
        per_url: dict[str, int] = {}
        ranked = sorted(scored, key=lambda x: -(x[1] + intent_boost(q, x[0].get("contacts") or {})))
        for c, s in ranked:
            if len(picked) >= keep:
                break
            if s < threshold or per_url.get(c["url"], 0) >= MAX_PER_URL:
                continue
            picked.append((c, s))
            per_url[c["url"]] = per_url.get(c["url"], 0) + 1

    return Retrieval(query, [to_source(i + 1, c, s) for i, (c, s) in enumerate(picked)])
