"""CLIP for Lost & Found (P2): turns photos and text into vectors we can compare.

One model, OpenCLIP ViT-B-32 (laion2b_s34b_b79k), loaded once on first use and shared by
tiers.py and search. Every vector has 512 numbers and length 1, so the similarity of two
vectors is their dot product (cosine similarity). Matches `items.img_embedding` and
`items.text_embedding vector(512)` in the schema.

The first load downloads the weights (~600 MB) into the Hugging Face cache; later loads take a
few seconds.
"""

from __future__ import annotations

import io
import logging
import threading

import numpy as np

log = logging.getLogger(__name__)

MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
DIM = 512

_lock = threading.Lock()
_bundle = None  # (model, preprocess, tokenizer), set once by _load()


def _load():
    global _bundle
    if _bundle is not None:
        return _bundle
    with _lock:
        if _bundle is None:
            import open_clip  # heavy, so imported lazily: mock mode starts without it

            model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED, device="cpu")
            model.eval()
            _bundle = (model, preprocess, open_clip.get_tokenizer(MODEL_NAME))
            log.info("Loaded CLIP %s (%s)", MODEL_NAME, PRETRAINED)
    return _bundle


def warm_up() -> None:
    """Load the model now instead of on the first request."""
    _load()


def _normalize(x: np.ndarray) -> np.ndarray:
    return x / np.clip(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12, None)


def open_image(data: bytes):
    """Bytes -> RGB PIL image, upright. Raises ValueError if the bytes aren't an image we can read."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # phone photos are often stored sideways
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("That file isn't a photo we can read. Try a JPG or PNG.") from e


def embed_pil(img) -> np.ndarray:
    """RGB PIL image -> unit vector (512,)."""
    import torch

    model, preprocess, _ = _load()
    with torch.inference_mode():
        feats = model.encode_image(preprocess(img).unsqueeze(0))
    return _normalize(feats.float().numpy())[0]


def embed_image(data: bytes) -> np.ndarray:
    """Photo bytes -> unit vector (512,). Raises ValueError for files that aren't images."""
    return embed_pil(open_image(data))


def embed_texts(texts: list[str]) -> np.ndarray:
    """Texts -> unit vectors (len(texts), 512)."""
    import torch

    model, _, tokenizer = _load()
    with torch.inference_mode():
        feats = model.encode_text(tokenizer(texts))
    return _normalize(feats.float().numpy())


def embed_text(text: str) -> np.ndarray:
    """Text -> unit vector (512,)."""
    return embed_texts([text])[0]
