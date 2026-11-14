"""Load JSON mocks from packages/shared/mocks/ (used when USE_MOCKS=true)."""

import json
from typing import Any

from app.core.config import MOCKS_DIR


def load_mock(name: str) -> Any:
    """load_mock("chat_stream") reads packages/shared/mocks/chat_stream.json."""
    return json.loads((MOCKS_DIR / f"{name}.json").read_text())
