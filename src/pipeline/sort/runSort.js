// Orchestrates PHASE B (criterion → attributes → ranking + confidence).
// Input: { items: ListItem[], criterion: string, mode: "fast"|"accurate" }
// Calls: step.fetchAttribute (per item) → step.confidence → step.rankAndStream
// Output: stream-friendly hooks: onAttr, onRank, onConfidence, onDone

