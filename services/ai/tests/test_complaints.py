"""Smart Complaints tests. No keys, network or model needed: the DB, LLM and embeddings are faked.

Run from services/ai:   python -m pytest tests -q        (needs: pip install pytest)
"""

import json
import math
import re
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import app` works from anywhere

from app.complaints import classify as classify_mod  # noqa: E402
from app.complaints import routes as routes_mod  # noqa: E402
from app.complaints import store  # noqa: E402
from app.complaints.classify import classify, find_building, find_room, safety_keyword  # noqa: E402
from app.complaints.dedupe import find_duplicate  # noqa: E402
from app.complaints.routing import build_route  # noqa: E402
from app.core.auth import get_user_id  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402

GFS = "b0000000-0000-0000-0000-000000000001"
LVL = "b0000000-0000-0000-0000-000000000002"
BUILDINGS = [
    {"id": GFS, "code": "GFS", "name": "Grace Ford Salvatori Hall"},
    {"id": LVL, "code": "LVL", "name": "Leavey Library"},
    {"id": "b0000000-0000-0000-0000-000000000005", "code": "SAL", "name": "Salvatori Computer Science Center"},
]
ALICE, BOB = str(uuid.uuid4()), str(uuid.uuid4())


def fake_embed(text: str) -> list[float]:
    """Bag-of-words vector: texts that share words are similar. Stands in for the real model."""
    vec = [0.0] * 64
    for word in re.findall(r"[a-z]+", text.lower()):
        vec[sum(map(ord, word)) % 64] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class FakeStore:
    """In-memory stand-in for app.complaints.store."""

    def __init__(self):
        self.tickets: list[dict] = []
        self.complaints: list[dict] = []
        self.routes = [{"department": "Facilities", "category": "*", "form_url": "https://fpm.example/form", "email": None}]

    def list_buildings(self):
        return BUILDINGS

    def _public(self, t):
        return {k: v for k, v in t.items() if k != "embedding"}

    def get_ticket(self, ticket_id):
        return next((self._public(t) for t in self.tickets if t["id"] == ticket_id), None)

    def get_tickets(self, ids):
        return [self._public(t) for t in self.tickets if t["id"] in ids]

    def similar_open_tickets(self, embedding, building_id, limit=10):
        rows = [
            {"id": t["id"], "similarity": sum(a * b for a, b in zip(embedding, t["embedding"]))}
            for t in self.tickets
            if t["building_id"] == building_id and t["status"] != "resolved" and t["embedding"]
        ]
        return sorted(rows, key=lambda r: -r["similarity"])[:limit]

    def recent_open_tickets(self, building_id, category):
        return [self._public(t) for t in self.tickets
                if t["building_id"] == building_id and t["category"] == category and t["status"] != "resolved"]

    def insert_ticket(self, row):
        ticket = {"id": str(uuid.uuid4()), "report_count": 1, "created_at": "2026-11-14T17:00:00+00:00", **row}
        self.tickets.append(ticket)
        return self._public(ticket)

    def add_report(self, ticket_id):
        for t in self.tickets:
            if t["id"] == ticket_id:
                t["report_count"] += 1
                return self._public(t)
        return None

    def has_reported(self, ticket_id, reporter_id):
        return any(c["ticket_id"] == ticket_id and c["reporter_id"] == reporter_id for c in self.complaints)

    def insert_complaint(self, row):
        complaint = {"id": str(uuid.uuid4()), "created_at": "2026-11-14T17:05:00+00:00", "corrected_department": None, **row}
        self.complaints.append(complaint)
        return complaint

    def complaints_for(self, reporter_id):
        return [{**c, "ticket": self.get_ticket(c["ticket_id"])} for c in self.complaints if c["reporter_id"] == reporter_id]

    def routes_for(self, department):
        return [r for r in self.routes if r["department"] == department]


@pytest.fixture
def fake(monkeypatch):
    """Real mode (USE_MOCKS=false) with a fake DB, fake embeddings and no LLM (keyword rules)."""
    db = FakeStore()
    for name in ("list_buildings", "get_ticket", "get_tickets", "similar_open_tickets", "recent_open_tickets",
                 "insert_ticket", "add_report", "has_reported", "insert_complaint", "complaints_for", "routes_for"):
        monkeypatch.setattr(store, name, getattr(db, name))
    monkeypatch.setattr(routes_mod, "embed_text", fake_embed)
    monkeypatch.setattr(settings, "use_mocks", False)
    monkeypatch.setattr(settings, "llm_model", "")
    routes_mod._sorted.clear()
    return db


@pytest.fixture
def client(fake):
    who = {"id": ALICE}
    app.dependency_overrides[get_user_id] = lambda: who["id"]
    c = TestClient(app)
    c.who = who
    yield c
    app.dependency_overrides.clear()


def post(client, text, **body):
    return client.post("/api/complaints", json={"text": text, **body})


# --- classify --------------------------------------------------------------
def test_rules_sort_the_demo_sentence(fake):
    r = classify("it's so hot in GFS 213", BUILDINGS)
    assert (r.department, r.category, r.building_code, r.room) == ("Facilities", "HVAC", "GFS", "213")
    assert not r.is_safety and r.engine == "rules" and "keyword rules" in r.reason


def test_rules_send_dorm_problems_to_housing(fake):
    r = classify("door lock battery dead in my dorm room", BUILDINGS)
    assert (r.department, r.category) == ("Housing", "locks")


@pytest.mark.parametrize("text", ["smell of gas in SAL 101", "someone is hurt outside Leavey", "there is smoke in the hallway", "the outlet is sparking"])
def test_safety_phrases_are_caught(text):
    assert safety_keyword(text)


@pytest.mark.parametrize("text", ["the fire alarm keeps chirping, low battery", "fire extinguisher cabinet is open", "it's so hot in GFS 213", "gas station receipt left on the desk"])
def test_ordinary_reports_are_not_safety(text):
    assert safety_keyword(text) is None


def test_building_and_room_lookup():
    assert find_building("wifi keeps dropping in Leavey", BUILDINGS) == "LVL"
    assert find_building("too cold in gfs 110", BUILDINGS) == "GFS"
    assert find_building("the salvatori lab is dirty", BUILDINGS) is None  # "Salvatori" is in two names
    assert find_room("broken chair in room 12b", None) == "12B"
    assert find_room("too cold in gfs-110", "GFS") == "110"
    assert find_room("3 chairs broken in GFS", "GFS") is None


def _fake_llm(monkeypatch, content: str):
    reply = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
    completions = SimpleNamespace(create=lambda **kwargs: reply)
    monkeypatch.setattr(classify_mod, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=completions)))
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")


def test_llm_answer_is_used_and_checked(fake, monkeypatch):
    _fake_llm(monkeypatch, "Here you go:\n```json\n" + json.dumps({
        "department": "Facilities", "category": "hvac", "urgency": "medium", "building_code": "gfs", "room": "Room 213",
        "summary": "Air conditioning not working, room too hot", "is_safety": False, "confidence": 1.7,
        "reason": "mentions heat + a room -> HVAC -> Facilities"}) + "\n```")
    r = classify("it's so hot in GFS 213", BUILDINGS)
    assert r.engine == "llm"
    assert (r.category, r.building_code, r.room, r.confidence) == ("HVAC", "GFS", "213", 1.0)


