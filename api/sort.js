// /api/sort  (SSE)
// INPUT (POST body): { items: ListItem[], criterion: string, mode?: "fast"|"accurate" }
// EVENTS: 
//   "attr" { id, key, value, provenance }
//   "rank" { order: string[] }
//   "confidence" { value: number }  // 0–100
//   "done"
// TODO: MOCK_MODE: send a couple rank/confidence updates, then 'done'.
// TODO: when real, call src/pipeline/sort/runSort.js

