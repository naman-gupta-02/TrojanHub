"""Local OpenAI-compatible shim on top of the official Codex CLI (replaces the Hermes proxy idea
in ARCHITECTURE.md §13.2).

It exposes POST /v1/chat/completions and answers each request by running `codex exec` with the
ChatGPT login already stored by `codex login`. Nothing else in the app changes: point
LLM_BASE_URL at it.

    codex login                                   # once: Sign in with ChatGPT
    cd services/ai && python -m scripts.codex_shim # serves http://127.0.0.1:8787/v1
    # services/ai/.env:
    #   LLM_BASE_URL=http://127.0.0.1:8787/v1
    #   LLM_API_KEY=codex-shim
    #   LLM_MODEL=gpt-5.6-luna

Rules (ARCHITECTURE.md §13.2): it binds to 127.0.0.1 only. Never expose it (no tunnels): it runs
on one person's account. Each call takes ~8-10 s and has no real streaming, so keep a backup API
key for the demo.

It only uses the Codex CLI: it never reads the login token or calls ChatGPT's private endpoints.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

DEFAULT_MODEL = os.getenv("CODEX_MODEL", "gpt-5.6-luna")
CODEX_BIN = os.getenv("CODEX_BIN", "codex")
TIMEOUT = float(os.getenv("CODEX_TIMEOUT", "120"))
MAX_PARALLEL = int(os.getenv("CODEX_MAX_PARALLEL", "2"))
PORT = int(os.getenv("CODEX_SHIM_PORT", "8787"))

app = FastAPI(title="TrojanHub Codex shim")
_slots = asyncio.Semaphore(MAX_PARALLEL)

PREAMBLE = """\
You are being used as a plain chat-completion model behind an API. Follow these rules exactly:
- Do NOT run shell commands, read or write files, browse, or use any of your own tools.
- Everything you need is in this prompt. Your whole output is the final JSON object.
- Follow the SYSTEM instructions below as your instructions for this conversation.
"""


def _text(content: Any) -> str:
    """OpenAI message content (string or parts) -> plain text."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    return "\n".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")


def _image_urls(messages: list[dict]) -> list[str]:
    urls = []
    for m in messages:
        if isinstance(m.get("content"), list):
            for p in m["content"]:
                if isinstance(p, dict) and p.get("type") == "image_url":
                    urls.append(p["image_url"]["url"] if isinstance(p["image_url"], dict) else p["image_url"])
    return urls


def build_prompt(messages: list[dict], tools: list[dict] | None, json_mode: bool) -> str:
    system = "\n\n".join(_text(m.get("content")) for m in messages if m["role"] in ("system", "developer"))
    lines: list[str] = []
    for m in messages:
        role = m["role"]
        if role in ("system", "developer"):
            continue
        if role == "user":
            lines.append(f"USER:\n{_text(m.get('content'))}")
        elif role == "assistant":
            if _text(m.get("content")):
                lines.append(f"ASSISTANT:\n{_text(m.get('content'))}")
            for tc in m.get("tool_calls") or []:
                f = tc["function"]
                lines.append(f"ASSISTANT CALLED FUNCTION {f['name']} (id {tc.get('id')}) WITH ARGUMENTS:\n{f['arguments']}")
        elif role == "tool":
            lines.append(f"FUNCTION RESULT (id {m.get('tool_call_id')}):\n{_text(m.get('content'))}")

    parts = [PREAMBLE, f"=== SYSTEM ===\n{system or '(none)'}"]
    if tools:
        specs = [
            {"name": t["function"]["name"], "description": t["function"].get("description", ""), "parameters": t["function"].get("parameters", {})}
            for t in tools
        ]
        parts.append(
            "=== FUNCTIONS YOU CAN CALL ===\n"
            + json.dumps(specs, indent=1)
            + "\n\nTo call functions: put them in `tool_calls` (each with `name` and `arguments_json`, a JSON-encoded "
            "string of the arguments object) and leave `content` empty.\n"
            "To answer the user: leave `tool_calls` as an empty list and write the answer in `content`.\n"
            "If a FUNCTION RESULT for what you need is already in the conversation, answer from it instead of calling again."
        )
    parts.append("=== CONVERSATION ===\n" + "\n\n".join(lines))
    tail = "Now write the next ASSISTANT turn as the JSON object."
    if json_mode:
        tail += " `content` must itself be a valid JSON document (as a string), with no extra text."
    parts.append(tail)
    return "\n\n".join(parts)


def build_schema(tools: list[dict] | None) -> dict:
    if not tools:
        return {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"], "additionalProperties": False}
    names = [t["function"]["name"] for t in tools]
    return {
        "type": "object",
        "properties": {
            "tool_calls": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"name": {"type": "string", "enum": names}, "arguments_json": {"type": "string"}},
                    "required": ["name", "arguments_json"],
                    "additionalProperties": False,
                },
            },
            "content": {"type": "string"},
        },
        "required": ["tool_calls", "content"],
        "additionalProperties": False,
    }


