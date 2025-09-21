function sseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}
function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function shuffle(ids) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function registerSort(app) {
  app.post("/api/sort", (req, res) => {
    const { items, criterion, mode } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items" });
    }
    if (!criterion || typeof criterion !== "string") {
      return res.status(400).json({ error: "Missing criterion" });
    }

    sseHeaders(res);

    // Mock: stream a few rank updates & confidence ticks
    const ids = items.map((i) => i.id).filter(Boolean);
    let confidence = 40 + Math.round(Math.random() * 10);
    let steps = 0;

    const timer = setInterval(() => {
      steps++;

      // Occasionally send a fake attribute
      if (steps <= 3) {
        const id = ids[Math.floor(Math.random() * ids.length)];
        const val = Math.round(Math.random() * 1000);
        send(res, "attr", { id, key: criterion, value: val, provenance: "mock" });
      }

      // Rank update
      const order = shuffle(ids);
      send(res, "rank", { order });

      // Confidence
      confidence = Math.min(100, confidence + 10 + Math.round(Math.random() * 5));
      send(res, "confidence", { value: confidence });

      if (steps >= 4) {
        clearInterval(timer);
        send(res, "done", {});
        return res.end();
      }
    }, 350);

    req.on("close", () => clearInterval(timer));
  });
}
