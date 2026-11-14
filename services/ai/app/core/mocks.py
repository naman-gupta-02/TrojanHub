"""Mock helpers: endpoints serve packages/shared/mocks/*.json while USE_MOCKS=true."""

import json
from typing import Any

from fastapi import HTTPException

from app.core.config import MOCKS_DIR


def load_mock(name: str) -> Any:
    """load_mock("items_search") reads packages/shared/mocks/items_search.json (fresh copy each call)."""
    return json.loads((MOCKS_DIR / f"{name}.json").read_text())


def not_built(owner: str) -> HTTPException:
    """Raise this from an endpoint whose real version isn't written yet."""
    return HTTPException(
        status_code=501,
        detail={"code": "not_implemented", "message": f"Real endpoint not built yet ({owner}). Set USE_MOCKS=true."},
    )
