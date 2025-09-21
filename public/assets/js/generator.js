// UI glue only. Talks to /api/* and updates DOM.
// PHASE A: call /api/generate (SSE) → render items, support "More" up to 20.
// PHASE B: call /api/suggest-sort (JSON) → show 3 chips; then /api/sort (SSE) → animate reorder + show confidence.
// NOTE: keep this file tiny—no business logic here.
