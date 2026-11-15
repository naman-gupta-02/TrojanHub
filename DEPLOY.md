# Deploying TrojanHub on Replit

One Replit app runs the whole system at **one public URL**:

```
https://<your-app>.replit.app
 ├─ /            website (Next.js, public port)
 ├─ /api/*  ──►  AI service (FastAPI, internal port 8000, not public)
 └─ /health ──►  AI service health check
```

The website forwards `/api/*` to the AI service running next to it (`apps/web/next.config.ts`),
so there is one address to share and no CORS setup. Supabase (database, login, storage) is
already hosted. The mobile app can point at the same URL.

`.replit` and `scripts/replit-start.sh` hold the build and run commands. This exact setup was
tested locally, including the Codex login passed in as a secret:
- the production build and the start script
- all pages, the sign-in page, and real Tommy answers
- chat streaming through `/api`
- signed-out posting refused, signed-out browsing allowed

Deploy from `main`. Today most of the work is on `p1/chatbot`: merge it with a PR first, or
import `p1/chatbot` for a test run.

## Decisions (Naman, 2026-11-14)

1. **LLM: Tommy runs on Naman's ChatGPT login through the Codex shim, inside the Replit app.**
   - Set the Secret `CODEX_AUTH_JSON` to the full contents of `~/.codex/auth.json` from a
     machine where `codex login` (Sign in with ChatGPT) worked.
   - At start-up `scripts/replit-start.sh` writes it to a private folder, starts the shim on
     127.0.0.1:8787 (never public), points Tommy, the complaint sorter and the flyer reader at
     it, and removes the secret from the environment of the website and API.
   - **Costs to accept:**
     - every hosted chat uses Naman's ChatGPT Edu quota
     - replies take about 10–20 s
     - anyone with edit access to the Replit app can read the secret
     - ChatGPT may rotate the login. If Tommy starts saying "having trouble thinking" after a
       restart, run `codex login` again, update the Secret, and redeploy.
   - A paid API key (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) wins if both are set.
   - Tommy is for signed-in USC students only (`REAL_FEATURES` includes `chat`), so strangers
     can't spend the quota. Signed-out visitors see "Sign in … to chat with Tommy".
2. **Only signed-in students can write.** Posting events and deals, scanning or uploading
   flyers, voting, saving, checking in, changing alert settings, filing complaints and admin
   actions all need a USC sign-in. Everyone can browse events, deals, the feed and rewards
   signed out.
3. **Scheduler and email.** Set `CRON_INLINE=true` in ONE place only (Replit or a laptop), and
   only add `RESEND_API_KEY` if the digest emails should really go out.

## 1. Create the app

1. Replit → **Create App → Import from GitHub** → `naman-gupta-02/TrojanHub` (pick the branch).
2. Replit reads `.replit`: Python 3.11 + Node 22, run command `sh scripts/replit-start.sh`.
3. **Secrets** tab: add every variable in the table below. The `NEXT_PUBLIC_*` values are
   baked into the website when it builds, so add them **before** the first deploy.
4. Press **Run** once in the workspace to check it starts. The first install is slow: PyTorch
   and the embedding model are large.

## 2. Deploy

1. **Deploy → Reserved VM** (`deploymentTarget = "gce"` in `.replit`). Choose at least
   **2 GB RAM**: the AI service holds the embedding model in memory, and Autoscale's cold starts
   would reload it on every wake-up.
2. Replit runs the build from `.replit`:
   - CPU-only PyTorch (the default Linux build pulls ~2.5 GB of GPU libraries)
   - Python requirements, `npm ci`
   - the Codex CLI (pinned version, into `.codex-cli/`)
   - the website build with `NEXT_PUBLIC_API_URL=/` and `API_PROXY_TARGET=http://127.0.0.1:8000`
3. The deployment runs `scripts/replit-start.sh`. It starts the AI service, waits for
   `/health`, then starts the website on the public port.

Replit changes its screens often. If the deploy settings don't pick up `.replit`, enter:
- **Build:** `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu && grep -v '^pytest' services/ai/requirements.txt > /tmp/req.txt && pip install -r /tmp/req.txt && npm ci && npm install --no-save --prefix .codex-cli @openai/codex@0.154.0 && API_PROXY_TARGET=http://127.0.0.1:8000 NEXT_PUBLIC_API_URL=/ npm --workspace apps/web run build`
- **Run:** `sh scripts/replit-start.sh`
- **Port:** 3000 → external 80

## 3. Connect Supabase

1. Supabase → **Authentication → URL Configuration:**
   - Site URL: `https://<your-app>.replit.app`
   - Redirect URLs: `https://<your-app>.replit.app/login` and keep `http://localhost:3000/**` for local dev
2. Supabase → **Authentication → Email Templates:** add `Your TrojanHub code: {{ .Token }}` to
   **Confirm signup** and **Magic Link**. University mail scanners use up one-time links; codes
   still work.

## 4. Check it works

- `https://<your-app>.replit.app/health` shows `"ok": true`
- Home, Events, Deals and Rewards show real data
- Sign in at `/login` with an @usc.edu email and the 6-digit code
- Tommy answers at `/chat` with real answers (the deploy log shows `LLM: Codex shim (ChatGPT login)`)
- Signed out, posting an event says "Sign in…"; browsing works
- File a complaint while signed in: it shows up on `/admin` for an admin account

## Secrets

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<ref>.supabase.co` (public; used by the website) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public anon key (used by the website) |
| `SUPABASE_URL` | yes | same URL, for the AI service |
| `SUPABASE_ANON_KEY` | yes | same anon key; the AI service uses it to check sign-ins |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **AI service only.** Bypasses all security rules; never `NEXT_PUBLIC_` |
| `USE_MOCKS` | yes | `true` until every feature is real |
| `REAL_FEATURES` | yes | `complaints,admin,chat` (chat = Tommy only for signed-in students); names: chat, lostfound, events, notify, complaints, admin |
| `CRON_SECRET` | yes | any long random string; protects the cron endpoints |
| `CODEX_AUTH_JSON` | for Tommy | contents of `~/.codex/auth.json` (Naman's ChatGPT login); see Decisions |
| `CODEX_MODEL` | no | default `gpt-5.6-luna` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | no | a paid API key instead of Codex (wins if both are set) |
| `CRON_INLINE` | no | `true` in one place only |
| `RESEND_API_KEY` | no | only if digest emails should be sent |
| `PUBLIC_API_URL`, `PUBLIC_WEB_URL` | no | `https://<your-app>.replit.app` (links in emails and calendar files) |
| `EMBED_MODEL` | no | default `sentence-transformers/all-MiniLM-L6-v2` (must stay 384-dimensional) |

`NEXT_PUBLIC_API_URL` and `API_PROXY_TARGET` are set by the build command; don't add them.

## Other hosts

`services/ai/Dockerfile` builds just the AI service as a container (repo root as the build
context: `docker build -f services/ai/Dockerfile .`). It was tested locally against the live
Supabase. Use it if the AI service ever has to run somewhere other than Replit.
