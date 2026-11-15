"""REAL_FEATURES: one feature can go live while the others still serve mocks.

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.chat import store as chat_store
from app.core.auth import feature_of
from app.core.config import settings
from app.main import app
from tests.test_tommy import chat, llm, text_step, tool_step  # noqa: F401 - `llm` is a fixture


@pytest.fixture
def anon(monkeypatch):
    """A visitor who is not signed in, USE_MOCKS=true, Supabase off."""
    monkeypatch.setattr(settings, "use_mocks", True)
    monkeypatch.setattr(settings, "supabase_url", "")
    chat_store.cache_clear()
    return TestClient(app)


def test_mock_per_feature(monkeypatch):
    monkeypatch.setattr(settings, "use_mocks", True)
    assert settings.mock("complaints") and settings.mock("events")
    monkeypatch.setattr(settings, "real_features", "complaints, Admin")
    assert not settings.mock("complaints") and not settings.mock("admin")
    assert settings.mock("events") and settings.mock("lostfound") and settings.mock("chat")
    monkeypatch.setattr(settings, "use_mocks", False)  # USE_MOCKS=false: nothing is mocked
    assert not settings.mock("events")


@pytest.mark.parametrize(("path", "feature"), [
    ("/api/chat", "chat"), ("/api/chat/confirm", "chat"),
    ("/api/items/search", "lostfound"),
    ("/api/flyers/scan", "events"), ("/api/events/x/save", "events"), ("/api/deals/search", "events"),
    ("/api/rewards/progress", "events"), ("/api/feed", "events"),
    ("/api/notify/reminders", "notify"), ("/api/me/notify", "notify"), ("/api/me/events", "events"),
    ("/api/complaints/mine", "complaints"), ("/api/tickets/x/upvote", "complaints"),
    ("/api/admin/stats", "admin"),
    ("/health", ""),
])
def test_every_endpoint_maps_to_its_feature(path, feature):
    assert feature_of(path) == feature


def test_openapi_paths_all_have_a_feature():
    """A new endpoint must be added to core/auth.py _FEATURES, or it would never count as real."""
    for path in app.openapi()["paths"]:
        if path.startswith("/api/"):
            assert feature_of(path), f"{path} has no feature in app/core/auth.py"


def test_mocked_features_work_signed_out_but_real_ones_need_login(anon, monkeypatch):
    monkeypatch.setattr(settings, "real_features", "complaints,admin")
    assert anon.get("/api/feed").status_code == 200  # still a mock, demo user is fine
    assert anon.get("/api/items/search?q=bottle").status_code == 200

    r = anon.post("/api/complaints", json={"text": "it's so hot in GFS 213"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    assert anon.get("/api/complaints/mine").status_code == 401
    assert anon.get("/api/admin/stats").status_code == 401
    assert anon.get("/health").json()["real_features"] == ["complaints", "admin"]


def test_everything_mocked_by_default(anon):
    assert anon.post("/api/complaints", json={"text": "it's so hot in GFS 213"}).json()["draft"]["department"] == "Facilities"
    assert anon.get("/api/admin/stats").status_code == 200
    assert anon.get("/health").json()["real_features"] == []


def test_tommy_asks_signed_out_student_to_sign_in(anon, monkeypatch, llm):
    """Complaints are real, the student isn't signed in: no card, and Tommy is told why."""
    monkeypatch.setattr(settings, "real_features", "complaints")
    llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Please sign in first."))
    events = chat(anon, "it's so hot in GFS 213", session="so1")
    assert not any(e["type"] == "confirm" for e in events)
    result = next(e for e in events if e["type"] == "tool_result")["result"]
    assert result["status"] == 401 and "sign in" in result["note"]


def test_chat_can_be_limited_to_signed_in_students(anon, monkeypatch):
    monkeypatch.setattr(settings, "real_features", "complaints,admin,chat")
    r = anon.post("/api/chat", json={"session_id": "x", "message": "hi"})
    assert r.status_code == 401
    assert anon.get("/api/events/search").status_code == 200  # browsing still open
