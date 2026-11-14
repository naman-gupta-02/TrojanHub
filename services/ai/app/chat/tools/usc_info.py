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
        ctx.sources.append({"n": n, "title": s.title, "url": s.url, "snippet": s.content})
        ctx.known_text.append(s.content)
        out.append({"n": n, "title": s.title, "url": s.url, "section": s.section, "content": s.content, "contacts": s.contacts})
    return ToolOutcome({"sources": out})
