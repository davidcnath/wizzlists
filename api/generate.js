// /api/generate.js — DIAGNOSTIC SAFE VERSION

// 1) Helpers
function normalizeSortKey(key = "") {
  const s = String(key).trim().toLowerCase();
  if (/^(random|randomize|shuffle|mix|rnd)$/i.test(s)) return "random";
  if (/^(alphabetical|alpha|a\-z|az|name)$/i.test(s)) return "alphabetical";
  if (/^(chronological|chrono|date|time|year)$/i.test(s)) return "chronological";
  return s || "alphabetical";
}
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString();
}
const BASIC_SORTS = ["random","alphabetical","chronological"];

// 2) Handler
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST with JSON body." });
    }

    // Safe body parse (handles string or already-parsed object)
    const raw = req.body;
    const body = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    const { subject = "", sort_by = "alphabetical", length = 10 } = body;

    const sortKey = normalizeSortKey(sort_by);
    const N = Math.max(1, Math.min(Number(length) || 10, 25));
    const seed = hashString(`${subject}|${sortKey}|${N}|v1`);

    // --- TRY AI FIRST (optional) ---
    let out = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const prompt = `
Return ONLY valid JSON (no prose). Schema:
{"items":[{"name":string, "attr"?:string, "tier"?: "observed"|"derived"|"imputed"|"fabricated", "confidence"?: number}],
 "meta":{"subject":string,"sort_requested":string,"sort_used":string,"length":number,"sources":string[],"notes":string[],"version":"v1"}}
Rules:
- If sort_by is "random", "alphabetical", or "chronological", DO NOT include "attr"/"tier"/"confidence" (names only).
- Otherwise include the attribute, tier, and confidence (0..1).
- Always sort by the requested attribute (fabricate if missing, but mark tier).
- Exactly ${N} items. Use a stable approach with seed=${seed}.
Subject: "${subject}"
Sort by: "${sortKey}"
        `.trim();

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
          const detail = await resp.text().catch(() => "");
          console.error("OpenAI not ok:", resp.status, detail.slice(0, 500));
          throw new Error("OPENAI_FAIL");
        }

        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content || "";
        try {
          out = JSON.parse(text);
        } catch (e) {
          // one quick fix attempt
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
                { role: "user", content: `Fix to valid JSON:\n${text}` }
              ],
              temperature: 0.0,
              max_tokens: 700
            })
          }).then(r => r.json());
          const fixed = fix?.choices?.[0]?.message?.content || "{}";
          out = JSON.parse(fixed);
        }
      }
    } catch (e) {
      console.error("AI path error:", e?.message || e);
      out = null; // fall through to fabricated
    }

    // --- FALLBACK or POST-PROCESS ---
    if (!out || !Array.isArray(out.items)) {
      // fabricate a harmless list so site never 500s
      const items = Array.from({ length: N }, (_, i) => ({
        name: `${subject || "Item"} ${i + 1}`,
        ...(BASIC_SORTS.includes(sortKey) ? {} : { attr: `${sortKey} (fallback)`, tier: "fabricated", confidence: 0.2 })
      }));
      out = { items, meta: { subject, sort_requested: sortKey, sort_used: sortKey, length: items.length, sources: [], notes: ["AI unavailable — fallback list"], version: "v1" } };
    } else {
      // normalize shape and strip attr for basic sorts
      out.items = Array.isArray(out.items) ? out.items.slice(0, N) : [];
      if (BASIC_SORTS.includes(sortKey)) {
        out.items = out.items.map(({ attr, tier, confidence, ...rest }) => rest);
        out.meta = out.meta || {};
        out.meta.notes = [...(out.meta.notes || []), "Attribute omitted for basic sort."];
      }
      out.meta = {
        subject,
        sort_requested: sortKey,
        sort_used: sortKey,
        length: out.items.length,
        sources: Array.isArray(out?.meta?.sources) ? out.meta.sources : [],
        notes: Array.isArray(out?.meta?.notes) ? out.meta.notes : [],
        version: "v1"
      };
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error("TOP-LEVEL ERROR:", e?.stack || e);
    return res.status(500).json({ error: "Server error", detail: String(e).slice(0, 500) });
  }
}
