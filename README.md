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

## Getting started

> Setup steps will be added once the app shells are in (Phase 0).

1. Copy `.env.example` to `.env` and fill in your keys. **Never commit `.env`.**
2. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how to run each part.

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
