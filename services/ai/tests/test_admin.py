"""Admin dashboard API tests (fakes and fixtures are in conftest.py)."""

import uuid

from conftest import BOB, post

from app.core.config import settings


def seed(client):
    """Alice + Bob report the GFS 213 AC (one ticket, 2 reports); Alice reports a dorm lock and Leavey Wi-Fi."""
    post(client, "the AC is not working in GFS 213", confirm=True, source="chat")
    client.who["id"] = BOB
    post(client, "AC is not working again in GFS 213", confirm=True)
    post(client, "the lock on my door is broken in GFS 110", confirm=True)   # sorted to Facilities
    post(client, "wifi keeps dropping in Leavey", confirm=True)               # ITS: no route in the fake DB
    return client.get("/api/admin/complaints").json()


def test_log_shows_what_was_reported_where_it_went_and_why(client, fake):
    rows = seed(client)
    assert len(rows) == 4 and [r["text"] for r in rows][-1] == "the AC is not working in GFS 213"  # newest first
    ac = rows[-1]
    assert (ac["building"], ac["room"], ac["source"], ac["ai_department"], ac["status"], ac["report_count"]) == ("GFS", "213", "chat", "Facilities", "sent", 2)
    assert ac["forwarded_to"] == "Facilities form" and ac["forwarded_at"] and ac["ai_reason"] and 0 < ac["ai_confidence"] <= 1
    assert "reporter_id" not in ac and "ticket" not in ac
    wifi = rows[0]
    assert (wifi["ai_department"], wifi["status"], wifi["forwarded_to"], wifi["building"], wifi["room"]) == ("ITS", "reported", None, "LVL", None)


def test_filters(client, fake):
    seed(client)
    get = lambda **q: client.get("/api/admin/complaints", params=q).json()  # noqa: E731
    assert len(get(department="Facilities")) == 3 and len(get(department="ITS")) == 1
    assert len(get(building="GFS")) == 3 and len(get(building="LVL")) == 1
    assert len(get(urgency="high")) == 1 and len(get(department="ITS", building="GFS")) == 0
    assert len(get(**{"from": "2030-01-01T00:00:00+00:00"})) == 0


def test_correcting_a_department_reroutes_the_whole_ticket(client, fake):
    rows = seed(client)
    lock = next(r for r in rows if "lock" in r["text"])
    fixed = client.patch(f"/api/admin/complaints/{lock['id']}", json={"corrected_department": "Housing"}).json()
    assert (fixed["ai_department"], fixed["corrected_department"], fixed["forwarded_to"]) == ("Facilities", "Housing", "Housing form")
    ticket = fake.get_ticket(lock["ticket_id"])
    assert (ticket["department"], ticket["route_url"]) == ("Housing", "https://housing.example/form")
    assert len(client.get("/api/admin/complaints", params={"department": "Housing"}).json()) == 1

    # both reports on the AC ticket are corrected together
    ac = next(r for r in rows if r["report_count"] == 2)
    client.patch(f"/api/admin/complaints/{ac['id']}", json={"corrected_department": "Housing"})
    assert [c["corrected_department"] for c in fake.complaints if c["ticket_id"] == ac["ticket_id"]] == ["Housing", "Housing"]

    # picking the AI's own answer again undoes the correction
    undone = client.patch(f"/api/admin/complaints/{lock['id']}", json={"corrected_department": "Facilities"}).json()
    assert (undone["corrected_department"], undone["forwarded_to"]) == (None, "Facilities form")


def test_correcting_to_an_office_with_no_route_clears_forwarding(client, fake):
    rows = seed(client)
    lock = next(r for r in rows if "lock" in r["text"])
    fixed = client.patch(f"/api/admin/complaints/{lock['id']}", json={"corrected_department": "ITS"}).json()
    assert (fixed["corrected_department"], fixed["forwarded_to"], fixed["forwarded_at"]) == ("ITS", None, None)


def test_status_change_and_bad_requests(client, fake):
    rows = seed(client)
    done = client.patch(f"/api/admin/complaints/{rows[0]['id']}", json={"status": "resolved"}).json()
    assert done["status"] == "resolved" and done["corrected_department"] is None
    assert client.patch(f"/api/admin/complaints/{uuid.uuid4()}", json={"status": "sent"}).status_code == 404
    assert client.patch("/api/admin/complaints/nope", json={"status": "sent"}).status_code == 404
    assert client.patch(f"/api/admin/complaints/{rows[0]['id']}", json={"corrected_department": "Dining"}).status_code == 422


def test_stats(client, fake):
    rows = seed(client)
    lock = next(r for r in rows if "lock" in r["text"])
    client.patch(f"/api/admin/complaints/{lock['id']}", json={"corrected_department": "Housing"})
    stats = client.get("/api/admin/stats").json()
    assert (stats["total"], stats["forwarded_pct"], stats["routing_accuracy_pct"]) == (4, 75.0, 75.0)
    assert stats["by_department"][0] == {"department": "Facilities", "count": 2}
    assert {"department": "Housing", "count": 1} in stats["by_department"]
    assert stats["by_building"] == [{"building": "GFS", "count": 3}, {"building": "LVL", "count": 1}]


def test_stats_with_no_complaints(client, fake):
    assert client.get("/api/admin/stats").json() == {"total": 0, "forwarded_pct": 0.0, "routing_accuracy_pct": 0.0, "by_department": [], "by_building": []}


def test_csv_export_escapes_formulas(client, fake):
    post(client, "=HYPERLINK(\"http://x\") broken chair in GFS 213", confirm=True)
    r = client.get("/api/admin/tickets.csv")
    assert r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    header, line = r.text.strip().splitlines()
    assert header.startswith("id,ticket_id,logged_at,text,building") and "'=HYPERLINK" in line and "reporter" not in header


def test_mock_mode_still_serves_the_mocks(client, monkeypatch):
    monkeypatch.setattr(settings, "use_mocks", True)
    assert len(client.get("/api/admin/complaints").json()) == 4
    assert len(client.get("/api/admin/complaints", params={"department": "Housing"}).json()) == 1
    assert client.get("/api/admin/stats").json()["total"] == 25
    assert client.get("/api/admin/tickets.csv").text.startswith("id,ticket_id")