async def _save_images(urls: list[str], workdir: Path) -> list[Path]:
    paths = []
    for i, url in enumerate(urls):
        if url.startswith("data:"):
            header, _, data = url.partition(",")
            ext = "png" if "png" in header else "jpg"
            blob = base64.b64decode(data)
        else:
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    r = await client.get(url)
                    r.raise_for_status()
            except httpx.HTTPError as e:
                raise HTTPException(400, detail={"message": f"Couldn't download image {url[:80]}: {e}", "type": "invalid_request_error"}) from e
            blob = r.content
            ext = "png" if "png" in r.headers.get("content-type", "") else "jpg"
        path = workdir / f"image_{i}.{ext}"
        path.write_bytes(blob)
        paths.append(path)
    return paths


async def run_codex(prompt: str, schema: dict, model: str, images: list[str]) -> tuple[dict, int]:
    """Runs `codex exec` once in an empty temp folder. Returns (parsed JSON, tokens used)."""
    workdir = Path(tempfile.mkdtemp(prefix="codex-shim-"))
    try:
        (workdir / "schema.json").write_text(json.dumps(schema))
        cmd = [
            CODEX_BIN, "exec", "-m", model,
            "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules",
            "-s", "read-only", "--color", "never",
            "--output-schema", "schema.json", "-o", "out.json",
        ]
        for img in await _save_images(images, workdir):
            cmd += ["-i", img.name]
        cmd.append("-")  # prompt comes from stdin
        async with _slots:
            proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=workdir, stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            try:
                out, _ = await asyncio.wait_for(proc.communicate(prompt.encode()), TIMEOUT)
            except asyncio.TimeoutError:
                proc.kill()
                raise HTTPException(504, detail={"message": f"codex exec timed out after {TIMEOUT:.0f}s", "type": "timeout"})
        log = out.decode(errors="replace")
        result = workdir / "out.json"
        if proc.returncode != 0 or not result.exists():
            m = re.search(r'"message":"([^"]+)"', log)
            raise HTTPException(502, detail={"message": m.group(1) if m else log.strip()[-400:], "type": "codex_error"})
        tokens = re.search(r"tokens used\s*\n\s*([\d,]+)", log)
        return json.loads(result.read_text()), int(tokens.group(1).replace(",", "")) if tokens else 0
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _message(parsed: dict) -> dict:
    calls = []
    for tc in parsed.get("tool_calls") or []:
        args = tc.get("arguments_json") or "{}"
        try:
            json.loads(args)
        except json.JSONDecodeError:
            args = "{}"
        calls.append({"id": f"call_{uuid.uuid4().hex[:12]}", "type": "function", "function": {"name": tc["name"], "arguments": args}})
    msg: dict[str, Any] = {"role": "assistant", "content": None if calls else parsed.get("content", "")}
    if calls:
        msg["tool_calls"] = calls
    return msg


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


@app.exception_handler(HTTPException)
async def openai_style_error(_, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "type": "error"}
    return JSONResponse({"error": detail}, status_code=exc.status_code)


@app.get("/v1/models")
async def models() -> dict:
    return {"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model", "owned_by": "codex-cli"}]}


@app.post("/v1/chat/completions")
async def chat_completions(body: dict):
    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(400, detail={"message": "messages is required", "type": "invalid_request_error"})
    tools = body.get("tools") or None
    if body.get("tool_choice") == "none":
        tools = None
    json_mode = (body.get("response_format") or {}).get("type") in ("json_object", "json_schema")
    model = body.get("model") or DEFAULT_MODEL

    parsed, tokens = await run_codex(build_prompt(messages, tools, json_mode), build_schema(tools), model, _image_urls(messages))
    msg = _message(parsed)
    finish = "tool_calls" if msg.get("tool_calls") else "stop"
    base = {"id": f"chatcmpl-{uuid.uuid4().hex[:16]}", "created": int(time.time()), "model": model}

    if not body.get("stream"):
        return {**base, "object": "chat.completion",
                "choices": [{"index": 0, "message": msg, "finish_reason": finish}],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": tokens}}

    async def stream():
        chunk = {**base, "object": "chat.completion.chunk"}
        yield _sse({**chunk, "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]})
        if msg.get("tool_calls"):
            deltas = [{"index": i, **tc} for i, tc in enumerate(msg["tool_calls"])]
            yield _sse({**chunk, "choices": [{"index": 0, "delta": {"tool_calls": deltas}, "finish_reason": None}]})
        else:
            # Codex returns the whole answer at once; send it in small pieces so UIs still animate.
            for piece in re.findall(r"\S+\s*", msg["content"] or ""):
                yield _sse({**chunk, "choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": None}]})
                await asyncio.sleep(0.015)
        yield _sse({**chunk, "choices": [{"index": 0, "delta": {}, "finish_reason": finish}]})
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    if not shutil.which(CODEX_BIN):
        raise SystemExit("Codex CLI not found. Install it and run `codex login` (Sign in with ChatGPT) first.")
    print(f"Codex shim on http://127.0.0.1:{PORT}/v1  (model: {DEFAULT_MODEL}; local only, do not expose)")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
