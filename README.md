# TrojanHub

> **Everything Trojans need, one ask away.**
> AI@USC Hackathon · "For Trojans, By Trojans" · Nov 14–15, 2026

TrojanHub is one AI campus companion, built as a **mobile app** (Expo) and a **website**
(Next.js). It brings lost & found, deals, events, maintenance complaints and campus questions
into one place. At its center is **Tommy**, an AI chatbot that answers USC questions with
official links and contacts. Tommy can also take actions for you, like logging a complaint,
reporting a found item or turning a flyer photo into a calendar event.

## Features

| Feature | What it does |
|---|---|
| 🤖 **Tommy, the chatbot** | Answers from public USC pages with sources (RAG). Says when it doesn't know. Calls the other features as tools and always asks you to confirm before it writes anything. |
| 🔎 **Two-tier Lost & Found** | AI sorts each found item into a tier. **Valuables** (AirPods, wallets, IDs) go to a DPS or IT drop-off. **Everyday items** (bottles, umbrellas) are handed off through in-app messages. You can search by words or by photo (CLIP). |
| 🎁 **Deals & Freebies** | Ongoing student deals and one-time freebies, attendance-reward tracking, add to calendar, RSVP, and a morning digest of free stuff. |
| 📅 **Org & Campus Events** | A calendar for events that never reach Engage SC. Includes a flyer scanner, verified org badges, filters and ticket alerts. |
| 🛠️ **Smart Complaints** | Describe the problem in one sentence. AI picks the department, category and urgency, groups duplicate reports, and links to the right USC form. Safety issues show DPS contacts right away. |
| 📊 **Admin dashboard** | Shows each complaint's routing (logged, which department and why, forwarded), a routing-accuracy score, trends and CSV export. |

## Tech stack

- **Mobile:** React Native + Expo (expo-router)
- **Web:** Next.js 14+ (App Router) + Tailwind + shadcn/ui, in USC cardinal `#990000` and gold `#FFCC00`
- **Shared:** `packages/shared` holds the TypeScript types, zod schemas and a typed API client
- **Backend:** Supabase (Postgres + pgvector, Auth with @usc.edu magic links, Storage, Realtime)
- **AI service:** FastAPI (Python 3.11) on Replit
- **Models:** an LLM with tool calling and vision, OpenCLIP ViT-B/32, and MiniLM text embeddings

## Repository layout

```
apps/mobile        Expo app
apps/web           Next.js website + admin dashboard
packages/shared    Shared TS types, API client, theme
services/ai        FastAPI: chat, rag, lostfound, events, notify, complaints, admin
supabase/          Migrations + seed data
```

## Team

| | Person | Owns |
|---|---|---|
| P1 | Naman | Tommy (scraping, RAG, agent, chat UI) |
| P2 | Vishwa | Lost & Found (CLIP, tiers, search, claims, messages) |
| P3 | Parnavi | Events, Deals & Freebies, notifications, feed |
| P4 | Jaymin | Platform, Supabase, Complaints, Admin, deployment |

## Getting started (15 minutes, no keys needed)

Everything runs on **mock data** right away. You don't need Supabase, an LLM key, or anyone else's code.

**Needs:** Node **22+** (`nvm use`), Python **3.11**, the Expo Go app on your phone.

```bash
git clone https://github.com/naman-gupta-02/TrojanHub.git && cd TrojanHub
npm install                                    # installs mobile + web + shared

# 1) AI service (terminal 1)
cd services/ai && python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp ../../.env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # http://localhost:8000/docs

# 2) Website (terminal 2, repo root)
npm run web                                    # http://localhost:3000

# 3) Mobile (terminal 3, repo root)
npm run mobile                                 # scan the QR with Expo Go (same Wi-Fi)
```

Every page and tab already calls its endpoint and shows the mock response. Replace the
placeholder with your real UI, then make the endpoint real.

## Start here: what each person builds first

| Who | Branch | Backend (replace the mock branch) | Mobile | Web | Your mocks |
|---|---|---|---|---|---|
| **Naman (P1)** | `p1/chatbot` | `services/ai/app/chat/`, `app/rag/`, `scripts/scrape/` | `app/(tabs)/chat.tsx` | `app/chat/` | `chat_stream.json` |
| **Vishwa (P2)** | `p2/lost-found` | `services/ai/app/lostfound/routes.py` (+ `clip.py`, `tiers.py`) | `app/(tabs)/lost-found/` | `app/lost-found/` | `items_*.json` |
| **Parnavi (P3)** | `p3/events` | `services/ai/app/events/routes.py`, `app/notify/` | `app/(tabs)/home.tsx`, `app/(tabs)/events/` | `app/page.tsx`, `events/`, `deals/`, `rewards/` | `flyers_scan`, `events_*`, `deals_search`, `rewards_progress`, `feed` |
| **Jaymin (P4)** | `p4/platform` | `services/ai/app/complaints/`, `app/admin/`, `app/core/` | `app/(tabs)/report.tsx`, `app/auth/` | `app/report/`, `app/admin/`, `app/login/` | `complaints_*`, `tickets_upvote`, `admin_*` |

What's already shared and ready:

- **API formats:** [`packages/shared/types.ts`](packages/shared/types.ts) defines every request and response.
  [`packages/shared/api.ts`](packages/shared/api.ts) is the typed client (`api.items.search(...)`).
- **Fake responses:** [`packages/shared/mocks/`](packages/shared/mocks/), one per endpoint.
- **Database:** [`supabase/migrations/`](supabase/migrations/) has every table from ARCHITECTURE.md §5, plus RLS,
  vector search functions, storage buckets, realtime and @usc.edu-only sign-up.
  [`supabase/seed.sql`](supabase/seed.sql) has buildings and complaint routes.

### Connecting Supabase (once, by Jaymin or whoever has the account)

1. Create a project at supabase.com. In **SQL Editor**, run `supabase/migrations/202611141600_p4_initial_schema.sql`, then `supabase/seed.sql`.
2. **Auth → Email:** keep email sign-in on. Edit the "Magic Link" email template to include `{{ .Token }}`, because the app signs in with a 6-digit code.
3. Put the keys in `services/ai/.env` (URL, anon, service role), `apps/web/.env.local` and `apps/mobile/.env` (URL + anon only). See each `.env.example`.
4. Share the URL and anon key with the team. **Never share the service role key** outside the AI service.

## Try it online

Deploying on Replit (one app, one URL for the website and the AI service): see
[`DEPLOY.md`](DEPLOY.md).

## Contributing

- Work on your own branch: `p1/chatbot`, `p2/lost-found`, `p3/events` or `p4/platform`.
- Merge into `main` through a PR. One review is enough. Merge at least every 3 hours.
- Shared contracts (`packages/shared/`, `supabase/migrations/`, API shapes) change only by PR,
  and you ping the people affected.
- Keep `main` runnable. Mock data is better than a broken screen.

## Docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md): system design, schema, API contracts, phases
- [`TrojanHub — Project Proposal.md`](<TrojanHub — Project Proposal.md>): problem, solution, demo script
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md): rules for AI coding agents
