# services/ai: FastAPI AI service

One Python service for everything that uses AI: chat, Lost & Found (CLIP), flyers, notifications,
complaints and admin stats. See ARCHITECTURE.md §6 for the API contracts.

## Run locally

```bash
cd services/ai
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env        # USE_MOCKS=true works with no keys at all
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health check: http://localhost:8000/health
- Swagger docs (try every endpoint): http://localhost:8000/docs
- All routes are under `/api`, e.g. `GET /api/feed`.
- `--host 0.0.0.0` lets phones on the same Wi-Fi reach it.

## Mock mode → real mode

With `USE_MOCKS=true` every endpoint returns its JSON from `packages/shared/mocks/`. To build
your feature, open your `routes.py`, find the `if settings.mock("<your feature>"):` branch, and
write the real logic after it (where `raise not_built(...)` is). Keep the same response shape
(`packages/shared/types.ts`).

When your feature is real, add its name to `REAL_FEATURES` in `.env`. The others keep serving
mocks:

```
USE_MOCKS=true
REAL_FEATURES=complaints,admin      # names: chat, lostfound, events, notify, complaints, admin
```

- A real feature needs a signed-in student (a Supabase token); without one it returns 401.
  Mocked features still work signed out, as the demo user.
- `USE_MOCKS=false` makes everything real at once.
- `GET /health` shows what is real right now.
- New endpoint? Add its URL prefix to `_FEATURES` in `app/core/auth.py` (a test checks this).

- Auth: add `user_id: str = Depends(get_user_id)`. With a Supabase token it's the real user; in mock mode without one it's a demo user.
- Database: `from app.core.supabase import get_supabase` (service role, server only).
- LLM: `from app.core.llm import get_client, get_vision_client, model_name` (OpenAI-compatible, provider set by env).
- Errors: `raise HTTPException(status, detail={"code": "...", "message": "..."})` becomes `{error: {code, message}}`.

## Tommy (P1): build the USC index and test

```bash
python -m scripts.scrape.crawl     # ~1 min: fetch the 49 pages in seeds.yaml (polite, 1 req/s)
python -m scripts.scrape.chunk     # split into ~500-token chunks + extract contacts
python -m scripts.scrape.embed     # MiniLM embeddings -> local index (+ Supabase doc_chunks if configured)
python -m evals.run                # retrieval evals, no LLM needed (--sweep to tune the threshold)
python -m evals.run --chat         # full answers, needs LLM_MODEL
python -m pytest tests -q          # agent + tools + confirm flow with a fake LLM
```

`/api/chat` uses the real agent as soon as `LLM_MODEL` is set, and the mock stream until then.

## Which LLM? (set 3 lines in `services/ai/.env`)

Anything with an OpenAI-compatible `/v1/chat/completions` works. Check it with
`python -m scripts.smoke_llm` (plain chat, tool calling, image).

| Option | `.env` | Notes |
|---|---|---|
| **Codex shim** (ChatGPT login, no Hermes) | `LLM_BASE_URL=http://127.0.0.1:8787/v1`, `LLM_API_KEY=codex-shim`, `LLM_MODEL=gpt-5.6-luna` | Run `codex login` once, then `python -m scripts.codex_shim` in its own terminal. Best answers. ~8-10 s per LLM call (Tommy makes 2+ per reply), no real streaming, counts against that person's Codex limits. Local only: never expose it. |
| **Ollama** (local model) | `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=<model from ollama list>` | Free, private, offline. A small model scored 16/20 on the chat evals. Slow on a laptop. Images must be base64. |
| **Backup API key** | `LLM_BASE_URL=<provider URL>`, `LLM_API_KEY=<key>`, `LLM_MODEL=<model>` | Fastest and real streaming. Keep one ready for the demo. |
| none | leave `LLM_MODEL=` empty | `/api/chat` streams the mock. |

Tommy is built to hide a slow model:
- **Pre-fetch:** plain campus questions are searched before the first LLM call, so the model
  answers in one call instead of two.
- **Answer cache:** the same first question on the same day replays instantly (1 hour, in
  memory; `CHAT_CACHE=0` turns it off). Before a pitch, run `python -m scripts.warm_demo`
  (after starting the API and the LLM): the demo questions then answer in under a second.
  Type them on stage exactly as listed in that script.
- **Warm-up:** the embedding model loads at startup when `LLM_MODEL` is set (`CHAT_WARMUP=0` to skip).
- Finished turns are saved to Supabase `chat_messages` when Supabase is configured.

Evals against a slow or rate-limited model: `python -m evals.run --chat --only pantry_hours,its_phone`.

Chunks are ~180-220 tokens (not the 500 in ARCHITECTURE.md §7.1) because the embedding model
only reads 256 tokens. After changing chunking, rerun `chunk` and `embed`.

## Layout

| Folder | Owner |
|---|---|
| `app/main.py`, `app/core/` | P4 Jaymin: app, config, LLM wrapper, auth, Supabase client |
| `app/chat/`, `app/rag/`, `scripts/scrape/`, `evals/` | P1 Naman |
| `app/lostfound/` | P2 Vishwa |
| `app/events/`, `app/notify/` | P3 Parnavi |
| `app/complaints/`, `app/admin/`, `scripts/seed.py` | P4 Jaymin |
