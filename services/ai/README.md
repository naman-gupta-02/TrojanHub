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
your feature, open your `routes.py`, find the `if settings.use_mocks:` branch, and write the real
logic after it (where `raise not_built(...)` is). Keep the same response shape (`packages/shared/types.ts`).
Flip `USE_MOCKS=false` when your endpoint is real.

- Auth: add `user_id: str = Depends(get_user_id)`. With a Supabase token it's the real user; in mock mode without one it's a demo user.
- Database: `from app.core.supabase import get_supabase` (service role, server only).
- LLM: `from app.core.llm import get_client, get_vision_client, model_name` (OpenAI-compatible, provider set by env).
- Errors: `raise HTTPException(status, detail={"code": "...", "message": "..."})` becomes `{error: {code, message}}`.

## Layout

| Folder | Owner |
|---|---|
| `app/main.py`, `app/core/` | P4 Jaymin: app, config, LLM wrapper, auth, Supabase client |
| `app/chat/`, `app/rag/`, `scripts/scrape/`, `evals/` | P1 Naman |
| `app/lostfound/` | P2 Vishwa |
| `app/events/`, `app/notify/` | P3 Parnavi |
| `app/complaints/`, `app/admin/`, `scripts/seed.py` | P4 Jaymin |
