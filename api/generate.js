export default async function handler(req, res) {
  try {
    const { subject = "countries", sort_by = "alphabetical", length = 10 } =
      req.method === "POST" ? JSON.parse(req.body || "{}") : {};

    const items = Array.from(
      { length: Math.min(Number(length) || 10, 25) },
      (_, i) => ({
        name: `${subject} ${i + 1}`,
        attr: sort_by,
        tier: "fabricated",
        confidence: 0.4
      })
    );

    res.status(200).json({
      items,
      meta: {
        subject,
        sort_requested: sort_by,
        sort_used: sort_by,
        length: items.length,
        sources: [],
        notes: [],
        version: "v1"
      }
    });
  } catch (e) {
    res.status(400).json({ error: "bad request" });
  }
}
