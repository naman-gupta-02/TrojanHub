"""Retrieval regression tests: many phrasings of the demo questions must surface the fact.

Run from services/ai:  python -m pytest tests -q
Uses the local index only (skipped if it isn't built), so results don't depend on Supabase.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.rag.index import local_index
from app.rag.retrieve import expand, retrieve
from scripts.scrape.chunk import TARGET_WORDS, _n, chunk_page

pytestmark = pytest.mark.skipif(local_index() is None, reason="local RAG index not built")


@pytest.fixture(autouse=True)
def local_only(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")


@pytest.mark.parametrize(
    ("question", "fact"),
    [
        ("when is the food pantry open?", "10:00 AM"),
        ("Trojan Food Pantry hours", "10:00 AM"),
        ("pantry current hours", "10:00 AM"),
        ("is the food pantry open today", "10:00 AM"),
        ("food pantry hours and location", "10:00 AM"),
        ("when can I go to the pantry", "10:00 AM"),
        ("where is the food pantry", "King Hall"),
        ("What's the phone number for IT help?", "213-740-5555"),
        ("IT help desk phone", "213-740-5555"),
        ("what time does the Engemann student health center close?", "7 PM"),
        ("DPS emergency number", "213-740-4321"),
        ("who do I call about a lost wallet", "213-740-9759"),
        ("lost and found email", "lostandfound@dps.usc.edu"),
        ("how do I report a phishing email", "phishing@usc.edu"),
        ("I want to confirm if a course counts towards my graduation credit, who do I contact?", "STARS"),
        ("where do I see my STARS report?", "Experience USC"),
        ("how do I get a course substitution approved", "petition"),
        ("will my community college classes transfer to USC?", "articulation"),
        ("how is my Dornsife advisor assigned", "declared major"),
        ("who is my academic advisor in Viterbi", "academic advisor"),
        ("what is the email for the computer science MS advisors?", "viterbiservicedesk.cscimasters@usc.edu"),
        ("can I take a non-CS course for my MS in computer science?", "non-CS"),
        ("how many graduate units can I transfer into the CS masters?", "8 graduate units"),
    ],
)
def test_fact_is_in_sources(question, fact):
    r = retrieve(question)
    assert not r.no_answer
    assert any(fact in s.content for s in r.sources), [s.url for s in r.sources]


@pytest.mark.parametrize("question", [
    "who won the super bowl last year?",
    "what is the wifi password for the football stadium?",
    "how do I bake sourdough bread",
    "what's the weather tomorrow",
])
def test_off_topic_is_no_answer(question):
    r = retrieve(question)
    assert r.no_answer and r.closest is not None


def test_small_page_comes_back_whole():
    """Any pantry question gets every section of the (small) pantry page: process, location, hours."""
    text = " ".join(s.content for s in retrieve("what do I need to bring to the food pantry?").sources)
    assert "USCard" in text and "King Hall" in text and "10:00 AM" in text


def test_student_phrasing_is_expanded():
    assert "STARS" in expand("does this class count towards my graduation?")
    assert "petition" in expand("can I get a course substitution")
    assert expand("when is the food pantry open?") == "when is the food pantry open?"


def test_acronyms_are_expanded():
    assert "information technology" in expand("IT help")
    assert expand("is it open") == "is it open"  # lowercase "it" is left alone


def test_chunks_fit_the_embedding_model():
    """MiniLM reads only 256 tokens, so chunks must stay near the budget or text is never embedded."""
    page = {"url": "u", "title": "T", "scraped_at": "now",
            "text": "## A\n\n" + "\n\n".join(f"Paragraph {i} " + "word " * 60 for i in range(12)) + "\n\n## B\n\n" + "long " * 900}
    chunks = chunk_page(page)
    assert len(chunks) > 5
    assert max(_n(c["content"]) for c in chunks) <= TARGET_WORDS + 60
    assert "Paragraph 11" in " ".join(c["content"] for c in chunks)
