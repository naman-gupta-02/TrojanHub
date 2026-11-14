# services/ai: FastAPI AI service

One Python service for everything that uses AI: chat, Lost & Found (CLIP), flyers, notifications,
complaints and admin stats. See ARCHITECTURE.md §6 for the API contracts.

## Run locally

```bash
cd services/ai
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env        # then fill in your keys
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health check: http://localhost:8000/health
- Swagger docs: http://localhost:8000/docs
- All routes are under `/api`, e.g. `POST /api/chat`.
- With `USE_MOCKS=true`, endpoints serve the JSON files in `packages/shared/mocks/`.

## Layout

| Folder | Owner |
|---|---|
| `app/main.py`, `app/core/` | P4 Jaymin: app, config, LLM wrapper, auth |
| `app/chat/`, `app/rag/`, `scripts/scrape/`, `evals/` | P1 Naman |
| `app/lostfound/` | P2 Vishwa |
| `app/events/`, `app/notify/` | P3 Parnavi |
| `app/complaints/`, `app/admin/`, `scripts/seed.py` | P4 Jaymin |
