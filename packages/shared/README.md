# packages/shared: the contract everyone codes against

Owner: **Jaymin (P4)**. Change it with a PR and ping everyone it affects.

| File | What |
|---|---|
| `types.ts` | Every DB row (matches `supabase/migrations/`) and every API request/response (ARCHITECTURE.md §6) |
| `api.ts` | `createApi()`: a typed client for every endpoint, including chat SSE streaming |
| `theme.ts` | Colors, spacing, radius, font sizes, 44px tap target |
| `mocks/*.json` | A fake response for every endpoint. The AI service serves these when `USE_MOCKS=true` |

```ts
import { createApi, type Item } from "@trojanhub/shared";
import { colors } from "@trojanhub/shared/theme";
```

## Changing a contract

1. Edit `types.ts` **and** the matching mock in `mocks/` in the same PR.
2. If it's a DB change, add a new migration in `supabase/migrations/` (P4 merges those).
3. Ping the people who call your endpoint, especially Naman, since Tommy's tools call every endpoint.

Mocks are produced from consistent fake ids (buildings match `supabase/seed.sql`). Edit the JSON
directly. Text marked `[MOCK]` stands in for facts (hours, phone numbers) that must come from
official pages.
