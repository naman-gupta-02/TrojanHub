# Mocks

One fake response per endpoint (ARCHITECTURE.md §6). The AI service serves these while
`USE_MOCKS=true`, so screens and Tommy's tools work before the real endpoints exist.
Shapes match `../types.ts`. If you change one, change the other.

| File | Endpoint | Owner |
|---|---|---|
| `chat_stream.json` | `POST /chat` (SSE) + `/chat/confirm` (on branch `p1/chatbot`) | P1 |
| `items_create.json` / `items_create_valuable.json` | `POST /items` (valuable if the description says airpods/phone/wallet…) | P2 |
| `items_search.json` | `GET /items/search`, `POST /items/search-by-image` | P2 |
| `items_claim.json` / `items_claim_valuable.json` | `POST /items/{id}/claim` | P2 |
| `flyers_scan.json` | `POST /flyers/scan` | P3 |
| `events_search.json` | `GET /events/search` (also used by save + ics) | P3 |
| `deals_search.json` | `GET /deals/search` | P3 |
| `events_save.json` | `POST /events/{id}/save` | P3 |
| `rewards_progress.json` | `GET /rewards/progress` | P3 |
| `feed.json` | `GET /feed` | P3 |
| `complaints_draft.json` / `complaints_confirm.json` | `POST /complaints` (draft / `confirm:true`) | P4 |
| `complaints_safety.json` | `POST /complaints` when the text mentions gas, fire, hurt… | P4 |
| `complaints_mine.json` | `GET /complaints/mine` | P4 |
| `tickets_upvote.json` | `POST /tickets/{id}/upvote` | P4 |
| `admin_complaints.json` | `GET /admin/complaints`, PATCH, CSV | P4 |
| `admin_stats.json` | `GET /admin/stats` | P4 |
