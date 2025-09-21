// /api/generate  (SSE)
// INPUT (query): topic, limit (default 10), mode ("fast"|"accurate", default "fast")
// EVENTS: "item" {ListItem}, "done" {count}
// TODO: in MOCK_MODE, stream a few fake 'item' events then 'done'.
// TODO: when real, call src/pipeline/generate/runGenerate.js
