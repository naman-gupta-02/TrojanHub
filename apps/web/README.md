# apps/web: Next.js website

Next.js 16 (App Router, Turbopack) + Tailwind 4. Shell owner: **Jaymin (P4)**. Each page belongs to its feature owner.

```bash
npm install                      # once, from the repo root
cp apps/web/.env.example apps/web/.env.local
npm run web                      # from the repo root -> http://localhost:3000
```

Start the AI service too (`services/ai`, port 8000). Every page calls it through `@/lib/api`.

| Route | File | Owner |
|---|---|---|
| `/` | `app/page.tsx` | P3 Parnavi (feed) |
| `/chat` | `app/chat/` | P1 Naman |
| `/lost-found` | `app/lost-found/` | P2 Vishwa |
| `/events`, `/deals`, `/rewards` | `app/events/`, `app/deals/`, `app/rewards/` | P3 Parnavi |
| `/report` | `app/report/` | P4 Jaymin |
| `/admin` | `app/admin/` | P4 Jaymin |
| `/login` | `app/login/` | P4 Jaymin (email code, @usc.edu only) |

## How to build your page

- Replace the `<Placeholder>` in your page with real UI. Keep the `api.*` call. It already returns typed mock data.
- API client: `import { api } from "@/lib/api"`. Types: `import type { Item } from "@trojanhub/shared"`.
- Colors are Tailwind classes from `app/globals.css`: `bg-cardinal`, `text-gold`, `text-ink`, `text-muted`, `border-line`, `bg-surface`. Use cardinal only for primary actions.
- Supabase (direct reads, Storage uploads): `import { supabase } from "@/lib/supabase"`. It's `null` until env vars are set.
- This Next.js version is newer than most AI training data. Check the docs in
  `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Before you push: `npm run typecheck` and `npx next build` in `apps/web`.
