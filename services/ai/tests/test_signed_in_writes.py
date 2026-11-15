"""Only signed-in students can post / vote / save / check in; anyone can browse.

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import auth
from app.core.config import settings
from app.events.settings import p3
from app.main import app

EV = "e0000000-0000-0000-0000-000000000001"
WRITES = [
    ("POST", "/api/events", {"title": "Test event", "starts_at": "2026-11-20T02:00:00Z"}),
    ("POST", f"/api/events/{EV}/save", {}),
    ("DELETE", f"/api/events/{EV}/save", None),
    ("POST", f"/api/events/{EV}/checkin", {}),
    ("POST", "/api/deals", {"title": "Test deal", "kind": "ongoing"}),
    ("POST", "/api/deals/f0000000-0000-0000-0000-000000000001/vote", {"still_active": True}),
    ("POST", "/api/flyers/scan", {"image_url": "data:image/png;base64,iVBORw0KGgo="}),
    ("PATCH", "/api/me/notify", {"notify_email": True}),
]
READS = ["/api/events/search", "/api/deals/search", "/api/feed", "/api/rewards/progress"]


@pytest.fixture
def live(monkeypatch):
    """Supabase configured (like the hosted app), but P3 data served from mocks so no network."""
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon")
    monkeypatch.setattr(p3, "p3_use_mocks", True)
    return TestClient(app)


@pytest.mark.parametrize(("method", "path", "body"), WRITES)
def test_signed_out_cannot_write(live, method, path, body):
    r = live.request(method, path, json=body)
    assert r.status_code == 401, r.text
    assert "Sign in" in r.json()["error"]["message"]


def test_flyer_upload_needs_sign_in_too(live):
    r = live.post("/api/flyers/upload", files={"photo": ("f.png", b"\x89PNG\r\n\x1a\n", "image/png")})
    assert r.status_code == 401


@pytest.mark.parametrize("path", READS)
def test_signed_out_can_browse(live, path):
    assert live.get(path).status_code == 200


def test_signed_in_can_write(live, monkeypatch):
    async def fake_verify(token):
        assert token == "good-token"
        return "11111111-1111-1111-1111-111111111111"

    monkeypatch.setattr(auth, "_verify_with_supabase", fake_verify)
    r = live.post("/api/events", json={"title": "Test event", "starts_at": "2026-11-20T02:00:00Z"},
                  headers={"Authorization": "Bearer good-token"})
    assert r.status_code == 201


def test_offline_mock_development_still_works(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    r = TestClient(app).post("/api/events", json={"title": "Test event", "starts_at": "2026-11-20T02:00:00Z"})
    assert r.status_code == 201
