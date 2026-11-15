"""Split crawled pages into chunks (ARCHITECTURE.md §7.1, step 4).

~180-220 tokens per chunk with ~40 tokens overlap, cut at heading boundaries. That is smaller than
the 500 in ARCHITECTURE.md on purpose: the embedding model (all-MiniLM-L6-v2) only reads the
first 256 tokens, so anything after that in a bigger chunk would be invisible to search.
Each chunk starts with the page title and section so it makes sense on its own. Contacts are
extracted per chunk.

Run from services/ai (after crawl.py):
    python -m scripts.scrape.chunk
Output: scripts/scrape/out/chunks.jsonl
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from scripts.scrape.extract_contacts import extract_contacts

OUT_DIR = Path(__file__).resolve().parent / "out"
TARGET_WORDS = 180  # budget per chunk, in approximate tokens (see _n); header adds ~15 more
OVERLAP_WORDS = 40
MIN_WORDS = 30  # tiny trailing pieces get merged into the previous chunk

HEADING = re.compile(r"^(#{1,4})\s+(.*)$")


def _clean_heading(h: str) -> str:
    return re.sub(r"[*_`\\]", "", h).strip()


def sections(text: str) -> list[tuple[str, str]]:
    """[(heading path, body)] split at markdown headings."""
    out: list[tuple[str, str]] = []
    path: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        if body:
            out.append((" > ".join(p for p in path if p), body))
        buf.clear()

    for line in text.splitlines():
        m = HEADING.match(line)
        if m:
            flush()
            level, title = len(m.group(1)), _clean_heading(m.group(2))
            path[:] = path[: level - 1] + [""] * max(0, level - 1 - len(path)) + [title]
        else:
            buf.append(line)
    flush()
    return out


_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_TOKEN = re.compile(r"\w+|[^\w\s]")


def _n(text: str) -> int:
    """Approximate token count: words + punctuation marks, ignoring link URLs (they aren't embedded)."""
    return len(_TOKEN.findall(_LINK.sub(r"\1", text)))


def _paragraphs(body: str) -> list[str]:
    """Blank-line separated blocks; blocks over the budget are split at word boundaries."""
    out: list[str] = []
    for para in re.split(r"\n\s*\n", body):
        para = para.strip()
        if not para:
            continue
        if _n(para) <= TARGET_WORDS:
            out.append(para)
            continue
        piece: list[str] = []
        for word in para.split(" "):
            piece.append(word)
            if _n(" ".join(piece)) >= TARGET_WORDS:
                out.append(" ".join(piece))
                piece = []
        if piece:
            out.append(" ".join(piece))
    return out


def chunk_page(page: dict) -> list[dict]:
    """Pack paragraphs (keeping their line breaks) into ~TARGET_WORDS chunks.

    A new chunk starts at a heading once the current one is substantial; consecutive chunks
    share ~OVERLAP_WORDS of trailing paragraphs so facts on a boundary aren't lost.
    A chunk is labelled with the section of its first new (non-overlap) paragraph.
    """
    title = page["title"]
    raw: list[tuple[str, list[str]]] = []  # (section, paragraphs)
    cur: list[tuple[str, str]] = []  # (section, paragraph)
    n_overlap = 0  # how many items at the start of `cur` are carried over from the last chunk

    def size() -> int:
        return sum(_n(p) for _, p in cur)

    def flush() -> None:
        nonlocal cur, n_overlap
        if len(cur) > n_overlap:
            fresh = cur[n_overlap:]
            raw.append((fresh[0][0], [p for _, p in cur]))
        tail: list[tuple[str, str]] = []
        for item in reversed(cur):
            if sum(_n(p) for _, p in tail) + _n(item[1]) > OVERLAP_WORDS:
                break
            tail.insert(0, item)
        cur, n_overlap = tail, len(tail)

    for sec, body in sections(page["text"]) or [("", page["text"])]:
        heading = f"## {sec.split(' > ')[-1]}" if sec else ""
        paras = ([heading] if heading else []) + _paragraphs(body)
        if size() >= TARGET_WORDS // 2 and size() + sum(map(_n, paras)) > TARGET_WORDS:
            flush()
        for para in paras:
            if cur and size() + _n(para) > TARGET_WORDS:
                flush()
            cur.append((sec, para))

    fresh = cur[n_overlap:]
    if fresh:
        if raw and sum(_n(p) for _, p in fresh) < MIN_WORDS:
            raw[-1][1].extend(p for _, p in fresh)
        else:
            raw.append((fresh[0][0], [p for _, p in cur]))

    result = []
    for i, (sec, paras) in enumerate(raw):
        body = "\n\n".join(paras)
        header = f"{title}\n{sec}\n\n" if sec else f"{title}\n\n"
        result.append({
            "url": page["url"],
            "title": title,
            "section": sec or None,
            "content": header + body,
            "contacts": extract_contacts(body),
            "chunk_index": i,
            "scraped_at": page["scraped_at"],
        })
    return result


def main() -> None:
    pages = [json.loads(l) for l in (OUT_DIR / "pages.jsonl").open()]
    n = 0
    with (OUT_DIR / "chunks.jsonl").open("w") as out:
        for page in pages:
            for c in chunk_page(page):
                out.write(json.dumps(c, ensure_ascii=False) + "\n")
                n += 1
    print(f"{len(pages)} pages -> {n} chunks -> {OUT_DIR / 'chunks.jsonl'}")


if __name__ == "__main__":
    main()
