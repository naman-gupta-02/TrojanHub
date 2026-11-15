"""Integration: Tommy's log_complaint tool against the REAL complaints endpoint (P1 x P4).

Real mode (USE_MOCKS=false) with Jaymin's in-memory FakeStore from conftest.py, keyword-rule
sorting (no LLM for the classifier), and a scripted fake LLM for Tommy. No network, no keys.

Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import pytest

from app.chat import store as chat_store
from app.core.config import settings
from tests.conftest import ALICE, BOB, GFS, LVL, post
from tests.test_tommy import answer_of, chat, llm, text_step, tool_step  # noqa: F401 - `llm` is a fixture

SAL = "b0000000-0000-0000-0000-000000000005"


@pytest.fixture(autouse=True)
def real_complaints(monkeypatch, client):
    """`client` (conftest) = real mode + FakeStore + logged in as ALICE. The classifier must not
    reach a real LLM from tests, so its credentials are blanked: it uses keyword rules."""
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "llm_base_url", "")
    chat_store.cache_clear()


def confirm(client, card, session, approved=True, edits=None):
    body = {"session_id": session, "action_id": card["action_id"], "approved": approved}
    if edits:
        body["edits"] = edits
    return client.post("/api/chat/confirm", json=body).json()


def card_of(events):
    return next(e for e in events if e["type"] == "confirm")


def test_chat_complaint_creates_a_real_ticket(client, fake, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213", building="GFS", room="213"), text_step("Tap Confirm."))
    card = card_of(chat(client, "it's so hot in GFS 213", session="i1"))
    assert card["summary"] == "Facilities · HVAC · medium · GFS 213"
    assert card["draft"]["building_id"] == GFS and card["draft"]["confidence"] > 0
    assert fake.tickets == []  # a draft writes nothing

    body = confirm(client, card, "i1")
    assert body["status"] == "done"
    assert body["message"].startswith("Logged! Sent to Facilities. You're the first to report this.")
    assert "https://fpm.example/form" in body["message"]

    (ticket,) = fake.tickets
    assert (ticket["building_id"], ticket["room"], ticket["category"], ticket["status"]) == (GFS, "213", "HVAC", "sent")
    (complaint,) = fake.complaints
    assert complaint["source"] == "chat" and complaint["reporter_id"] == ALICE
    assert complaint["raw_text"] == "it's so hot in GFS 213" and complaint["ai_department"] == "Facilities"


def test_chat_report_joins_a_ticket_filed_from_the_form(client, fake, llm):
    """A report from the Report screen and one from chat land on the same ticket."""
    client.who["id"] = BOB
    assert post(client, "AC is broken in GFS 213, room is hot", confirm=True).status_code == 200
    client.who["id"] = ALICE

    llm(tool_step("log_complaint", text="it's so hot in GFS 213, the AC is not working"), text_step("Tap Confirm."))
    card = card_of(chat(client, "it's so hot in GFS 213, the AC is not working", session="i2"))
    assert card["summary"].endswith("1 other student reported this")

    body = confirm(client, card, "i2")
    assert "2 reports on this issue so far" in body["message"]
    assert len(fake.tickets) == 1 and fake.tickets[0]["report_count"] == 2
    assert {c["source"] for c in fake.complaints} == {"form", "chat"}


def test_building_named_outside_the_text(client, fake, llm):
    """The student said the building earlier in the chat; Tommy passes it as `building`."""
    llm(tool_step("log_complaint", text="the wifi keeps dropping", building="Leavey Library"), text_step("Tap Confirm."))
    card = card_of(chat(client, "the wifi keeps dropping", session="i3"))
    assert card["draft"]["building"] == "LVL" and card["draft"]["department"] == "ITS"
    confirm(client, card, "i3")
    assert fake.tickets[0]["building_id"] == LVL


def test_edits_on_the_card_are_filed(client, fake, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Tap Confirm."))
    card = card_of(chat(client, "it's so hot in GFS 213", session="i4"))
    body = confirm(client, card, "i4", edits={"building": "SAL", "room": "101", "anonymous": True})
    assert body["status"] == "done"
    (ticket,) = fake.tickets
    assert (ticket["building_id"], ticket["room"]) == (SAL, "101")
    assert fake.complaints[0]["reporter_id"] is None  # anonymous


def test_cancel_files_nothing(client, fake, llm):
    llm(tool_step("log_complaint", text="broken chair in SAL 101"), text_step("Tap Confirm."))
    card = card_of(chat(client, "broken chair in SAL 101", session="i5"))
    assert confirm(client, card, "i5", approved=False)["status"] == "cancelled"
    assert fake.tickets == [] and fake.complaints == []


def test_safety_report_shows_dps_and_files_nothing(client, fake, llm):
    llm(tool_step("log_complaint", text="I smell gas in SAL 101"),
        text_step(f"Please contact USC DPS right now at {settings.dps_emergency_phone}."))
    events = chat(client, "I smell gas in SAL 101", session="i6")
    assert not any(e["type"] == "confirm" for e in events)
    result = next(e for e in events if e["type"] == "tool_result")["result"]
    assert result["safety"]["dps_phone"] == settings.dps_emergency_phone
    assert "couldn't verify" not in answer_of(events)  # the number came from the endpoint, so it's allowed
    assert fake.tickets == [] and fake.complaints == []


def test_complaints_show_up_in_my_complaints(client, fake, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Tap Confirm."))
    confirm(client, card_of(chat(client, "it's so hot in GFS 213", session="i7")), "i7")
    mine = client.get("/api/complaints/mine").json()["complaints"]
    assert len(mine) == 1 and mine[0]["complaint"]["source"] == "chat" and mine[0]["ticket"]["department"] == "Facilities"


def test_chat_complaint_appears_on_the_admin_dashboard(client, fake, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Tap Confirm."))
    confirm(client, card_of(chat(client, "it's so hot in GFS 213", session="i8")), "i8")
    rows = client.get("/api/admin/complaints").json()
    assert len(rows) == 1
    row = rows[0]
    assert (row["source"], row["ai_department"], row["building"], row["room"]) == ("chat", "Facilities", "GFS", "213")
    assert row["forwarded_to"] and row["status"] == "sent"
