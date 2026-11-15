"""LLM smoke test for the Hermes proxy or backup key (ARCHITECTURE.md §13.2, step 5).

Runs 3 checks against LLM_BASE_URL / LLM_MODEL: plain chat, tool calling, image input.
Run from services/ai:
    python -m scripts.smoke_llm
    python -m scripts.smoke_llm --image ~/Desktop/flyer.jpg
"""

import argparse
import base64
import json
import sys
from pathlib import Path

from app.chat.tools import TOOLS
from app.core.config import settings
from app.core.llm import get_client, get_vision_client, model_name

# Default test image: the app icon from this repo, sent inline (no network needed).
# For the real test, pass a photo of an actual flyer:  --image path/to/flyer.jpg  (or a URL)
ICON = Path(__file__).resolve().parents[3] / "apps" / "mobile" / "assets" / "images" / "icon.png"


def as_image_url(src: str) -> str:
    """A URL stays a URL; a local file becomes a data: URL."""
    if src.startswith(("http://", "https://", "data:")):
        return src
    path = Path(src)
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def check(name, fn) -> bool:
    try:
        detail = fn()
        print(f"PASS  {name}: {detail}")
        return True
    except Exception as e:  # noqa: BLE001 - we want every failure reported
        print(f"FAIL  {name}: {type(e).__name__}: {e}")
        return False


def plain():
    r = get_client().chat.completions.create(
        model=model_name(), messages=[{"role": "user", "content": "Reply with exactly: Fight On!"}]
    )
    return r.choices[0].message.content


def tools():
    r = get_client().chat.completions.create(
        model=model_name(),
        messages=[{"role": "user", "content": "it's so hot in GFS 213"}],
        tools=TOOLS,
    )
    calls = r.choices[0].message.tool_calls
    if not calls:
        raise RuntimeError(f"no tool call; got text: {r.choices[0].message.content!r}")
    return ", ".join(f"{c.function.name}({json.loads(c.function.arguments)})" for c in calls)


def image(url: str):
    def run():
        r = get_vision_client().chat.completions.create(
            model=model_name(vision=True),
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image in one short sentence."},
                    {"type": "image_url", "image_url": {"url": url}},
                ],
            }],
        )
        return r.choices[0].message.content
    return run


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default=str(ICON), help="image file or URL")
    args = ap.parse_args()

    if not settings.llm_model:
        sys.exit("LLM_MODEL is not set. Fill in services/ai/.env first (see .env.example).")
    print(f"base_url={settings.llm_base_url or '(default)'}  model={settings.llm_model}\n")
    results = [check("plain chat", plain), check("tool calling", tools), check("image", image(as_image_url(args.image)))]
    print(f"\n{sum(results)}/3 passed")
    sys.exit(0 if all(results) else 1)
