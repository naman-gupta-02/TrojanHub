"""Category chips ("Free food", "Cultural"...) and Tommy's event search find every event that fits.

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

from app.chat.tools import events as tommy_events
from app.chat.tools.base import ToolContext
from app.events import categories, store
from app.events.dates import iso, now_utc


def ev(title, category="social", freebie=None, description=None):
    return {"id": title, "title": title, "category": category, "description": description,
            "has_freebie": bool(freebie), "freebie_desc": freebie,
            "starts_at": iso(now_utc() + timedelta(days=2)), "ends_at": None}


OPEN_MIC = ev("Open Mic Night", "social", "Free hot chocolate")
DIWALI = ev("Diwali Night", "cultural", "Free samosas")
CAREER = ev("Tech Career Fair", "career", "Free t-shirts")
WINGS = ev("Watch Party", "sports", "Free wings")
SWAG = ev("Club Fair", "social", "Free stickers and tote bags")
PIZZA_TEXT = ev("Hack Night", "academic", description="Free pizza for everyone who comes")


@pytest.mark.parametrize(("event", "expected"), [
    (OPEN_MIC, True),  # a social event giving away a drink
    (WINGS, True),
    (DIWALI, True),
    (PIZZA_TEXT, True),  # says "free pizza" but didn't tick "has a freebie"
    (ev("Boba Study Break", "free_food"), True),
    (CAREER, False),  # t-shirts aren't food
    (SWAG, False),
])
def test_free_food_chip_covers_food_and_drink_freebies(event, expected):
    assert categories.matches(event, "free_food") is expected


def test_other_chips_match_by_category_or_text():
    assert categories.matches(DIWALI, "cultural")
    assert categories.matches(ev("Lunar New Year Festival", "social"), "cultural")
    assert categories.matches(ev("Resume Review Drop-in", "other"), "career")
    assert categories.matches(ev("Trojans vs Bruins Tailgate", "social"), "sports")
    assert categories.matches(OPEN_MIC, "social")
    assert not categories.matches(CAREER, "cultural")
    assert categories.matches(CAREER, None)  # no chip picked: everything


class FakeQuery:
    def __init__(self, rows, seen):
        self.rows, self.seen = rows, seen

    def __getattr__(self, name):
        def f(*a, **k):
            self.seen.append((name, a))
            return self
        return f

    def execute(self):
        return type("Res", (), {"data": self.rows})()


def _store(monkeypatch, rows):
    seen = []
    monkeypatch.setattr(store, "get_supabase", lambda: type("SB", (), {"table": lambda self, n: FakeQuery(rows, seen)})())
    monkeypatch.setattr(store, "_event", lambda r: r)
    return seen


def test_search_free_food_lists_the_hot_chocolate_event(monkeypatch):
    seen = _store(monkeypatch, [OPEN_MIC, CAREER, WINGS, SWAG])
    found = [e["id"] for e in store.search_events(category="free_food")]
    assert found == ["Open Mic Night", "Watch Party"]
    assert ("eq", ("category", "free_food")) not in seen  # not limited to the one category column


def test_searching_free_drinks_uses_the_food_chip(monkeypatch):
    _store(monkeypatch, [OPEN_MIC, CAREER, SWAG])
    assert [e["id"] for e in store.search_events(q="free drinks")] == ["Open Mic Night"]


def test_next_week_is_the_week_after_this_one():
    _, _, this_week = store.parse_query("events this week")
    _, _, next_week = store.parse_query("events next week")
    assert next_week[0] == this_week[1]


# --- Tommy --------------------------------------------------------------------
@pytest.mark.parametrize(("query", "category", "kept"), [
    ("free drinks", "free_food", None),
    ("any free snacks or coffee", "free_food", "coffee"),
    ("upcoming cultural events", "cultural", None),
    ("cultural events next week", "cultural", None),
    ("sports this weekend", "sports", None),
    ("career fair this week", None, "career fair"),
    ("free pizza tonight", None, "pizza"),
])
def test_tommy_reads_the_category_from_the_question(query, category, kept):
    assert tommy_events.category_from(query) == category
    assert tommy_events.specific_terms(query) == kept


def test_tommy_passes_the_category_and_next_week(monkeypatch):
    sent = {}

    async def fake_call(method, path, auth_header, params=None, **kw):
        sent.update(params)
        return {"events": [OPEN_MIC]}

    monkeypatch.setattr(tommy_events, "call", fake_call)
    ctx = ToolContext(session_id="s1", user_id="u1", auth_header="Bearer t")
    out = asyncio.run(tommy_events.search_events({"query": "free drinks", "date_range": "next_week",
                                                  "freebie_only": True}, ctx))
    assert sent["category"] == "free_food" and sent["q"] is None
    lo, hi = tommy_events._date_range("next_week")
    assert (sent["from"], sent["to"]) == (lo, hi)
    assert out.result["events"][0]["freebie"] == "Free hot chocolate"

    sent.clear()
    asyncio.run(tommy_events.search_events({"query": "events", "category": "career"}, ctx))
    assert sent["category"] == "career"  # an explicit category wins


def test_next_week_range_starts_a_week_out(monkeypatch):
    from datetime import datetime

    monkeypatch.setattr(tommy_events, "_now", lambda: datetime(2026, 11, 15, 9, tzinfo=tommy_events.LA))
    lo, hi = tommy_events._date_range("next_week")
    assert lo.startswith("2026-11-22") and hi.startswith("2026-11-28")
