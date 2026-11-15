"""Duplicate events (ARCHITECTURE.md §7.3): same time ±2h and a very similar title.

Two flyers for one event rarely have identical titles ("Diwali Night 2026" vs "DIWALI NIGHT
- SASA presents"), so titles are normalized and compared two ways; the better score wins.
Generic words ("night", "workshop", "mixer") don't count on their own: "Game Night" and
"Hack Night" in the same room are two different events.
"""

import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher

from app.events import store
from app.events.dates import parse_ts

WINDOW = timedelta(hours=2)
TITLE_MATCH = 0.85
# A weaker title match still counts when the place and start time line up closely
LOOSE_TITLE_MATCH = 0.6
LOOSE_WINDOW = timedelta(minutes=30)

_FILLER = {"the", "a", "an", "and", "at", "usc", "presents", "present", "annual", "join", "us", "for", "with", "of", "by", "our"}
# Words that say what kind of event it is, not which one
_GENERIC = {
    "night", "day", "event", "party", "social", "mixer", "meeting", "session", "info", "workshop", "prep", "panel",
    "talk", "fair", "club", "break", "study", "jam", "free", "open", "mock", "interview", "interviews", "lunch",
    "dinner", "breakfast", "screening", "discussion", "practice", "training", "seminar", "lecture", "series",
    "night's", "hangout", "kickoff", "watch", "show", "festival", "celebration", "game", "games",
}


def _words(text: str | None) -> list[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [w for w in words if w not in _FILLER and not re.fullmatch(r"20\d\d", w)]


def _distinctive(words: list[str]) -> set[str]:
    return {w for w in words if w not in _GENERIC and len(w) > 1}


def _similar_word(a: str, b: str) -> bool:
    return a == b or (min(len(a), len(b)) >= 4 and SequenceMatcher(None, a, b).ratio() >= 0.8)


def _shares_distinctive(da: set[str], db: set[str]) -> bool:
    return any(_similar_word(a, b) for a in da for b in db)


def title_similarity(a: str | None, b: str | None) -> float:
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return 0.0
    da, db = _distinctive(wa), _distinctive(wb)
    sequence = SequenceMatcher(None, " ".join(wa), " ".join(wb)).ratio()
    if da and db and not _shares_distinctive(da, db):
        return 0.0  # "Game Night" vs "Hack Night": nothing specific in common
    if not da or not db:
        # only generic words ("Study Break"): must be practically the same title
        return sequence if sequence >= 0.9 else 0.0
    sa, sb = set(wa), set(wb)
    overlap = len(sa & sb) / len(sa | sb)
    # "Diwali Night" inside "Diwali Night - SASA": the org name shouldn't hide the match,
    # but "Career Fair" inside "Career Fair Prep Workshop" is a different event
    contained = 0.0
    small, big = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    if len(small) >= 2 and small <= big and not (big - small) & _GENERIC:
        contained = 0.95
    return max(sequence, overlap, contained)


def _same_place(a: str | None, b: str | None) -> bool:
    wa, wb = set(_words(a)), set(_words(b))
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.5


def find_duplicate(
    title: str | None,
    starts_at: datetime | str | None,
    location_text: str | None = None,
    candidates: list[dict] | None = None,
) -> dict | None:
    """Best matching existing event, or None. `candidates` skips the DB (for tests)."""
    start = parse_ts(starts_at)
    if not title or not start:
        return None
    if candidates is None:
        candidates = store.events_starting_between(start - WINDOW, start + WINDOW)
    best, best_score = None, 0.0
    for event in candidates:
        gap = abs(parse_ts(event["starts_at"]) - start)
        if gap > WINDOW:
            continue
        score = title_similarity(title, event["title"])
        strong = score >= TITLE_MATCH
        loose = score >= LOOSE_TITLE_MATCH and gap <= LOOSE_WINDOW and _same_place(location_text, event.get("location_text"))
        if (strong or loose) and score > best_score:
            best, best_score = event, score
    return best


def find_duplicate_deal(title: str | None, candidates: list[dict] | None = None) -> dict | None:
    """An active deal with (almost) the same title, e.g. the same flyer posted twice."""
    if not title:
        return None
    if candidates is None:
        candidates = store.search_deals(active=True)
    best, best_score = None, 0.0
    for deal in candidates:
        score = title_similarity(title, deal["title"])
        if score >= TITLE_MATCH and score > best_score:
            best, best_score = deal, score
    return best
