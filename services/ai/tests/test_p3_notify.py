"""P3 notifications: digest, reminders and the notify routes, with the database, email and push faked.

No keys, network or database needed. Run from services/ai:   python -m pytest tests -q
"""

import sys
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import app` works from anywhere

from app.core.auth import get_user_id, require_admin, require_signed_in  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.events import store  # noqa: E402
from app.events.dates import iso, now_utc  # noqa: E402
from app.main import app  # noqa: E402
from app.notify import digest, reminders  # noqa: E402
from app.notify import routes as notify_routes  # noqa: E402
from app.notify.email import EmailError  # noqa: E402

ALICE, BOB, ADMIN = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
FREEBIE = {"kind": "event", "event": {"id": str(uuid.uuid4()), "title": "Boba Study Break", "category": "free_food",
                                      "starts_at": iso(now_utc() + timedelta(hours=1)), "ends_at": None,
                                      "location_text": "USC Village", "freebie_desc": "Free boba"}}


@pytest.fixture
def fake_db(monkeypatch):
    def no_db():
        raise AssertionError("tests must not touch the real database")

    monkeypatch.setattr(store, "get_supabase", no_db)
    log: set[tuple] = set()

    def claim(uid, kind, ref):
        if (uid, kind, ref) in log:
            return False
        log.add((uid, kind, ref))
        return True

    monkeypatch.setattr(store, "log_notification", claim)
    monkeypatch.setattr(store, "unlog_notification", lambda uid, kind, ref: log.discard((uid, kind, ref)))
    monkeypatch.setattr(store, "user_email", lambda uid: f"{uid[:4]}@usc.edu")
    monkeypatch.setattr(digest, "todays_items", lambda: [FREEBIE])
    monkeypatch.setattr(digest, "email_configured", lambda: True)
    return log


def test_digest_failed_email_is_retried_next_run(fake_db, monkeypatch):
    monkeypatch.setattr(store, "notify_profiles", lambda: [{"id": ALICE, "notify_email": True, "notify_categories": []}])

    def fail(*a, **k):
        raise EmailError("Resend said 500")

    monkeypatch.setattr(digest, "send_email", fail)
    first = digest.run()
    assert first["email"] == 0 and first["errors"] and not fake_db  # slot given back

    sent = []
    monkeypatch.setattr(digest, "send_email", lambda to, *a: sent.append(to) or "id")
    assert digest.run()["email"] == 1 and len(sent) == 1
    assert digest.run()["already_sent"] == 1 and len(sent) == 1  # once per day


def test_digest_skips_people_we_cannot_reach(fake_db, monkeypatch):
    monkeypatch.setattr(store, "notify_profiles", lambda: [{"id": BOB, "notify_push": True, "expo_push_token": None}])
    assert digest.run()["sent"] == 0 and not fake_db  # no slot used, so it works once they add a token


def test_digest_respects_categories():
    career = {"kind": "event", "event": {**FREEBIE["event"], "category": "career"}}
    assert digest.for_user([FREEBIE, career], ["career"]) == [career]
    assert digest.for_user([FREEBIE, career], ["free_food"]) == [FREEBIE, career]  # "free food" = every freebie
    assert digest.for_user([FREEBIE], []) == [FREEBIE]  # nothing picked = everything
    deal ={"kind": "deal", "deal": {"title": "Free cookies"}}
    assert digest.for_user([deal], ["career"]) == [] and digest.for_user([deal], ["deals"]) == [deal]


def test_digest_email_links_escape_ampersands():
    html = digest.render_html([FREEBIE], "Tommy", ALICE)
    assert "&amp;s=" in html and "&amp;day=" in html


def test_reminder_sent_once_even_when_a_run_was_late(monkeypatch):
    soon = {"id": str(uuid.uuid4()), "title": "Hack Night", "starts_at": iso(now_utc() + timedelta(minutes=8)),
            "location_text": "SAL 101", "has_freebie": False}
    saves = [{"id": "s1", "event_id": soon["id"], "user_id": ALICE, "reminder_sent_at": None}]
    seen_window = []

    def starting_between(lo, hi):
        seen_window.append((lo, hi))
        return [soon] if lo <= now_utc() + timedelta(minutes=8) < hi else []

    monkeypatch.setattr(store, "events_starting_between", starting_between)
    monkeypatch.setattr(store, "events_tickets_open_between", lambda lo, hi: [])
    monkeypatch.setattr(store, "saves_for_events", lambda ids: [s for s in saves if s["event_id"] in ids])
    monkeypatch.setattr(store, "mark_reminder_sent", lambda sid: saves[0].update(reminder_sent_at="now"))
    titles = []
    monkeypatch.setattr(reminders, "_notify", lambda uid, title, *a: titles.append(title) or (1, None))

    reminders.run()
    reminders.run()
    assert titles == ["Starts in 8 min: Hack Night"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@pytest.fixture
def client(fake_db, monkeypatch):
    monkeypatch.setattr(notify_routes, "db_live", lambda: True)
    monkeypatch.setattr(notify_routes, "email_configured", lambda: True)
    profiles = {ALICE: {"id": ALICE, "role": "student"}, ADMIN: {"id": ADMIN, "role": "usg_admin", "name": "Admin"}}
    monkeypatch.setattr(store, "profile", lambda uid: profiles.get(uid))
    updates = []
    monkeypatch.setattr(store, "update_profile", lambda uid, fields: updates.append((uid, fields)))
    sends = []
    monkeypatch.setattr(digest, "send_to_email", lambda to, *a: sends.append(to) or {"sent": 1, "to": to})
    notify_routes._digest_now_sent.clear()
    who = {"id": ALICE}
    app.dependency_overrides[get_user_id] = lambda: who["id"]
    app.dependency_overrides[require_admin] = lambda: who["id"]  # what a mocked admin feature does
    app.dependency_overrides[require_signed_in] = lambda: who["id"]
    c = TestClient(app)
    c.who, c.updates, c.sends = who, updates, sends
    yield c
    app.dependency_overrides.clear()


def test_digest_now_admins_only_and_usc_only(client):
    assert client.post("/api/notify/digest-now", json={"email": "x@usc.edu"}).status_code == 403
    client.who["id"] = ADMIN
    assert client.post("/api/notify/digest-now", json={"email": "someone@gmail.com"}).status_code == 422
    r = client.post("/api/notify/digest-now", json={"email": "presenter@usc.edu"})
    assert r.status_code == 200 and client.sends == ["presenter@usc.edu"]


def test_digest_now_is_rate_limited(client):
    client.who["id"] = ADMIN
    codes = [client.post("/api/notify/digest-now", json={"email": "p@usc.edu"}).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[5] == 429


def test_cron_endpoints_need_a_secret_with_real_data(client, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "")
    assert client.post("/api/notify/daily-digest").status_code == 403
    assert client.post("/api/notify/reminders").status_code == 403


def test_unsubscribe_asks_before_changing_anything(client):
    sig = digest.unsubscribe_sig(ALICE)
    page = client.get(f"/api/notify/unsubscribe?u={ALICE}&s={sig}")
    assert page.status_code == 200 and "<form" in page.text and client.updates == []
    done = client.post(f"/api/notify/unsubscribe?u={ALICE}&s={sig}")
    assert done.status_code == 200 and client.updates == [(ALICE, {"notify_email": False})]
    assert client.post(f"/api/notify/unsubscribe?u={ALICE}&s=wrong").status_code == 400
