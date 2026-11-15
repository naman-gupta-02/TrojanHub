"""Photos attached to complaints (P1 proposal for P4).

Students send a photo as a `data:` URL (what the apps produce) or as a link to a file in this
project's Supabase Storage. The AI service checks it and stores it in the PRIVATE
`complaint-photos` bucket. Only the AI service (service role key) can read that bucket; the admin
dashboard gets short-lived signed links. Students never get a public URL to it.

The storage path has no student id in it, so anonymous reports stay anonymous.
"""

from __future__ import annotations

import base64
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.config import settings

MAX_BYTES = 5 * 1024 * 1024  # matches the bucket's file_size_limit in the migration
_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic"}


class PhotoError(ValueError):
    """The photo can't be used; the message is safe to show the student."""


@dataclass
class Photo:
    data: bytes
    mime: str

    @property
    def ext(self) -> str:
        return _TYPES[self.mime]


def _sniff(data: bytes) -> str | None:
    """The real image type from the file's first bytes (never trust the declared type)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"):
        return "image/heic"
    return None


def _check(data: bytes) -> Photo:
    if not data:
        raise PhotoError("The photo is empty.")
    if len(data) > MAX_BYTES:
        raise PhotoError("The photo is too big (max 5 MB).")
    mime = _sniff(data)
    if not mime:
        raise PhotoError("That file isn't a photo (JPG, PNG, WebP or HEIC).")
    return Photo(data, mime)


def _own_storage(url: str) -> bool:
    """Only files already in THIS project's Storage: never fetch arbitrary URLs (SSRF)."""
    base = settings.supabase_url.rstrip("/")
    return bool(base) and url.startswith(f"{base}/storage/v1/object/")


def load_photo(value: str) -> Photo:
    """`data:image/...;base64,...` or a link into this project's Storage -> checked Photo."""
    value = value.strip()
    if value.startswith("data:"):
        header, _, payload = value.partition(",")
        if ";base64" not in header:
            raise PhotoError("Send the photo base64-encoded.")
        if len(payload) > MAX_BYTES * 4 // 3 + 8:  # don't even decode something far too big
            raise PhotoError("The photo is too big (max 5 MB).")
        try:
            return _check(base64.b64decode(payload, validate=True))
        except (ValueError, base64.binascii.Error) as e:
            if isinstance(e, PhotoError):
                raise
            raise PhotoError("The photo couldn't be read.") from e
    if _own_storage(value):
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get(value)
                r.raise_for_status()
        except httpx.HTTPError as e:
            raise PhotoError("Couldn't download the photo from storage.") from e
        return _check(r.content)
    raise PhotoError("Attach the photo itself, not a link to another website.")


def new_path(photo: Photo) -> str:
    """Storage path inside the bucket: date/random-id.ext (no student id, so anonymity holds)."""
    return f"{datetime.now(timezone.utc):%Y-%m-%d}/{uuid.uuid4().hex}.{photo.ext}"
