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
INTENT_MARGIN = 0.06  # ...but only for pages within this much of the best page's score
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


# How students say it -> words the official pages use (appended to the search, never shown).
PHRASES = [
    (re.compile(r"\bcounts?\b.{0,40}\b(towards?|for)\b.{0,25}\b(degree|graduat\w*|major|minor|ge|requirements?)\b", re.I),
     "STARS report degree requirements progress toward degree completion"),
    (re.compile(r"\b(course|class)\b.{0,30}\b(substitut\w*|waive\w*|exception)\b", re.I),
     "petition academic department exception"),
    (re.compile(r"\bon track to graduate|\bgraduation check\b|\bdegree audit\b", re.I),
     "STARS report degree progress"),
]


def expand(query: str) -> str:
    q = re.sub(r"\b(" + "|".join(ALIASES) + r")\b", lambda m: ALIASES[m.group(1)], query)
    extra = [words for pattern, words in PHRASES if pattern.search(query)]
    return q + (" " + " ".join(extra) if extra else "")


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
    #    Only pages already close to the best match get it: "who do I contact" must not lift an
    #    off-topic page just because it lists a phone number.
    best_by_page: dict[str, float] = {}
    for chunk, score in base:
        best_by_page[chunk["url"]] = max(best_by_page.get(chunk["url"], 0.0), score)
    top = max(best_by_page.values(), default=0.0)
    page_boost: dict[str, float] = {url: 0.0 for url in best_by_page}
    for chunk, _ in base:
        if best_by_page[chunk["url"]] >= top - INTENT_MARGIN:
            b = intent_boost(q, chunk.get("contacts") or {})
            page_boost[chunk["url"]] = max(page_boost[chunk["url"]], b)
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
