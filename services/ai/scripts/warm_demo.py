"""Warm Tommy's answer cache before a demo, so the demo questions answer in under a second.

The cache lives in the running API's memory (1 hour, same day), so run this AFTER starting the
API and the LLM, and again if you restart them. Only questions without a confirm card are
cached (complaints and found items always make a fresh card).

Run from services/ai:
    python -m scripts.warm_demo                         # the suggested prompts
    python -m scripts.warm_demo "where is the pantry?"  # your own list
    python -m scripts.warm_demo --api http://<laptop-ip>:8000

Type the questions on stage exactly as they are here (case and ?/! don't matter).
"""

from __future__ import annotations

import argparse
import json
import time
import uuid

import httpx

DEMO_QUESTIONS = [
    "When is the food pantry open?",
    "Any free food today?",
    "Did anyone find a black Hydro Flask?",
    "What's the DPS emergency number?",
    "Who do I call about a lost wallet?",
]


def ask(api: str, question: str) -> tuple[float, str, bool]:
    t = time.time()
    answer, card = "", False
    with httpx.stream("POST", f"{api}/api/chat", timeout=180,
                      json={"session_id": f"warm-{uuid.uuid4().hex[:8]}", "message": question}) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line.startswith("data: "):
                ev = json.loads(line[6:])
                if ev["type"] == "token":
                    answer += ev["text"]
                elif ev["type"] == "confirm":
                    card = True
    return time.time() - t, answer, card


def main() -> None:
    ap = argparse.ArgumentParser(description="Warm Tommy's answer cache before a demo.")
    ap.add_argument("questions", nargs="*", help="questions to warm (default: the demo prompts)")
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()

    health = httpx.get(f"{args.api}/health", timeout=10).json()
    print(f"API {args.api}: {health}\n")
    for q in args.questions or DEMO_QUESTIONS:
        first, answer, card = ask(args.api, q)
        if card:
            print(f"skip  {q}\n      (makes a confirm card, so it is never cached)\n")
            continue
        second, _, _ = ask(args.api, q)
        status = "ok  " if second < 2 else "SLOW"  # second run should come from the cache
        print(f"{status}  {q}\n      {first:.1f}s first, {second:.1f}s cached | {answer[:110].replace(chr(10), ' ')}\n")
    print("Done. Restarting the API clears the cache; run this again after a restart.")


if __name__ == "__main__":
    main()
