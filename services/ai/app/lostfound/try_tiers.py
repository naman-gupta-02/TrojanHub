"""Try the tier sorter on real photos or text, and see speed and memory (P2 dev tool).

Run from services/ai:
    python -m app.lostfound.try_tiers photo1.jpg photo2.png
    python -m app.lostfound.try_tiers --text "black hydro flask" "white airpods case"
"""

import argparse
import resource
import sys
import time
from pathlib import Path

from app.lostfound import clip, tiers


def peak_memory_mb() -> float:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return rss / 1024 / 1024 if sys.platform == "darwin" else rss / 1024  # bytes on macOS, KB on Linux


def show(name: str, r: tiers.TierResult, ms: float) -> None:
    ask = "  <- ask finder" if r.ask_tier else ""
    top = ", ".join(f"{n} {p:.2f}" for n, p in r.top)
    print(f"{name[:38]:<38} {r.tier:<9} {r.title:<13} conf {r.confidence:.2f}  {ms:5.0f} ms  [{top}]{ask}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="photo paths, or text with --text")
    ap.add_argument("--text", action="store_true", help="treat inputs as descriptions, not photo paths")
    args = ap.parse_args()

    t0 = time.perf_counter()
    clip.warm_up()
    tiers._labels()
    print(f"Model + labels loaded in {time.perf_counter() - t0:.1f}s, memory {peak_memory_mb():.0f} MB\n")

    for inp in args.inputs:
        t = time.perf_counter()
        try:
            r = tiers.classify_text(inp) if args.text else tiers.classify_image(Path(inp).read_bytes())
        except (ValueError, OSError) as e:
            print(f"{inp[:38]:<38} ERROR {e}")
            continue
        show(inp if args.text else Path(inp).name, r, (time.perf_counter() - t) * 1000)

    print(f"\nPeak memory: {peak_memory_mb():.0f} MB")


if __name__ == "__main__":
    main()
