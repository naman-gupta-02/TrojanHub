"""Chat state: recent history per session, actions waiting for a "yes", and an answer cache.

Everything is in memory (one process is enough for the hackathon). Finished turns are also
written to Supabase `chat_messages` when it is configured, as a record; they are not read back.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

MAX_HISTORY = 12  # messages kept per session (user + assistant)
PENDING_TTL = 30 * 60  # seconds a confirm card stays valid
CACHE_TTL = 60 * 60  # seconds a cached answer stays fresh
CACHE_MAX = 200


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


# ---------------------------------------------------------------------------
# Answer cache: the same first question (no history, no photo) on the same day replays instantly.
# ---------------------------------------------------------------------------
_cache: dict[str, tuple[float, list[dict]]] = {}


def cache_key(message: str, today: str) -> str:
    return today + "|" + " ".join(message.lower().replace("?", " ").replace("!", " ").replace(".", " ").split())


def cache_get(key: str) -> list[dict] | None:
    hit = _cache.get(key)
    if not hit or time.time() - hit[0] > CACHE_TTL:
        _cache.pop(key, None)
        return None
    return hit[1]


def cache_put(key: str, events: list[dict]) -> None:
    if len(_cache) >= CACHE_MAX:
        _cache.pop(min(_cache, key=lambda k: _cache[k][0]))
    _cache[key] = (time.time(), events)


def cache_clear() -> None:
    _cache.clear()


# ---------------------------------------------------------------------------
# Supabase record of finished turns (best effort; never breaks the chat)
# ---------------------------------------------------------------------------
def persist_turn(session_id: str, user_id: str | None, user_text: str, answer: str, sources: list[dict]) -> None:
    from app.core.auth import DEMO_USER_ID
    from app.core.config import settings

    if not settings.supabase_url or not settings.supabase_service_role_key:
        return
    try:
        from app.core.supabase import get_supabase

        uid = None if user_id in (None, DEMO_USER_ID, "eval") else user_id  # FK to profiles
        slim = [{"n": s["n"], "title": s["title"], "url": s["url"]} for s in sources]
        get_supabase().table("chat_messages").insert([
            {"session_id": session_id, "user_id": uid, "role": "user", "content": user_text},
            {"session_id": session_id, "user_id": uid, "role": "assistant", "content": answer, "sources": slim or None},
        ]).execute()
    except Exception as e:  # noqa: BLE001
        print(f"[chat] couldn't save chat_messages: {e}")
