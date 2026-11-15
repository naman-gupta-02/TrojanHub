"""Shared test setup: real mode (USE_MOCKS=false) with the DB, LLM and embeddings faked.

No keys, network or model needed. Run from services/ai:   python -m pytest tests -q
"""

import math
import re
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import app` works from anywhere

from app.complaints import routes as routes_mod  # noqa: E402
from app.complaints import store  # noqa: E402
from app.core.auth import get_user_id, require_admin  # noqa: E402
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
        self.routes = [  # ITS has no route on purpose
            {"department": "Facilities", "category": "*", "form_url": "https://fpm.example/form", "email": None},
            {"department": "Housing", "category": "*", "form_url": "https://housing.example/form", "email": None},
        ]

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

    # admin dashboard
    def admin_complaints(self, since=None, complaint_id=None):
        codes = {b["id"]: b["code"] for b in BUILDINGS}
        rows = []
        for c in reversed(self.complaints):  # newest first
            if complaint_id and c["id"] != complaint_id:
                continue
            if since and c["created_at"] < since:
                continue
            t = self.get_ticket(c["ticket_id"]) or {}
            rows.append({**c, "ticket": {k: t.get(k) for k in ("status", "urgency", "report_count")} if t else None,
                         "building": {"code": codes[c["building_id"]]} if c.get("building_id") else None})
        return rows

    def update_complaint(self, complaint_id, fields):
        for c in self.complaints:
            if c["id"] == complaint_id:
                c.update(fields)

    def update_ticket_complaints(self, ticket_id, fields):
        for c in self.complaints:
            if c["ticket_id"] == ticket_id:
                c.update(fields)

    def update_ticket(self, ticket_id, fields):
        for t in self.tickets:
            if t["id"] == ticket_id:
                t.update(fields)


@pytest.fixture(autouse=True)
def no_real_features_from_env(monkeypatch):
    """REAL_FEATURES in a developer's .env must not change what the tests exercise."""
    monkeypatch.setattr(settings, "real_features", "")


@pytest.fixture
def fake(monkeypatch):
    """Real mode (USE_MOCKS=false) with a fake DB, fake embeddings and no LLM (keyword rules)."""
    db = FakeStore()
    for name in (n for n in dir(db) if not n.startswith("_") and callable(getattr(db, n))):
        monkeypatch.setattr(store, name, getattr(db, name))  # raises if store.py has no such function
    monkeypatch.setattr(routes_mod, "embed_text", fake_embed)
    monkeypatch.setattr(settings, "use_mocks", False)
    monkeypatch.setattr(settings, "llm_model", "")
    routes_mod._sorted.clear()
    return db


@pytest.fixture
def client(fake):
    who = {"id": ALICE}
    app.dependency_overrides[get_user_id] = lambda: who["id"]
    app.dependency_overrides[require_admin] = lambda: who["id"]
    c = TestClient(app)
    c.who = who
    yield c
    app.dependency_overrides.clear()


def post(client, text, **body):
    return client.post("/api/complaints", json={"text": text, **body})
