# Mocks

Each owner commits mock responses for their endpoints here in Phase 0 (ARCHITECTURE.md §6),
so teammates can build against them before the real endpoint exists.

Name files after the endpoint, e.g. `chat_stream.json`, `items_search.json`, `flyers_scan.json`,
`complaints_draft.json`. The AI service serves these when `USE_MOCKS=true`.
