"""Valuable vs everyday (P2, ARCHITECTURE.md §7.2), using zero-shot CLIP.

We describe each kind of item in words ("a photo of AirPods"), turn the descriptions and the
photo into CLIP vectors, and pick the closest description. No training needed.

- valuable -> the finder is told to take it to a DPS / IT drop-off
- everyday -> listed for 14 days, handed off through in-app messages
- ask_tier -> the AI isn't sure (a close call, or a backpack that might hold a laptop), so the
              app asks the finder "Is this a valuable?" (CreateItemResponse.ask_tier)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.lostfound import clip


@dataclass(frozen=True)
class Label:
    name: str  # also the suggested title, e.g. "Water bottle"
    tier: str  # "valuable" | "everyday"
    prompts: tuple[str, ...]  # several phrasings, averaged, are more reliable than one


LABELS: tuple[Label, ...] = (
    # Valuables
    Label("AirPods", "valuable", ("a photo of AirPods", "a photo of a white AirPods charging case")),
    Label("Earbuds", "valuable", ("a photo of wireless earbuds", "a photo of an earbuds charging case")),
    Label("Phone", "valuable", ("a photo of a smartphone", "a photo of a cell phone")),
    Label("Laptop", "valuable", ("a photo of a laptop", "a photo of a MacBook")),
    Label("Tablet", "valuable", ("a photo of a tablet", "a photo of an iPad")),
    Label("Wallet", "valuable", ("a photo of a wallet", "a photo of a leather wallet")),
    Label("ID card", "valuable", ("a photo of a student ID card", "a photo of an identification card")),
    Label("Keys", "valuable", ("a photo of a set of keys", "a photo of keys on a keychain")),
    Label("Credit card", "valuable", ("a photo of a credit card", "a photo of a debit card")),
    Label("Watch", "valuable", ("a photo of a wristwatch", "a photo of a smartwatch")),
    Label("Glasses", "valuable", ("a photo of eyeglasses", "a photo of sunglasses")),
    # Everyday items
    Label("Water bottle", "everyday", ("a photo of a water bottle", "a photo of a Hydro Flask", "a photo of an insulated metal bottle")),
    Label("Umbrella", "everyday", ("a photo of an umbrella", "a photo of a folded umbrella")),
    Label("Jacket", "everyday", ("a photo of a jacket", "a photo of a coat")),
    Label("Hoodie", "everyday", ("a photo of a hoodie", "a photo of a sweatshirt")),
    Label("Charger", "everyday", ("a photo of a charger and cable", "a photo of a USB charging cable")),
    Label("Notebook", "everyday", ("a photo of a notebook", "a photo of a spiral notebook")),
    Label("Textbook", "everyday", ("a photo of a textbook", "a photo of a book")),
    Label("Hat", "everyday", ("a photo of a hat", "a photo of a baseball cap")),
    Label("Lunchbox", "everyday", ("a photo of a lunchbox", "a photo of a food container")),
    Label("Backpack", "everyday", ("a photo of a backpack",)),
)

# Might hold valuables, so we always ask the finder.
ALWAYS_ASK = {"Backpack"}

# CLIP's own temperature: turns similarities into probabilities that add up to 1.
SCALE = 100.0
# Ask the finder when the chosen tier gets less than this share of the probability.
ASK_BELOW = 0.70

_label_vectors: np.ndarray | None = None  # (len(LABELS), 512), built on first use


def _labels() -> np.ndarray:
    """One vector per label: the average of its prompts' vectors."""
    global _label_vectors
    if _label_vectors is None:
        prompts = [p for label in LABELS for p in label.prompts]
        vecs = clip.embed_texts(prompts)
        rows, i = [], 0
        for label in LABELS:
            rows.append(vecs[i : i + len(label.prompts)].mean(axis=0))
            i += len(label.prompts)
        m = np.stack(rows)
        _label_vectors = m / np.linalg.norm(m, axis=1, keepdims=True)
    return _label_vectors


@dataclass
class TierResult:
    tier: str  # "valuable" | "everyday"
    title: str  # best label, used as the suggested title
    confidence: float  # 0..1, share of probability on the chosen tier
    ask_tier: bool  # True -> the app asks the finder "Is this a valuable?"
    top: list[tuple[str, float]]  # top 3 labels with probabilities, for debugging and tuning


def classify_vector(vec: np.ndarray) -> TierResult:
    """Classify any CLIP vector (from a photo or from text)."""
    logits = SCALE * (_labels() @ vec)
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()

    best = int(probs.argmax())
    label = LABELS[best]
    tier_share = float(sum(p for p, lb in zip(probs, LABELS) if lb.tier == label.tier))
    order = probs.argsort()[::-1][:3]
    return TierResult(
        tier=label.tier,
        title=label.name,
        confidence=round(tier_share, 3),
        ask_tier=label.name in ALWAYS_ASK or tier_share < ASK_BELOW,
        top=[(LABELS[i].name, round(float(probs[i]), 3)) for i in order],
    )


def classify_image(photo: bytes) -> TierResult:
    return classify_vector(clip.embed_image(photo))


def classify_text(description: str) -> TierResult:
    """For posts without a photo (e.g. from chat): "blue umbrella" -> everyday."""
    return classify_vector(clip.embed_text(f"a photo of {description}"))
