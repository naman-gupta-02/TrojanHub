"""Tommy's agent loop (ARCHITECTURE.md §7.1 "Agent loop").

LLM -> if it calls tools: run them, feed results back -> repeat (max 4 steps) -> stream the
final answer, then a `sources` event and `done`. Yields ChatEvent dicts (packages/shared/types.ts).
"""

from __future__ import annotations

import json
import logging
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
from app.core.llm import get_async_client, model_name

log = logging.getLogger("tommy")

MAX_STEPS = 4
TEMPERATURE = 0.2
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

    answer = ""
    try:
        for step in range(MAX_STEPS):
            last = step == MAX_STEPS - 1
            text, calls = "", []
            async for kind, value in _llm_step(messages, allow_tools=not last):
                if kind == "token":
                    yield {"type": "token", "text": value}
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
                yield {"type": "tool_call", "id": c["id"], "name": c["name"], "arguments": args}
                outcome = await run_tool(c["name"], c["arguments"], ctx)
                yield {"type": "tool_result", "id": c["id"], "name": c["name"], "result": outcome.result}
                if outcome.confirm:
                    yield outcome.confirm
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(outcome.result, ensure_ascii=False)})
    except Exception:  # noqa: BLE001 - never leave the UI hanging mid-stream
        log.exception("chat turn failed")
        if not answer:
            answer = SORRY
            yield {"type": "token", "text": SORRY}

    # Safety net: flag any email/phone that wasn't in a source or tool result.
    if unverified_contacts(answer, " ".join(ctx.known_text)):
        note = "\n\n(I couldn't verify a contact detail above, so please check the official page before using it.)"
        answer += note
        yield {"type": "token", "text": note}

    if ctx.sources:
        yield {"type": "sources", "sources": _cited(answer, ctx.sources)}
    store.remember(session_id, {"role": "user", "content": user_text}, {"role": "assistant", "content": answer})
    yield {"type": "done", "session_id": session_id}
