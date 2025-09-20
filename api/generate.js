// /api/generate.js
// Serverless endpoint: POST { subject, sort_by, length }
// Returns strict JSON: { items: [...], meta: {...} }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST with JSON body." });
    }

    const { subject = "", sort_by = "alphabetical", length = 10 } =
      JSON.parse(req.body || "{}");

    // Safety caps (control cost)
    const N = Math.max(1, Math.min(Number(length) || 10, 25));

    // Deterministic seed so same prompt → same list (helps caching later)
    const seed = hashString(`${subject}|${sort_by}|${N}|v1`);

    const prompt = `
Return ONLY valid JSON matching this schema (no backticks, no prose):
{
  "items":[{"name":string,"attr":string,"tier":"observed"|"derived"|"imputed"|"fabricated","confidence":number}],
  "meta":{"subject":string,"sort_requested":string,"sort_used":string,"length":number,"sources":string[],"notes":string[],"version":"v1"}
}
Rules:
- Always sort by the requested attribute. If missing, fabricate a plausible value but mark tier correctly.
- Keep values short (e.g., "193 cm", "Blue").
- Confidence 0..1 (observed>derived>imputed>fabricated).
- Exactly ${N} items.
- Use a stable approach given seed=${seed}.
Subject: "${subject}"
Sort by: "${sort_by}"
`;

    // Call OpenAI
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a precise list generator. Output strict JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 700
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return res.status(502).json({ error: "OpenAI error", detail: errText.slice(0, 500) });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // Try to parse JSON directly. If it fails, try a tiny fix-up pass.
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      // Simple recovery: ask the model to fix JSON (one retry)
      const fix = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Return ONLY valid JSON. No explanations." },
            { role: "user", content: `Fix this to valid JSON only:\n${text}` }
          ],
          temperature: 0.0,
          max_tokens: 700
        })
      }).then(r => r.json());

      const fixed = fix?.choices?.[0]?.message?.content || "{}";
      try { out = JSON.parse(fixed); }
      catch { return res.status(502).json({ error: "Invalid JSON from model." }); }
    }

    // Minimal normalization
    out = out || {};
    out.items = Array.isArray(out.items) ? out.items.slice(0, N) : [];
    out.meta = {
      subject,
      sort_requested: sort_by,
      sort_used: out?.meta?.sort_used || sort_by,
      length: out.items.length,
      sources: Array.isArray(out?.meta?.sources) ? out.meta.sources : [],
      notes: Array.isArray(out?.meta?.notes) ? out.meta.notes : [],
      version: "v1"
    };

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e).slice(0, 300) });
  }
}

// Tiny stable hash (no dependencies)
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString();
}
