// Maintains a ranked order as attributes arrive; emits periodic rank updates.
// Input: { items, key, values[], expectedType }
// Output: sequences for SSE: 'rank' { order }, plus 'attr' events passthrough

