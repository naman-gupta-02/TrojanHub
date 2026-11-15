"""Shared types for tool wrappers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

LA = ZoneInfo("America/Los_Angeles")


@dataclass
class ToolContext:
    session_id: str
    user_id: str
    auth_header: str | None
    sources: list[dict] = field(default_factory=list)  # USC sources gathered this turn, numbered 1..n
    known_text: list[str] = field(default_factory=list)  # every text Tommy saw (for the contact guard)


@dataclass
class ToolOutcome:
    result: dict[str, Any]  # what the LLM sees
    confirm: dict[str, Any] | None = None  # a `confirm` SSE event for write tools


def pacific(iso: str | None) -> str | None:
    """'2026-11-14T22:00:00Z' -> 'Sat Nov 14, 2:00 PM PT'."""
    if not iso:
        return None
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(LA)
    return dt.strftime("%a %b %-d, %-I:%M %p PT").replace(":00 ", " ")
