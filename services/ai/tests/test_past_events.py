"""Past events: hidden from every list, and can't be posted (form, flyer scan or Tommy).

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.chat.tools import events as tommy_events
from app.chat.tools.base import ToolContext
from app.core import auth
from app.core.config import settings
from app.events import dedupe, flyer, store
from app.events.dates import has_ended, iso, now_utc
from app.events.settings import p3
from app.main import app

SIGNED_IN = {"Authorization": "Bearer good-token"}


def ago(**kw) -> str:
    return iso(now_utc() - timedelta(**kw))


def ahead(**kw) -> str:
    return iso(now_utc() + timedelta(**kw))


@pytest.fixture
def client(monkeypatch):
    """Hosted-app setup (Supabase configured, P3 data from mocks) with a signed-in student."""
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon")
    monkeypatch.setattr(p3, "p3_use_mocks", True)

    async def fake_verify(token):
        return "11111111-1111-1111-1111-111111111111"

    monkeypatch.setattr(auth, "_verify_with_supabase", fake_verify)
    return TestClient(app)


# --- the rule -----------------------------------------------------------------
def test_has_ended_uses_end_time_or_two_hours():
    assert has_ended(ago(hours=5), ago(hours=1))
    assert not has_ended(ago(hours=5), ahead(hours=1))  # still running
    assert has_ended(ago(hours=3), None)  # no end time: over 2h after it starts
    assert not has_ended(ago(hours=1), None)
    assert not has_ended(ahead(days=1), None)
    assert not has_ended(None, None)


# --- posting ------------------------------------------------------------------
def test_past_event_is_rejected(client):
    r = client.post("/api/events", json={"title": "Last week's mixer", "starts_at": ago(days=7)}, headers=SIGNED_IN)
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "event_in_past"
    assert "already ended" in err["message"]


def test_event_that_ended_today_is_rejected(client):
    r = client.post("/api/events", json={"title": "Morning talk", "starts_at": ago(hours=4), "ends_at": ago(hours=3)},
                    headers=SIGNED_IN)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "event_in_past"


def test_upcoming_or_running_event_is_accepted(client):
    for body in ({"starts_at": ahead(days=3)},
                 {"starts_at": ago(hours=1)},  # started an hour ago, still on
                 {"starts_at": ago(days=1), "ends_at": ahead(hours=2)}):  # multi-day
        r = client.post("/api/events", json={"title": "Career fair", **body}, headers=SIGNED_IN)
        assert r.status_code == 201, (body, r.text)


def test_expired_deal_is_rejected(client):
    r = client.post("/api/deals", json={"title": "Free pizza slice", "kind": "one_time",
                                        "starts_at": ago(days=8), "expires_at": ago(days=7)}, headers=SIGNED_IN)
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "deal_expired"
    assert "already expired" in err["message"]


def test_current_and_ongoing_deals_are_accepted(client):
    for body in ({"kind": "one_time", "expires_at": ahead(days=2)}, {"kind": "ongoing"}):
        r = client.post("/api/deals", json={"title": "Student discount", **body}, headers=SIGNED_IN)
        assert r.status_code == 201, (body, r.text)


def test_signed_out_still_gets_401_not_422(client):
    r = client.post("/api/events", json={"title": "Old event", "starts_at": ago(days=7)})
    assert r.status_code == 401


# --- search -------------------------------------------------------------------
class FakeQuery:
    """Enough of the supabase query builder: every filter returns itself; execute() returns the rows."""

    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return type("Res", (), {"data": self.rows})()


def test_search_hides_ended_events_even_with_a_past_start(monkeypatch):
    rows = [
        {"id": "a", "title": "Monday talk", "starts_at": ago(days=4), "ends_at": ago(days=4, hours=-1)},
        {"id": "b", "title": "This morning", "starts_at": ago(hours=5), "ends_at": None},
        {"id": "c", "title": "Running now", "starts_at": ago(hours=1), "ends_at": ahead(hours=1)},
        {"id": "d", "title": "Saturday game", "starts_at": ahead(days=1), "ends_at": None},
    ]
    monkeypatch.setattr(store, "get_supabase", lambda: type("SB", (), {"table": lambda self, n: FakeQuery(rows)})())
    monkeypatch.setattr(store, "_event", lambda r: r)
    for start in (now_utc() - timedelta(days=5), None):  # "this week" from Monday, and no date filter
        found = [e["id"] for e in store.search_events(start=start)]
        assert found == ["c", "d"], start


# --- flyer scan ---------------------------------------------------------------
def _raw(starts, ends=None, kind="event", year=True):
    return {"is_flyer": True, "type": kind, "title": "Diwali Night", "starts_at": starts, "ends_at": ends,
            "location_text": "TCC Ballroom", "year_on_flyer": year}


def _local(dt_iso: str) -> str:
    """UTC ISO -> the 'YYYY-MM-DDTHH:MM' LA local format the model returns."""
    from app.events.dates import LA, parse_ts

    return parse_ts(dt_iso).astimezone(LA).strftime("%Y-%m-%dT%H:%M")


def test_scan_flags_an_old_flyer():
    res = flyer.normalize(_raw(_local(ago(days=30)), _local(ago(days=30, hours=-2))), buildings=[])
    assert res["ended"] is True


def test_scan_does_not_flag_an_upcoming_flyer():
    res = flyer.normalize(_raw(_local(ahead(days=5))), buildings=[])
    assert res["ended"] is False


def test_scan_flags_an_expired_deal():
    res = flyer.normalize(_raw(_local(ago(days=9)), _local(ago(days=8)), kind="deal"), buildings=[])
    assert res["type"] == "deal"
    assert res["ended"] is True


def test_scan_skips_the_duplicate_check_for_an_old_flyer(monkeypatch):
    monkeypatch.setattr(store, "buildings", lambda: [])
    monkeypatch.setattr(flyer, "_ask_llm", lambda payload, buildings: _raw(_local(ago(days=30))))
    monkeypatch.setattr(flyer, "_image_payload", lambda url: url)

    def no_dedupe(*a, **k):
        raise AssertionError("an ended flyer shouldn't be checked for duplicates")

    monkeypatch.setattr(dedupe, "find_duplicate", no_dedupe)
    assert flyer.scan("https://example.com/flyer.jpg")["ended"] is True


# --- Tommy --------------------------------------------------------------------
def test_tommy_does_not_offer_to_post_an_old_flyer(monkeypatch):
    async def fake_call(method, path, auth_header, **kw):
        assert path == "/flyers/scan"
        return {"type": "event", "fields": {"title": "Diwali Night", "starts_at": ago(days=30)}, "missing": [],
                "ended": True}

    monkeypatch.setattr(tommy_events, "call", fake_call)
    monkeypatch.setattr(tommy_events.store, "resolve_photo", lambda session_id, ref: "data:image/png;base64,AAAA")
    ctx = ToolContext(session_id="s1", user_id="u1", auth_header="Bearer t")
    out = asyncio.run(tommy_events.scan_flyer({"image_url": "photo-1"}, ctx))
    assert out.result["ended"] is True
    assert "already ended" in out.result["note"]
    assert out.confirm is None  # no "Add this event" card


# --- deals: no duplicates, and you can take a vote back -------------------------
def test_duplicate_deal_title_matches():
    deals = [{"id": "s1", "title": "Starbucks Free Cup Day"}, {"id": "c1", "title": "15% off any drink at Cardinal Café"}]
    assert dedupe.find_duplicate_deal("Starbucks Free Cup Day", deals)["id"] == "s1"
    assert dedupe.find_duplicate_deal("STARBUCKS free cup day!", deals)["id"] == "s1"
    assert dedupe.find_duplicate_deal("Free bike safety check", deals) is None


def _live_deals(monkeypatch, deals):
    from app.events import routes

    monkeypatch.setattr(routes, "db_live", lambda: True)
    monkeypatch.setattr(store, "search_deals", lambda *a, **k: deals)
    monkeypatch.setattr(store, "profile", lambda uid: None)
    monkeypatch.setattr(store, "insert_deal", lambda row: {"id": "new", **row})


def test_same_deal_twice_is_rejected(client, monkeypatch):
    _live_deals(monkeypatch, [{"id": "s1", "title": "Starbucks Free Cup Day"}])
    r = client.post("/api/deals", json={"title": "Starbucks Free Cup Day", "kind": "ongoing"}, headers=SIGNED_IN)
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "duplicate"
    forced = client.post("/api/deals", json={"title": "Starbucks Free Cup Day", "kind": "ongoing", "force": True},
                         headers=SIGNED_IN)
    assert forced.status_code == 201


def test_vote_can_be_taken_back(client, monkeypatch):
    from app.events import routes

    deal = {"id": "d0000000-0000-0000-0000-000000000001", "still_active_votes": 3}
    monkeypatch.setattr(routes, "db_live", lambda: True)
    monkeypatch.setattr(store, "get_deal", lambda i: deal)

    def set_votes(i, v):
        deal["still_active_votes"] = v
        return v

    monkeypatch.setattr(store, "set_deal_votes", set_votes)
    url = f"/api/deals/{deal['id']}/vote"
    assert client.post(url, json={"still_active": True}, headers=SIGNED_IN).json()["still_active_votes"] == 4
    assert client.post(url, json={"still_active": True}, headers=SIGNED_IN).json()["still_active_votes"] == 4  # no double count
    r = client.post(url, json={"still_active": None}, headers=SIGNED_IN).json()  # unlike
    assert r == {"still_active_votes": 3, "my_vote": None}
    assert client.post(url, json={"still_active": False}, headers=SIGNED_IN).json()["still_active_votes"] == 2
