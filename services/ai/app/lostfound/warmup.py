"""Load Lost & Found's AI models in the background when the service starts (P2).

Without this the first post or search after a restart waits ~10-20 s for CLIP and the sentence
model to load. Only runs when Lost & Found is real (USE_MOCKS=false), so mock mode stays light.
"""

from __future__ import annotations

import logging
import threading

from app.core.config import settings

log = logging.getLogger(__name__)


def _load() -> None:
    try:
        from app.lostfound import clip, semantic, tiers

        clip.warm_up()
        tiers._labels()
        semantic.warm_up()
        log.info("Lost & Found models ready")
    except Exception as e:  # noqa: BLE001 - a failed warm-up just means a slower first request
        log.warning("Lost & Found warm-up failed: %s", e)


def start() -> None:
    if not settings.use_mocks:
        threading.Thread(target=_load, name="lostfound-warmup", daemon=True).start()
