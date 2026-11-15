"""Photos on complaints: checked, stored privately on confirm, signed links for admins only.

Real mode with the in-memory FakeStore (conftest.py). Run from services/ai:  python -m pytest tests -q
"""

from __future__ import annotations

import base64

import pytest

from app.complaints import photos
from app.core.config import settings
from tests.conftest import ALICE, BOB, post

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


def data_url(raw: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


# ---------------------------------------------------------------------------
# load_photo: what is accepted
# ---------------------------------------------------------------------------
def test_accepts_real_images_and_trusts_bytes_not_labels():
    assert photos.load_photo(data_url(JPEG)).mime == "image/jpeg"
    assert photos.load_photo(data_url(PNG, "image/jpeg")).mime == "image/png"  # label lies, bytes win


@pytest.mark.parametrize(("value", "message"), [
    (data_url(b"%PDF-1.7 not an image"), "isn't a photo"),
    (data_url(b""), "empty"),
    ("data:image/jpeg,notbase64", "base64"),
    ("data:image/jpeg;base64,@@@", "couldn't be read"),
    (data_url(b"\xff\xd8\xff" + b"\x00" * (photos.MAX_BYTES + 1)), "too big"),
    ("https://evil.example.com/cat.jpg", "not a link to another website"),
    ("http://169.254.169.254/latest/meta-data", "not a link to another website"),  # no SSRF
])
def test_rejects_bad_photos(value, message):
    with pytest.raises(photos.PhotoError, match=message):
        photos.load_photo(value)


def test_storage_paths_have_no_student_id():
    path = photos.new_path(photos.Photo(JPEG, "image/jpeg"))
    assert path.endswith(".jpg") and ALICE not in path and path.count("/") == 1


# ---------------------------------------------------------------------------
# /complaints
# ---------------------------------------------------------------------------
def test_draft_checks_the_photo_but_stores_nothing(client, fake):
    r = post(client, "it's so hot in GFS 213", photo=data_url(JPEG))
    assert r.status_code == 200 and "draft" in r.json()
    assert fake.photos == {} and fake.tickets == []


def test_bad_photo_is_refused_before_anything_is_written(client, fake):
    r = post(client, "it's so hot in GFS 213", photo=data_url(b"not an image"), confirm=True)
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_photo"
    assert fake.tickets == [] and fake.complaints == [] and fake.photos == {}


def test_confirm_stores_the_photo_privately(client, fake):
    r = post(client, "it's so hot in GFS 213", photo=data_url(JPEG), confirm=True)
    assert r.status_code == 200 and r.json()["photo_saved"] is True
    (path,) = fake.photos
    assert fake.photos[path] == (JPEG, "image/jpeg")
    assert fake.complaints[0]["photo_path"] == path


def test_no_photo_means_no_upload(client, fake):
    assert post(client, "it's so hot in GFS 213", confirm=True).json()["photo_saved"] is False
    assert fake.photos == {} and "photo_path" not in fake.complaints[0]  # column not even sent


def test_photo_on_a_duplicate_report_is_kept_on_that_report(client, fake):
    post(client, "AC is broken in GFS 213, room is hot", confirm=True)
    client.who["id"] = BOB
    post(client, "it's so hot in GFS 213, the AC is not working", photo=data_url(PNG), confirm=True)
    assert len(fake.tickets) == 1 and fake.tickets[0]["report_count"] == 2
    assert [bool(c.get("photo_path")) for c in fake.complaints] == [False, True]


def test_failed_write_removes_the_uploaded_photo(client, fake, monkeypatch):
    from app.complaints import store

    def broken(row):
        raise RuntimeError("db down")

    monkeypatch.setattr(store, "insert_complaint", broken)
    r = post(client, "it's so hot in GFS 213", photo=data_url(JPEG), confirm=True)
    assert r.status_code == 502
    assert fake.photos == {}  # no orphan left behind


def test_safety_reports_never_store_a_photo(client, fake):
    r = post(client, "I smell gas in SAL 101", photo=data_url(JPEG), confirm=True)
    assert "safety" in r.json() and fake.photos == {} and fake.tickets == []


def test_my_complaints_hides_the_storage_path(client, fake):
    post(client, "it's so hot in GFS 213", photo=data_url(JPEG), confirm=True)
    (mine,) = client.get("/api/complaints/mine").json()["complaints"]
    assert mine["complaint"]["has_photo"] is True and "photo_path" not in mine["complaint"]


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------
def test_admin_rows_get_a_signed_link(client, fake):
    post(client, "it's so hot in GFS 213", photo=data_url(JPEG), confirm=True)
    post(client, "wifi keeps dropping in Leavey", confirm=True)
    rows = client.get("/api/admin/complaints").json()
    with_photo = [r for r in rows if r["photo_url"]]
    assert len(with_photo) == 1 and "/sign/complaint-photos/" in with_photo[0]["photo_url"]
    assert all("photo_path" not in r for r in rows)
    one = client.patch(f"/api/admin/complaints/{with_photo[0]['id']}", json={"status": "resolved"}).json()
    assert one["photo_url"] == with_photo[0]["photo_url"]


def test_admin_dashboard_survives_a_storage_error(client, fake, monkeypatch):
    from app.complaints import store

    post(client, "it's so hot in GFS 213", photo=data_url(JPEG), confirm=True)

    def down(paths):
        raise RuntimeError("storage down")

    monkeypatch.setattr(store, "signed_photo_urls", down)
    r = client.get("/api/admin/complaints")
    assert r.status_code == 200 and r.json()[0]["photo_url"] is None


def test_mock_mode_accepts_the_field(client, monkeypatch):
    monkeypatch.setattr(settings, "use_mocks", True)
    assert post(client, "it's so hot in GFS 213", photo=data_url(JPEG)).status_code == 200
