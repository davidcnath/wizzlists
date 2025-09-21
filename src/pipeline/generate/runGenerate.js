// Orchestrates PHASE A (topic → interesting items, cap 20).
// Input: { topic: string, limit: number, mode: "fast"|"accurate", signal? }
// Calls: step.gptQueries → step.wikiFetch → step.interestingPick → step.shapeItems
// Output: Async iterable of ListItem (or array), suitable for SSE 'item' streaming.