@pytest.mark.parametrize("content", ["sorry, I can't help", '{"department": "Dining"}', ""])
def test_bad_llm_answer_falls_back_to_rules(fake, monkeypatch, content):
    _fake_llm(monkeypatch, content)
    r = classify("wifi keeps dropping in Leavey", BUILDINGS)
    assert (r.engine, r.department, r.building_code) == ("rules", "ITS", "LVL")


def test_safety_keyword_overrides_an_llm_that_missed_it(fake, monkeypatch):
    _fake_llm(monkeypatch, json.dumps({"department": "Facilities", "category": "other", "urgency": "low",
                                       "summary": "Odd smell", "is_safety": False, "confidence": 0.6, "reason": "smell"}))
    r = classify("I smell gas in SAL 101", BUILDINGS)
    assert r.is_safety and (r.department, r.urgency) == ("DPS", "safety")


# --- dedupe and routing ----------------------------------------------------
@pytest.mark.parametrize("similarity,category,room,expected", [
    (0.50, "HVAC", "213", True),         # same category, similar enough
    (0.40, "HVAC", "213", False),        # same category, different problem
    (0.50, "electrical", "213", False),  # other category needs 0.80
    (0.85, "electrical", "213", True),
    (0.90, "HVAC", "101", False),        # different room
    (0.90, "HVAC", None, True),          # no room given: building-level match
])
def test_dedupe_cutoffs(monkeypatch, similarity, category, room, expected):
    ticket = {"id": "t1", "room": "213", "category": "HVAC", "report_count": 3}
    monkeypatch.setattr(store, "similar_open_tickets", lambda emb, building, limit=10: [{"id": "t1", "similarity": similarity}])
    monkeypatch.setattr(store, "get_tickets", lambda ids: [ticket])
    found = find_duplicate(embedding=[0.1], building_id=GFS, room=room, category=category)
    assert (found is not None) == expected


def test_dedupe_never_merges_without_a_building():
    assert find_duplicate(embedding=[0.1], building_id=None, room="213", category="HVAC") is None


def test_route_link_is_a_form_or_a_prefilled_email():
    args = dict(department="Facilities", summary="AC not working", building_code="GFS", room="213", urgency="medium")
    assert build_route({"form_url": "https://fpm.example/form", "email": None}, **args) == ("https://fpm.example/form", "Facilities form")
    url, label = build_route({"form_url": None, "email": "help@example.edu"}, **args)
    assert url.startswith("mailto:help@example.edu?subject=Maintenance%20report%3A%20AC%20not%20working") and label == "Facilities email"
    assert "not%20an%20official" in url
    assert build_route(None, **args) == (None, None)


# --- endpoints -------------------------------------------------------------
def test_draft_writes_nothing(client, fake):
    r = post(client, "it's so hot in GFS 213")
    assert r.status_code == 200
    draft = r.json()["draft"]
    assert (draft["department"], draft["category"], draft["building"], draft["building_id"], draft["room"]) == ("Facilities", "HVAC", "GFS", GFS, "213")
    assert "duplicate_ticket" not in r.json() and "safety" not in r.json()
    assert fake.tickets == [] and fake.complaints == []


