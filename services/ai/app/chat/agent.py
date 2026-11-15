"""Tommy's agent loop (ARCHITECTURE.md §7.1 "Agent loop").

LLM -> if it calls tools: run them, feed results back -> repeat (max 4 steps) -> stream the
final answer, then a `sources` event and `done`. Yields ChatEvent dicts (packages/shared/types.ts).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from app.chat import store
from app.chat.guard import unverified_contacts
from app.chat.prompts import system_prompt
from app.chat.tools import TOOLS
from app.chat.tools.base import LA, ToolContext
from app.chat.tools.runner import run_tool
from app.chat.tools.usc_info import search_usc_info
from app.core.llm import get_async_client, model_name

log = logging.getLogger("tommy")

MAX_STEPS = 4
TEMPERATURE = 0.2
CACHE_ON = os.getenv("CHAT_CACHE", "1") != "0"

# Speed: for plain campus questions we search USC pages BEFORE the first LLM call and hand the
# result over as if the model had asked for it, so it can answer in one call instead of two.
_QUESTION = re.compile(r"\?|^\s*(when|where|what|who|how|which|is|are|can|does|do|whats|what's|where's|when's)\b", re.I)
_ACTION = re.compile(r"\b(free|freebie|freebies|event|events|deal|deals|lost|found|find|flyer|tonight|happening|report|broken|complain\w*)\b", re.I)


def should_prefetch(message: str, has_photo: bool) -> bool:
    return not has_photo and bool(_QUESTION.search(message)) and not _ACTION.search(message)
SORRY = "Sorry, I'm having trouble thinking right now. Please try again in a moment."


def _today() -> str:
    return datetime.now(LA).strftime("%A, %B %-d, %Y")


async def _llm_step(messages: list[dict], allow_tools: bool) -> AsyncIterator[tuple[str, Any]]:
    """Yields ("token", text) while streaming, then ("end", (full_text, tool_calls))."""
    client = get_async_client()
    kwargs: dict[str, Any] = {"model": model_name(), "messages": messages, "temperature": TEMPERATURE}
    if allow_tools:
        kwargs["tools"] = TOOLS
    text = ""
    calls: dict[int, dict] = {}
    try:
        stream = await client.chat.completions.create(stream=True, **kwargs)
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if getattr(delta, "content", None):
                text += delta.content
                yield "token", delta.content
            for tc in getattr(delta, "tool_calls", None) or []:
                c = calls.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                c["id"] = tc.id or c["id"]
                if tc.function:
                    c["name"] += tc.function.name or ""
                    c["arguments"] += tc.function.arguments or ""
    except Exception as e:  # noqa: BLE001 - some proxies can't stream tool calls; retry without streaming
        if text:
            raise
        log.warning("streaming failed (%s), retrying without stream", e)
        resp = await client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        text = msg.content or ""
        if text:
            yield "token", text
        for i, tc in enumerate(msg.tool_calls or []):
            calls[i] = {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments}
    yield "end", (text, [calls[i] for i in sorted(calls)])


def _cited(answer: str, sources: list[dict]) -> list[dict]:
    nums = {int(n) for n in re.findall(r"\[(\d+)\]", answer)}
    cited = [s for s in sources if s["n"] in nums]
    return cited or sources[:2]  # nothing cited -> still show the top sources as chips


async def run_turn(
    session_id: str, message: str, user_id: str, auth_header: str | None, image_url: str | None = None
) -> AsyncIterator[dict]:
    ctx = ToolContext(session_id=session_id, user_id=user_id, auth_header=auth_header)
    photo_ref = store.save_photo(session_id, image_url) if image_url else None
    user_text = message + (f"\n[photo: {photo_ref}]" if photo_ref else "")
    messages: list[dict] = [
        {"role": "system", "content": system_prompt(_today())},
        *store.history(session_id),
        {"role": "user", "content": user_text},
    ]

    # Same first question today -> replay the cached answer.
    key = store.cache_key(message, _today()) if CACHE_ON and not image_url and len(messages) == 2 else None
    if key and (cached := store.cache_get(key)):
        answer = ""
        for ev in cached:
            if ev["type"] == "token":
                answer += ev["text"]
                await asyncio.sleep(0.01)  # keep the typing effect
            yield ev
        store.remember(session_id, {"role": "user", "content": user_text}, {"role": "assistant", "content": answer})
        yield {"type": "done", "session_id": session_id}
        return

    recorded: list[dict] = []  # events of this turn, for the cache
    cacheable = key is not None

    def out(ev: dict) -> dict:
        recorded.append(ev)
        return ev

    # Pre-fetch USC sources for plain questions (see should_prefetch).
    if should_prefetch(message, bool(image_url)):
        try:
            pre = await search_usc_info({"query": message}, ctx)
        except Exception:  # noqa: BLE001 - no index yet, etc.: the model can still search itself
            log.exception("prefetch failed")
            pre = None
        if pre and pre.result.get("sources"):
            call = {"id": "prefetch_1", "name": "search_usc_info", "arguments": json.dumps({"query": message})}
            yield out({"type": "tool_call", "id": call["id"], "name": call["name"], "arguments": {"query": message}})
            yield out({"type": "tool_result", "id": call["id"], "name": call["name"], "result": pre.result})
            messages.append({"role": "assistant", "content": None, "tool_calls": [
                {"id": call["id"], "type": "function", "function": {"name": call["name"], "arguments": call["arguments"]}}]})
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(pre.result, ensure_ascii=False)})

    answer = ""
    try:
        for step in range(MAX_STEPS):
            last = step == MAX_STEPS - 1
            text, calls = "", []
            async for kind, value in _llm_step(messages, allow_tools=not last):
                if kind == "token":
                    yield out({"type": "token", "text": value})
                else:
                    text, calls = value
            answer += text
            if not calls:
                break

            messages.append({
                "role": "assistant",
                "content": text or None,
                "tool_calls": [{"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["arguments"]}} for c in calls],
            })
            for c in calls:
                try:
                    args = json.loads(c["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {"_raw": c["arguments"]}
                yield out({"type": "tool_call", "id": c["id"], "name": c["name"], "arguments": args})
                outcome = await run_tool(c["name"], c["arguments"], ctx)
                yield out({"type": "tool_result", "id": c["id"], "name": c["name"], "result": outcome.result})
                if outcome.confirm:
                    cacheable = False  # confirm cards are tied to this session
                    yield outcome.confirm
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(outcome.result, ensure_ascii=False)})
    except Exception:  # noqa: BLE001 - never leave the UI hanging mid-stream
        log.exception("chat turn failed")
        cacheable = False
        if not answer:
            answer = SORRY
            yield {"type": "token", "text": SORRY}

    # Safety net: flag any email/phone that wasn't in a source or tool result.
    if unverified_contacts(answer, " ".join(ctx.known_text)):
        note = "\n\n(I couldn't verify a contact detail above, so please check the official page before using it.)"
        answer += note
        yield out({"type": "token", "text": note})

    cited = _cited(answer, ctx.sources) if ctx.sources else []
    if cited:
        yield out({"type": "sources", "sources": cited})
    if cacheable and key and answer.strip():
        store.cache_put(key, recorded)
    store.remember(session_id, {"role": "user", "content": user_text}, {"role": "assistant", "content": answer})
    _background(asyncio.to_thread(store.persist_turn, session_id, user_id, user_text, answer, cited))
    yield {"type": "done", "session_id": session_id}


_tasks: set[asyncio.Task] = set()


def _background(coro) -> None:
    """Run without making the student wait (keeps a reference so it isn't garbage-collected)."""
    task = asyncio.ensure_future(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
