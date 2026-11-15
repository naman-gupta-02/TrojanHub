"""Tommy evals (ARCHITECTURE.md §7.1 "Evals").

Retrieval only (no LLM needed):
    python -m evals.run
    python -m evals.run --sweep          # try several thresholds to pick THRESHOLD
Full chat (needs LLM_MODEL etc. in .env):
    python -m evals.run --chat

Checks: expected URL is in the sources (hit@4), expected facts/contacts are in the retrieved
text (retrieval) or the answer (chat), and the answer has no email/phone that isn't in a source.
`expected_url: null` questions must come back as no-answer.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.rag import retrieve as R

QUESTIONS = Path(__file__).resolve().parent / "chat_questions.jsonl"
# Ways Tommy may decline a question USC pages can't answer (instead of guessing)
DECLINES = ("couldn't find", "could not find", "don't have", "do not have", "i can't", "i cannot", "can't help", "not able to", "outside what")


ONLY: set[str] | None = None  # set by --only id1,id2


def load() -> list[dict]:
    qs = [json.loads(l) for l in QUESTIONS.open() if l.strip()]
    return [q for q in qs if q["id"] in ONLY] if ONLY else qs


def run_retrieval(threshold: float, verbose: bool = True) -> dict:
    qs = load()
    hits = ranks = facts_ok = facts_total = 0
    no_ans_ok = no_ans_total = 0
    for q in qs:
        r = R.retrieve(q["question"], threshold=threshold)
        urls = [s.url for s in r.sources]
        text = " ".join(s.content for s in r.sources)
        if q["expected_url"] is None:
            no_ans_total += 1
            ok = r.no_answer
            no_ans_ok += ok
            mark = "PASS" if ok else f"FAIL (got {urls[:2]})"
        else:
            hit = q["expected_url"] in urls
            hits += hit
            ranks += 1 / (urls.index(q["expected_url"]) + 1) if hit else 0
            need = q.get("expected_facts", []) + q.get("expected_contacts", [])
            found = [f for f in need if f in text]
            facts_ok += len(found)
            facts_total += len(need)
            top = f"{r.sources[0].score:.2f}" if r.sources else "-"
            mark = ("PASS" if hit else "MISS") + f" top={top}" + (f" facts {len(found)}/{len(need)}" if need else "")
            if not hit and r.sources:
                mark += f" got {urls[0]}"
            if r.no_answer:
                mark += f" (no_answer, closest={r.closest.url if r.closest else None})"
        if verbose:
            print(f"{mark:<70} {q['id']}")
    n = len(qs) - no_ans_total
    result = {
        "threshold": threshold,
        "hit@4": hits / n if n else 0,
        "mrr": ranks / n if n else 0,
        "facts": f"{facts_ok}/{facts_total}",
        "no_answer": f"{no_ans_ok}/{no_ans_total}",
    }
    if verbose:
        print(f"\nhit@4 {result['hit@4']:.0%}  MRR {result['mrr']:.2f}  facts {result['facts']}  no-answer {result['no_answer']}")
    return result


def _norm(text: str) -> str:
    """Compare loosely: case, curly apostrophes and dash style don't matter."""
    return text.lower().replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")


async def run_chat() -> None:
    from app.chat.agent import run_turn
    from app.chat.guard import unverified_contacts

    qs = load()
    passed = 0
    for q in qs:
        answer, sources, seen = "", [], []
        async for ev in run_turn(f"eval-{q['id']}", q["question"], user_id="eval", auth_header=None):
            if ev["type"] == "token":
                answer += ev["text"]
            elif ev["type"] == "sources":
                sources = ev["sources"]
            elif ev["type"] == "tool_result":
                seen.append(json.dumps(ev["result"], ensure_ascii=False))  # everything Tommy was shown
        urls = [s["url"] for s in sources]
        need = q.get("expected_facts", []) + q.get("expected_contacts", [])
        problems = []
        missing = [f for f in need if _norm(f) not in _norm(answer)]
        # A different official page with the same fact is fine; the source only matters when
        # there is no expected fact to check, or the fact is missing.
        if q["expected_url"] and q["expected_url"] not in urls and (missing or not need):
            problems.append("expected source not cited")
        if q["expected_url"] and not urls and not q.get("action_ok"):
            problems.append("no sources shown")
        problems += [f"missing '{f}'" for f in missing]
        # A contact is "invented" only if it appears nowhere in what the tools returned.
        problems += [f"invented contact {b}" for b in unverified_contacts(answer, " ".join(seen))]
        if q["expected_url"] is None and not any(p in _norm(answer) for p in DECLINES):
            problems.append("should have said it couldn't find / can't help with it")
        passed += not problems
        print(f"{'PASS' if not problems else 'FAIL'}  {q['id']}: {'; '.join(problems)}\n      {answer[:160]!r}")
    print(f"\n{passed}/{len(qs)} passed")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--chat", action="store_true", help="run the full agent (needs an LLM)")
    ap.add_argument("--sweep", action="store_true", help="try several thresholds")
    ap.add_argument("--only", help="comma-separated question ids, e.g. pantry_hours,its_phone")
    args = ap.parse_args()
    if args.only:
        ONLY = set(args.only.split(","))
    if args.chat:
        asyncio.run(run_chat())
    elif args.sweep:
        for t in (0.25, 0.30, 0.35, 0.40, 0.45, 0.50):
            r = run_retrieval(t, verbose=False)
            print(r)
    else:
        run_retrieval(R.THRESHOLD)
