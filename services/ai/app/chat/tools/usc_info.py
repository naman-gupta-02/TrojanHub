"""search_usc_info -> rag.retrieve (P1's own tool)."""

from __future__ import annotations

import asyncio

from app.chat.tools.base import ToolContext, ToolOutcome
from app.rag.retrieve import retrieve


async def search_usc_info(args: dict, ctx: ToolContext) -> ToolOutcome:
    r = await asyncio.to_thread(retrieve, args["query"])  # embedding is CPU work
    if r.no_answer:
        closest = {"title": r.closest.title, "url": r.closest.url} if r.closest else None
        return ToolOutcome({"no_answer": True, "closest": closest})

    out = []
    for s in r.sources:
        n = len(ctx.sources) + 1  # numbering continues across several searches in one turn
        # Chip label: page title, plus the section when there is one (two chunks of one page differ)
        section = (s.section or "").split(" > ")[-1]
        label = f"{s.title.split(' - ')[0]} · {section}" if section and section.lower() not in s.title.lower() else s.title
        ctx.sources.append({"n": n, "title": label, "url": s.url, "snippet": s.content})
        ctx.known_text.append(s.content)
        out.append({"n": n, "title": s.title, "url": s.url, "section": s.section, "content": s.content, "contacts": s.contacts})
    return ToolOutcome({"sources": out})
