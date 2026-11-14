"""In-memory chat state: recent history per session + actions waiting for a "yes".

Good enough for the hackathon (one process). TODO(P1, Phase 3): also write chat_messages to
Supabase so history survives restarts.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

MAX_HISTORY = 12  # messages kept per session (user + assistant)
PENDING_TTL = 30 * 60  # seconds a confirm card stays valid


@dataclass
class PendingAction:
    action_id: str
    session_id: str
    user_id: str
    tool: str
    args: dict[str, Any]
    draft: dict[str, Any]
    auth_header: str | None
    created: float = field(default_factory=time.time)


_history: dict[str, list[dict]] = {}
_photos: dict[str, list[str]] = {}


def save_photo(session_id: str, url: str) -> str:
    """Inline photos (data: URLs) are huge, so the LLM only sees a short reference like photo://1."""
    if not url.startswith("data:"):
        return url
    photos = _photos.setdefault(session_id, [])
    photos.append(url)
    del photos[:-5]  # keep the last few per session
    return f"photo://{len(photos)}"


def resolve_photo(session_id: str, ref: str | None) -> str | None:
    if not ref or not ref.startswith("photo://"):
        return ref
    photos = _photos.get(session_id, [])
    try:
        return photos[int(ref.removeprefix("photo://")) - 1]
    except (ValueError, IndexError):
        return None


_pending: dict[str, PendingAction] = {}


def history(session_id: str) -> list[dict]:
    return list(_history.get(session_id, []))


def remember(session_id: str, *messages: dict) -> None:
    h = _history.setdefault(session_id, [])
    h.extend(messages)
    del h[:-MAX_HISTORY]


def add_pending(**kwargs: Any) -> PendingAction:
    _expire()
    action = PendingAction(action_id=f"act_{uuid.uuid4().hex[:12]}", **kwargs)
    _pending[action.action_id] = action
    return action


def pop_pending(action_id: str, session_id: str, user_id: str) -> PendingAction | None:
    _expire()
    action = _pending.get(action_id)
    if not action or action.session_id != session_id or action.user_id != user_id:
        return None
    return _pending.pop(action_id)


def _expire() -> None:
    now = time.time()
    for k in [k for k, a in _pending.items() if now - a.created > PENDING_TTL]:
        del _pending[k]
