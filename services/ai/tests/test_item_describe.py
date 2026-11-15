"""POST /api/items/describe: a found-item photo -> a description the finder can edit.

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import auth
from app.core.config import settings
from app.lostfound import describe
from app.main import app

SIGNED_IN = {"Authorization": "Bearer good-token"}


def _png(size=(1600, 900)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (20, 20, 20)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon")

    async def fake_verify(token):
        return "11111111-1111-1111-1111-111111111111"

    monkeypatch.setattr(auth, "_verify_with_supabase", fake_verify)
    return TestClient(app)


def _post(client, data=None, headers=SIGNED_IN):
    return client.post("/api/items/describe", files={"photo": ("item.png", data or _png(), "image/png")}, headers=headers)


def test_needs_sign_in(client):
    assert _post(client, headers={}).status_code == 401


def test_ai_writes_the_description(client, monkeypatch):
    sent = {}

    def fake_llm(data_url):
        sent["url"] = data_url
        return {"is_item": True, "title": "Black Hydro Flask bottle",
                "description": "A black Hydro Flask   water bottle with a Trojans sticker."}

    monkeypatch.setattr(describe, "_llm_live", lambda: True)
    monkeypatch.setattr(describe, "_ask_llm", fake_llm)
    r = _post(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"title": "Black Hydro Flask bottle",
                        "description": "A black Hydro Flask water bottle with a Trojans sticker.", "source": "ai"}
    # the photo is shrunk and re-encoded (no EXIF / GPS) before it goes to the model
    assert sent["url"].startswith("data:image/jpeg;base64,")
    import base64

    img = Image.open(io.BytesIO(base64.b64decode(sent["url"].split(",", 1)[1])))
    assert max(img.size) == describe.MAX_SIDE


def test_falls_back_to_the_clip_label(client, monkeypatch):
    def broken(data_url):
        raise RuntimeError("model down")

    monkeypatch.setattr(describe, "_llm_live", lambda: True)
    monkeypatch.setattr(describe, "_ask_llm", broken)
    monkeypatch.setattr(describe, "_clip_title", lambda photo: "water bottle")
    assert _post(client).json() == {"title": "water bottle", "description": "Water bottle.", "source": "label"}


def test_not_an_item_and_no_fallback_leaves_it_empty(client, monkeypatch):
    monkeypatch.setattr(describe, "_llm_live", lambda: True)
    monkeypatch.setattr(describe, "_ask_llm", lambda url: {"is_item": False, "title": None, "description": None})
    monkeypatch.setattr(describe, "_clip_title", lambda photo: None)
    assert _post(client).json() == {"title": None, "description": None, "source": "none"}


def test_no_llm_configured_skips_the_model(client, monkeypatch):
    def never(url):
        raise AssertionError("shouldn't call the model")

    monkeypatch.setattr(describe, "_llm_live", lambda: False)
    monkeypatch.setattr(describe, "_ask_llm", never)
    monkeypatch.setattr(describe, "_clip_title", lambda photo: None)
    assert _post(client).json()["source"] == "none"


def test_empty_photo_is_rejected(client):
    r = client.post("/api/items/describe", files={"photo": ("x.png", b"", "image/png")}, headers=SIGNED_IN)
    assert r.status_code == 422
