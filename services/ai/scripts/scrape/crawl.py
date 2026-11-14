"""Fetch the pages in seeds.yaml and save their main text (ARCHITECTURE.md §7.1, step 2).

Polite: 1 request/sec, obeys robots.txt, identifies itself. Public pages only.

Run from services/ai:
    python -m scripts.scrape.crawl                 # all seeds
    python -m scripts.scrape.crawl --limit 5       # quick test

Output: scripts/scrape/out/pages.jsonl, one JSON object per page:
    {url, final_url, title, topic, headings, text, scraped_at}
Next steps (Phase 1): extract_contacts.py -> chunk.py -> embed.py
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura
import yaml

HERE = Path(__file__).resolve().parent
SEEDS = HERE / "seeds.yaml"
OUT_DIR = HERE / "out"
USER_AGENT = "TrojanHubBot/0.1 (AI@USC Hackathon student project; public pages only)"
DELAY_SECONDS = 1.0

_robots: dict[str, RobotFileParser | None] = {}


def allowed(client: httpx.Client, url: str) -> bool:
    """Check robots.txt once per host. If robots.txt can't be read, allow (standard behavior)."""
    parts = urlparse(url)
    host = f"{parts.scheme}://{parts.netloc}"
    if host not in _robots:
        rp: RobotFileParser | None = RobotFileParser()
        try:
            r = client.get(f"{host}/robots.txt")
            if r.status_code == 200:
                rp.parse(r.text.splitlines())
            else:
                rp = None
        except httpx.HTTPError:
            rp = None
        _robots[host] = rp
    rp = _robots[host]
    return rp is None or rp.can_fetch(USER_AGENT, url)


def extract(html: str, url: str) -> dict | None:
    """Main text (markdown keeps headings, which chunk.py splits on) + title + headings."""
    text = trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        include_links=True,  # keep links so contact/form URLs survive
        include_tables=True,
        favor_recall=True,
    )
    if not text:
        return None
    meta = trafilatura.extract_metadata(html, default_url=url)
    title = (meta.title if meta and meta.title else "") or url
    headings = [line.lstrip("#").strip() for line in text.splitlines() if line.startswith("#")]
    return {"title": title, "headings": headings, "text": text}


def crawl(limit: int | None = None) -> None:
    seeds = yaml.safe_load(SEEDS.read_text())["pages"]
    if limit:
        seeds = seeds[:limit]
    OUT_DIR.mkdir(exist_ok=True)
    out_path = OUT_DIR / "pages.jsonl"
    ok = failed = 0

    with httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=20
    ) as client, out_path.open("w") as out:
        for i, seed in enumerate(seeds, 1):
            url = seed["url"]
            try:
                if not allowed(client, url):
                    print(f"[{i}/{len(seeds)}] SKIP robots.txt  {url}")
                    failed += 1
                    continue
                r = client.get(url)
                r.raise_for_status()
                page = extract(r.text, str(r.url))
                if not page:
                    print(f"[{i}/{len(seeds)}] EMPTY            {url}")
                    failed += 1
                    continue
                record = {
                    "url": url,
                    "final_url": str(r.url),
                    "topic": seed.get("topic"),
                    **page,
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                }
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                ok += 1
                print(f"[{i}/{len(seeds)}] OK {len(page['text']):>6} chars  {url}")
            except httpx.HTTPError as e:
                print(f"[{i}/{len(seeds)}] FAIL {type(e).__name__}  {url}")
                failed += 1
            time.sleep(DELAY_SECONDS)

    print(f"\nDone: {ok} saved, {failed} skipped/failed -> {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--limit", type=int, help="only crawl the first N seeds")
    sys.exit(crawl(ap.parse_args().limit))
