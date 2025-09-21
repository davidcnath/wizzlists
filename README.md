# WizzLists (MVP)

Single-screen list maker:
1) User enters a topic → we stream an interesting top 10 (cap 20 with "More").
2) Then we ask: "How do you want to sort this?" → show 3 GPT-suggested criteria.
3) Sorting streams rank updates + a confidence bar (0–100).

## How this repo is organized

- public/           Frontend (static). index.html + minimal JS.
- api/              Backend endpoints (HTTP / SSE).
- src/              All real logic (imported by /api/*).
  - pipeline/       Two pipelines: generate/ and sort/
  - services/       Wikipedia, OpenAI, cache adapters
  - logic/          Domain logic (interesting pick, confidence, ranking)
  - utils/          Helpers (timeouts, errors, flags, logger)
  - types/          Shapes for items, events, suggestions

## Dev flags
- MOCK_MODE=true → endpoints return mocked streams (no keys needed).
- Switch to false when wiring real Wikipedia + OpenAI.

## Env
Copy .env.example to .env and fill in keys when ready.
