"""P3 Events, Deals & Freebies: pure logic + routes with the database faked.

No keys, network or database needed. Run from services/ai:   python -m pytest tests -q
"""

import sys
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import app` works from anywhere

from app.core.auth import get_user_id, require_signed_in  # noqa: E402
from app.events import dedupe, feed, flyer, ics, routes, store  # noqa: E402
from app.events.dates import iso, now_utc  # noqa: E402
from app.main import app  # noqa: E402

TCC, RTH, LVL = "b-tcc", "b-rth", "b-lvl"
BUILDINGS = [
    {"id": TCC, "code": "TCC", "name": "Ronald Tutor Campus Center"},
    {"id": RTH, "code": "RTH", "name": "Ronald Tutor Hall"},
    {"id": LVL, "code": "LVL", "name": "Leavey Library"},
    {"id": "b-sal", "code": "SAL", "name": "Salvatori Computer Science Center"},
    {"id": "b-vil", "code": "VIL", "name": "USC Village"},
]


def ev(title, minutes=0, loc="TCC Grand Ballroom"):
    return {"id": title, "title": title, "starts_at": iso(now_utc() + timedelta(minutes=minutes)), "location_text": loc}


# ---------------------------------------------------------------------------
# Duplicates
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("new, existing, loc, dup", [
    ("DIWALI NIGHT - SASA presents", "Diwali Night 2026", None, True),
    ("Diwalli Night", "Diwali Night", None, True),  # typo on the flyer
    ("Game Night", "Hack Night", "TCC Grand Ballroom", False),
    ("Movie Night", "Trivia Night", "TCC Grand Ballroom", False),
    ("Career Fair", "Career Fair Prep Workshop", None, False),
    ("Study Break", "Study Break", None, True),  # only generic words, but identical
    ("Study Break", "Study Jam", None, False),
])
def test_duplicates(new, existing, loc, dup):
    assert bool(dedupe.find_duplicate(new, now_utc(), loc, [ev(existing)])) is dup


def test_duplicate_needs_close_start_time():
    assert dedupe.find_duplicate("Diwali Night", now_utc(), None, [ev("Diwali Night", minutes=4 * 60)]) is None


# ---------------------------------------------------------------------------
# Flyer reader (everything after the LLM)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("location, building", [
    ("Tutor Hall 105", RTH),
    ("Tutor Campus Center ballroom", TCC),
    ("TCC 450", TCC),
    ("Leavey 2nd floor", LVL),
    ("USC Village plaza", "b-vil"),
    ("salsa night at the quad", None),
    (None, None),
])
def test_match_building(location, building):
    assert flyer.match_building(None, location, BUILDINGS) == building


def test_normalize_overnight_event_and_freebie_safety_net():
    raw = {"title": "Late Night Dance", "starts_at": "2026-11-20T22:00", "ends_at": "2026-11-20T01:00",
           "year_on_flyer": True, "description": "Free pizza provided", "category": "Social"}
    out = flyer.normalize(raw, BUILDINGS)
    f = out["fields"]
    assert f["ends_at"] > f["starts_at"]  # 10pm-1am ends the next morning
    assert f["has_freebie"] is True and f["freebie_desc"] == "Free pizza"
    assert f["category"] == "social"
    assert "is_free" in out["missing"] and "building_id" not in out["missing"]


def test_confidence_only_building_uses_building_score():
    raw = {"title": "Hack Night", "starts_at": "2026-11-20T19:00", "year_on_flyer": True, "location_text": "SAL 101",
           "building_code": "SAL", "category": "academic", "confidence": {"title": 0.95, "building_code": 0.2}}
    conf = flyer.normalize(raw, BUILDINGS)["confidence"]
    assert conf["title"] == 0.95
    assert conf["building_id"] == 0.2
    assert conf["location_text"] == 0.7 and conf["category"] == 0.7


@pytest.mark.parametrize("url", ["http://localhost:8000/x.png", "http://127.0.0.1/x", "http://192.168.1.5/a.png",
                                 "http://169.254.169.254/latest", "http://[::1]/x", "http://nope.invalid/x.png", "file:///etc/passwd"])
def test_flyer_download_refuses_internal_addresses(url):
    with pytest.raises(HTTPException) as err:
        flyer._image_payload(url)
    assert err.value.status_code == 422


def test_flyer_data_url_limits():
    assert flyer._image_payload("data:image/png;base64,AAAA").startswith("data:image/png")
    with pytest.raises(HTTPException) as err:
        flyer._image_payload("data:image/png;base64," + "A" * (flyer.MAX_IMAGE_BYTES * 2))
    assert err.value.status_code == 413
    with pytest.raises(HTTPException):
        flyer._image_payload("data:image/png,notbase64")


def test_parse_json_tolerates_fences():
    assert flyer.parse_json('```json\n{"a": 1}\n```') == {"a": 1}


# ---------------------------------------------------------------------------
# Search words
# ---------------------------------------------------------------------------
def test_search_words_drop_filler_and_time_words():
    assert store.search_words("any events at Leavey tonight?") == ["Leavey"]
    assert store.search_words("free pizza, (SAL) 100%") == ["free", "pizza", "SAL", "100"]


def test_parse_query():
    q, freebie, when = store.parse_query("free food today")
    assert freebie and when is not None and store.search_words(q) == []
    _, freebie, when = store.parse_query("career panel")
    assert not freebie and when is None
    _, _, tomorrow = store.parse_query("pizza tomorrow")
    assert tomorrow[0] > now_utc()


# ---------------------------------------------------------------------------
# Feed + calendar
# ---------------------------------------------------------------------------
def test_free_today_rules():
    now = now_utc()
    start, end = now - timedelta(hours=10), now + timedelta(hours=14)
    deal = lambda **kw: {"kind": "one_time", "starts_at": None, "expires_at": None, **kw}  # noqa: E731
    assert feed.is_free_today(deal(expires_at=iso(now + timedelta(hours=3))), start, end, now)
    assert not feed.is_free_today(deal(expires_at=iso(now + timedelta(days=3))), start, end, now)  # weekend BOGO
    assert not feed.is_free_today(deal(starts_at=iso(now + timedelta(days=1))), start, end, now)  # starts tomorrow
    assert not feed.is_free_today({**deal(), "kind": "ongoing"}, start, end, now)


def test_ics_folds_lines_and_defaults_to_two_hours():
    e = {"id": "e1", "title": "Boba; Study, Break " + "ü" * 80, "starts_at": "2026-11-20T03:00:00Z", "ends_at": None,
         "location_text": "USC Village, plaza", "description": "a\nb", "has_freebie": True, "freebie_desc": "Free boba"}
    text = ics.ics(e)
    assert max(len(line.encode()) for line in text.split("\r\n")) <= 75
    assert "DTEND:20261120T050000Z" in text
    assert "\\;" in text and "\\," in text


# ---------------------------------------------------------------------------
# Routes with a fake database
# ---------------------------------------------------------------------------
ALICE, BOB, ADMIN = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
EVENT = {"id": str(uuid.uuid4()), "title": "Hack Night", "starts_at": iso(now_utc() + timedelta(days=2)), "ends_at": None,
         "posted_by": ALICE, "org_id": None, "register_url": None, "location_text": "SAL 101", "status": "published"}


@pytest.fixture
def client(monkeypatch):
    def no_db():
        raise AssertionError("tests must not touch the real database")

    monkeypatch.setattr(store, "get_supabase", no_db)
    monkeypatch.setattr(routes, "get_supabase", no_db)
    monkeypatch.setattr(routes, "db_live", lambda: True)
    profiles = {ALICE: {"id": ALICE, "role": "student"}, BOB: {"id": BOB, "role": "student"}, ADMIN: {"id": ADMIN, "role": "usg_admin"}}
    monkeypatch.setattr(store, "profile", lambda uid: profiles.get(uid))
    monkeypatch.setattr(store, "get_event", lambda eid: dict(EVENT) if eid == EVENT["id"] else None)
    monkeypatch.setattr(store, "get_org", lambda oid: None)
    who = {"id": ALICE}
    app.dependency_overrides[get_user_id] = lambda: who["id"]
    app.dependency_overrides[require_signed_in] = lambda: who["id"]
    c = TestClient(app)
    c.who = who
    yield c
    app.dependency_overrides.clear()


def test_checkin_code_only_for_organizers(client):
    url = f"/api/events/{EVENT['id']}/checkin-code"
    assert client.get(url).status_code == 200  # Alice posted it
    client.who["id"] = BOB
    assert client.get(url).status_code == 403
    client.who["id"] = ADMIN
    assert client.get(url).status_code == 200


def test_create_event_stores_phone_photo_and_drops_foreign_links(client, monkeypatch):
    saved, inserted = [], []
    monkeypatch.setattr(routes, "_store_flyer", lambda data, mime, uid: saved.append(mime) or "https://storage.example/f.jpg")
    monkeypatch.setattr(store, "find_org", lambda name: None)
    monkeypatch.setattr(store, "buildings", lambda: BUILDINGS)
    monkeypatch.setattr(store, "insert_event", lambda row: inserted.append(row) or {"id": "new", **row})
    monkeypatch.setattr(routes.dedupe, "find_duplicate", lambda *a, **k: None)
    body = {"title": "Taco Tuesday", "starts_at": "2026-11-20T19:00:00Z", "location_text": "Tutor Hall 105"}

    r = client.post("/api/events", json={**body, "flyer_url": "data:image/jpeg;base64,/9j/AAAA"})
    assert r.status_code == 201, r.text
    assert saved == ["image/jpeg"] and inserted[-1]["flyer_url"] == "https://storage.example/f.jpg"
    assert inserted[-1]["source"] == "flyer" and inserted[-1]["building_id"] == RTH

    r = client.post("/api/events", json={**body, "flyer_url": "https://evil.example/x.png"})
    assert r.status_code == 201 and inserted[-1]["flyer_url"] is None


def test_create_event_rejects_end_before_start(client, monkeypatch):
    monkeypatch.setattr(routes.dedupe, "find_duplicate", lambda *a, **k: None)
    r = client.post("/api/events", json={"title": "Backwards", "starts_at": "2026-11-20T19:00:00Z", "ends_at": "2026-11-20T18:00:00Z"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_dates"


def test_upload_refuses_svg(client):
    r = client.post("/api/flyers/upload", files={"photo": ("x.svg", b"<svg onload=alert(1)>", "image/svg+xml")})
    assert r.status_code == 415
