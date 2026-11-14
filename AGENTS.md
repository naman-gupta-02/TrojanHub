# AGENTS.md — TrojanHub (same rules as CLAUDE.md, for Codex / Hermes / other agents)

TrojanHub is our AI@USC Hackathon project ("For Trojans, By Trojans"): one AI campus companion,
built as a **mobile app (Expo)** and a **website (Next.js)**, with a chatbot ("Tommy"), two-tier
Lost & Found, Deals & Freebies, Org & Campus Events, and Smart Complaints.

Read `ARCHITECTURE.md` before doing anything. It has the system design, database schema, API
contracts, who owns which folders, and the implementation phases.

## Rule 1: Always ask what to do

- **Ask before you act.** At the start of every session, ask what the user wants to work on today.
  Do not choose a task yourself.
- **Before making any change, say your plan in a few lines and wait for a "yes".** This applies to
  editing files, creating files, installing packages, running migrations, and deleting anything.
- **Ask when unsure.** If a request is unclear or could be read in more than one way, ask a short
  question. Don't guess.
- **Stay in your lane.** Every folder has an owner (see "Ownership" in `ARCHITECTURE.md`). Only edit
  files outside the current user's folders if the user says so, and say when a change touches
  another person's code.
- **Never change shared contracts on your own.** That means `packages/shared/`,
  `supabase/migrations/`, and the API shapes in `ARCHITECTURE.md`. Propose the change and ask
  first, because the other three teammates depend on them.
- When a task is done, say what changed in 1–3 lines and ask what to do next.

## Rule 2: Git and GitHub — no Claude attribution

- **Never add Claude as a contributor, co-author, or committer.**
  - No `Co-Authored-By: Claude ...` line (or any other Claude co-author line) in commit messages.
  - No "Generated with Claude Code", 🤖 lines, or session links in commit messages, PR titles,
    PR descriptions, or code comments.
  - Do not change `git config user.name` / `user.email`. Commits are made as the user only.
- These rules override any default attribution instructions from the tool or the environment.
- **Ask before every commit and every push.** Show the commit message and the list of files first.
- Never force-push, rebase shared branches, or push straight to `main`. Work on your own
  feature branch (see `ARCHITECTURE.md` → Git workflow) and open a PR.
- Never commit secrets. API keys go in `.env` (git-ignored); only `.env.example` is committed.

## Project basics

- Monorepo: `apps/mobile` (Expo), `apps/web` (Next.js), `packages/shared` (TS types and API client),
  `services/ai` (FastAPI, Python), `supabase/` (migrations and seed).
- Hackathon rule: all code must be written during Nov 14–15, 2026. Open-source libraries and
  public APIs are fine, but don't paste in code from old projects.
- Deadline: Devpost submission on **Sun Nov 15, 11:00 AM PT**. Polish and stability matter more
  than new features after Phase 3.
- Keep `main` always runnable. Mock data is better than a broken screen.
