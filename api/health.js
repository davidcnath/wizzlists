export default function registerHealth(app) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mock: true });
  });
}