def test_confirm_creates_a_routed_ticket(client, fake):
    r = post(client, "it's so hot in GFS 213", confirm=True, source="chat")
    body = r.json()
    assert r.status_code == 200 and body["route_url"] == "https://fpm.example/form"
    assert body["ticket"]["status"] == "sent" and body["ticket"]["report_count"] == 1 and "embedding" not in body["ticket"]
    complaint = fake.complaints[0]
    assert (complaint["reporter_id"], complaint["source"], complaint["ai_department"], complaint["forwarded_to"]) == (ALICE, "chat", "Facilities", "Facilities form")
    assert complaint["forwarded_at"] and complaint["ai_reason"]


def test_no_route_on_file_stays_reported(client, fake):
    r = post(client, "wifi keeps dropping in Leavey", confirm=True)  # ITS has no route in the fake DB
    assert r.json()["ticket"]["status"] == "reported" and r.json()["route_url"] is None
    assert fake.complaints[0]["forwarded_to"] is None and fake.complaints[0]["forwarded_at"] is None


def test_second_student_joins_the_same_ticket(client, fake):
    first = post(client, "the AC is not working in GFS 213", confirm=True).json()["ticket"]
    client.who["id"] = BOB
    draft = post(client, "AC is not working again in GFS 213").json()
    assert draft["duplicate_ticket"] == {"id": first["id"], "report_count": 1}
    merged = post(client, "AC is not working again in GFS 213", confirm=True).json()["ticket"]
    assert merged["id"] == first["id"] and merged["report_count"] == 2
    assert len(fake.tickets) == 1 and len(fake.complaints) == 2


def test_same_student_cannot_inflate_the_count(client, fake):
    post(client, "the AC is not working in GFS 213", confirm=True)
    again = post(client, "AC is not working again in GFS 213", confirm=True).json()["ticket"]
    assert again["report_count"] == 1 and len(fake.complaints) == 1


def test_other_room_or_other_problem_gets_its_own_ticket(client, fake):
    post(client, "the AC is not working in GFS 213", confirm=True)
    client.who["id"] = BOB
    post(client, "the AC is not working in GFS 101", confirm=True)
    post(client, "broken chair in GFS 213", confirm=True)
    assert len(fake.tickets) == 3


def test_anonymous_report_has_no_reporter(client, fake):
    post(client, "broken chair in GFS 213", confirm=True, anonymous=True)
    assert fake.complaints[0]["reporter_id"] is None
    assert client.get("/api/complaints/mine").json() == {"complaints": []}


def test_safety_shows_dps_and_never_creates_a_ticket(client, fake):
    for confirm in (False, True):
        body = post(client, "I smell gas in SAL 101", confirm=confirm).json()
        assert body["safety"]["dps_phone"] == settings.dps_emergency_phone and "911" in body["safety"]["message"]
        assert (body["draft"]["department"], body["draft"]["urgency"]) == ("DPS", "safety") and "ticket" not in body
    assert fake.tickets == [] and fake.complaints == []


def test_form_fields_win_over_the_text(client, fake):
    draft = post(client, "it's so hot in GFS 213", building_id=LVL, room="b12").json()["draft"]
    assert (draft["building"], draft["building_id"], draft["room"]) == ("LVL", LVL, "B12")
    assert post(client, "too hot", building_id=str(uuid.uuid4())).status_code == 422


def test_mine_and_upvote(client, fake):
    ticket = post(client, "it's so hot in GFS 213", confirm=True).json()["ticket"]
    mine = client.get("/api/complaints/mine").json()["complaints"]
    assert len(mine) == 1 and mine[0]["ticket"]["id"] == ticket["id"] and mine[0]["complaint"]["raw_text"] == "it's so hot in GFS 213"
    assert "ticket" not in mine[0]["complaint"]
    assert client.post(f"/api/tickets/{ticket['id']}/upvote").json() == {"report_count": 2}
    assert client.post(f"/api/tickets/{uuid.uuid4()}/upvote").status_code == 404
    assert client.post("/api/tickets/not-a-uuid/upvote").status_code == 404


def test_bad_input_and_db_failure_use_the_error_shape(client, fake, monkeypatch):
    r = post(client, "   ")
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_text"
    assert post(client, "x" * 2001).json()["error"]["code"] == "text_too_long"

    def boom():
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")
    monkeypatch.setattr(store, "list_buildings", boom)
    r = post(client, "it's so hot in GFS 213")
    assert r.status_code == 502 and r.json()["error"]["code"] == "complaints_unavailable"


def test_mock_mode_still_serves_the_mocks(client, monkeypatch):
    monkeypatch.setattr(settings, "use_mocks", True)
    assert post(client, "it's so hot in GFS 213").json()["draft"]["department"] == "Facilities"
    assert "safety" in post(client, "smell of gas").json()
    assert client.post("/api/tickets/x/upvote").json() == {"report_count": 6}
