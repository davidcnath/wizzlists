import { nanoid } from "nanoid";

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

export default function registerGenerate(app) {
  app.get("/api/generate", async (req, res) => {
    const topic = String(req.query.topic || "").trim();
    let limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
    const mode = (req.query.mode === "accurate" ? "accurate" : "fast");

    if (!topic) {
      return res.status(400).json({ error: "Missing ?topic" });
    }

    sseHeaders(res);

    // Mock stream: emit `limit` items over time
    const total = limit;
    let sent = 0;

    const makeItem = (i) => ({
      id: nanoid(8),
      title: `${topic} — Item ${i + 1}`,
      url: "https://example.com",
      blurb: `This is a placeholder for “${topic}” #${i + 1}.`,
      popularity: Math.round(50 + Math.random() * 50)
    });

    const timer = setInterval(() => {
      if (sent >= total) {
        clearInterval(timer);
        send(res, "done", { count: sent, mode });
        return res.end();
      }
      const item = makeItem(sent);
      send(res, "item", item);
      sent++;
    }, 150);

    // If client disconnects
    req.on("close", () => clearInterval(timer));
  });
}
