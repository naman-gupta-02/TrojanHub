"""Photo of a found item -> a short title + description the finder can check and edit.

The vision LLM looks at the photo; if it isn't set up (or fails), CLIP's label is used
instead ("Water bottle"), and if that isn't loaded either, the form just stays empty.
"""

from __future__ import annotations

import base64
import io
import logging

from app.core.config import settings
from app.core.llm import get_vision_client, model_name

log = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1024  # plenty for "black Hydro Flask with a sticker", and much faster to send

PROMPT = """You help students at USC post items they found on campus, so the owner can recognize them.
Look at the photo and return ONE JSON object, nothing else:
{
  "is_item": true if the photo shows a physical item someone could have lost,
  "title": a short name, 2-5 words, e.g. "Black Hydro Flask bottle",
  "description": 1-2 plain sentences: what it is, colour, brand or model if visible, and anything
                 that sets it apart (case, stickers, keychain, scratches, dents).
}

Rules:
- Describe only what you can see. Don't guess what's inside a closed bag, wallet or case.
- If something isn't visible (brand, model), leave it out. Don't say that it isn't visible.
- Never copy names, student ID numbers, card numbers, phone numbers, emails, addresses or
  anything on a screen. Say "a USCard" or "a phone with a cracked screen", not whose it is.
- Don't describe the people, background, or where the photo was taken.
- Plain words, no marketing, no emoji."""


def _llm_live() -> bool:
    has_model = bool(settings.llm_vision_model or settings.llm_model)
    has_endpoint = bool(settings.llm_api_key or settings.llm_base_url or settings.llm_vision_base_url)
    return has_model and has_endpoint


def _data_url(photo: bytes) -> str:
    """Shrink to MAX_SIDE and re-encode as JPEG (also drops EXIF, e.g. GPS)."""
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(photo))).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _text(v, limit: int) -> str | None:
    if not isinstance(v, str):
        return None
    v = " ".join(v.split()).strip()
    return v[:limit] if v else None


def _ask_llm(data_url: str) -> dict:
    from app.events.flyer import parse_json  # same "tolerate ```json fences" parser

    messages = [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]}]
    client, model = get_vision_client(), model_name(vision=True)
    try:
        res = client.chat.completions.create(model=model, messages=messages, temperature=0.2,
                                             response_format={"type": "json_object"})
    except Exception as e:
        # some OpenAI-compatible proxies don't support response_format; the prompt still asks for JSON
        if "response_format" not in str(e) and "json" not in str(e).lower():
            raise
        res = client.chat.completions.create(model=model, messages=messages, temperature=0.2)
    return parse_json(res.choices[0].message.content or "")


def _clip_title(photo: bytes) -> str | None:
    """CLIP's best label, only when Lost & Found runs for real (CLIP is loaded then)."""
    if settings.mock("lostfound"):
        return None
    try:
        from app.lostfound import tiers

        return tiers.classify_image(photo).title
    except Exception:  # noqa: BLE001 - a fallback must never break the form
        log.exception("CLIP label for describe failed")
        return None


def describe(photo: bytes) -> dict:
    """-> {"title": str | None, "description": str | None, "source": "ai" | "label" | "none"}"""
    if _llm_live():
        try:
            raw = _ask_llm(_data_url(photo))
            if raw.get("is_item") is not False:
                title, description = _text(raw.get("title"), 80), _text(raw.get("description"), 400)
                if description:
                    return {"title": title, "description": description, "source": "ai"}
        except Exception:  # noqa: BLE001 - fall back to the CLIP label below
            log.exception("Vision describe failed")
    title = _clip_title(photo)
    if title:
        return {"title": title, "description": title[0].upper() + title[1:] + ".", "source": "label"}
    return {"title": None, "description": None, "source": "none"}
