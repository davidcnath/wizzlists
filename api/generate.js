// /api/generate.js — WIKIPEDIA-FIRST VERSION

// 0) Imports (only node-fetch if you’re in Node 18-)
import fetch from "node-fetch";

// 1) Utility helpers
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
function sortAlphabetical(items) {
  return items.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" })
  );
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seedStr) {
  const s = [...seedStr].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 2166136261);
  const rng = mulberry32(s);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 2) Minimal Wikipedia/Wikidata helpers
async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "User-Agent": "WizzLists/1.0 (https://wizzlists.com)" }});
  if (!res.ok) return null;
  const j = await res.json();
  return {
    title: j.title,
    description: j.description || "",
    blurb: j.extract || "",
    thumbnail: j.thumbnail?.source || null,
    url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  };
}

// stub: try to get a few candidates from Wikipedia (in real app use list/category parsing)
async function generateWithWikipediaFirst({ subject, length, sortKey }) {
  // naive attempt: fetch "List of {subject}"
  const listTitle = `List of ${subject}`;
  const summary = await fetchSummary(listTitle);
  if (!summary) {
    return { items: [], needGPT: [], filledBy: "gpt_fallback_needed" };
  }
  // fake: just return one item (the list page itself)
  const items = [{ name: summary.title, description: summary.description, url: summary.url }];
  return { items, needGPT: [], filledBy: "wikipedia_first" };
}

// 3) GPT helpers
async function generateViaAI({ subject, sortKey, N, seed }) {
  const prompt = `
Return ONLY valid JSON (no prose). Schema:
{"items":[{"name":string, "attr"?:string, "tier"?: "observed"|"derived"|"imputed"|"fabricated", "confidence"?: number}],
 "meta":{"subject":string,"sort_requested":string,"sort_used":string,"length":number,"sources":string[],"notes":string[],"version":"v1"}}
Rules:
- If sort_by is "random", "alphabetical", or "chronological", DO NOT include "attr"/"tier"/"confidence" (names only).
- Otherwise always include "name", "attr", "tier", and "confidence".
- Always provide a numeric or categorical value for the requested attribute.
- If real data is unavailable, fabricate a plausible but reasonable value.
- Mark fabricated values with tier: "fabricated".
- Confidence must be between 0 and 1.
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

  if (!resp.ok) throw new Error("OPENAI_FAIL");
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return JSON.parse(text);
}

async function fillBlanksWithGPT(missingItems, sortKey) {
  const prompt = `
Fill in the missing "${sortKey}" values for these entities.
Return JSON array: [{ "title": ..., "${sortKey}": number or null }]
If no reliable data exists, return null.
Entities:
${missingItems.map(x => `- ${x.name}`).join("\n")}
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
        { role: "system", content: "Return ONLY valid JSON. No explanations." },
        { role: "user", content: prompt }
      ],
      temperature: 0.0,
      max_tokens: 500
    })
  });
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "[]";
  return JSON.parse(text);
}

// 4) API Handler
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST with JSON body." });
    }
    const raw = req.body;
    const body = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    const { subject = "", sort_by = "alphabetical", length = 10 } = body;

    const sortKey = normalizeSortKey(sort_by);
    const N = Math.max(1, Math.min(Number(length) || 10, 25));
    const seed = hashString(`${subject}|${sortKey}|${N}|v1`);

    let out = null;

    // --- WIKIPEDIA FIRST ---
    try {
      const wikiResult = await generateWithWikipediaFirst({ subject, length: N, sortKey });
      if (wikiResult.filledBy === "gpt_fallback_needed") {
        out = await generateViaAI({ subject, sortKey, N, seed });
      } else {
        let items = wikiResult.items;
        if (wikiResult.needGPT?.length && process.env.OPENAI_API_KEY) {
          const patched = await fillBlanksWithGPT(wikiResult.needGPT, sortKey);
          items = items.map(item => {
            const found = patched.find(p => p.title === item.title);
            return found ? { ...item, ...found } : item;
          });
        }
        out = {
          items,
          meta: {
            subject,
            sort_requested: sortKey,
            sort_used: sortKey,
            length: items.length,
            sources: ["wikipedia", ...(wikiResult.needGPT?.length ? ["openai"] : [])],
            notes: ["Wikipedia-first pipeline"],
            version: "v1"
          }
        };
      }
    } catch (e) {
      console.error("Wiki path error:", e?.message || e);
      out = null;
    }

    // --- FALLBACK FABRICATE ---
    if (!out || !Array.isArray(out.items)) {
      const items = Array.from({ length: N }, (_, i) => ({
        name: `${subject || "Item"} ${i + 1}`,
        ...(BASIC_SORTS.includes(sortKey) ? {} : { attr: `${sortKey} (fallback)`, tier: "fabricated", confidence: 0.2 })
      }));
      out = { items, meta: { subject, sort_requested: sortKey, sort_used: sortKey, length: items.length, sources: [], notes: ["AI/Wiki unavailable — fallback"], version: "v1" } };
    } else {
      // normalize output & sort if needed
      out.items = out.items.slice(0, N);
      if (BASIC_SORTS.includes(sortKey)) {
        out.items = out.items.map(({ attr, tier, confidence, ...rest }) => rest);
        out.meta.notes = [...(out.meta.notes || []), "Attribute omitted for basic sort."];
      }
      if (BASIC_SORTS.includes(sortKey)) {
        if (sortKey === "alphabetical") out.items = sortAlphabetical(out.items);
        else if (sortKey === "random") out.items = seededShuffle(out.items, seed);
      } else {
        const parseNum = (val) => {
          if (!val) return NaN;
          const m = String(val).match(/[\d\.]+/);
          return m ? parseFloat(m[0]) : NaN;
        };
        out.items.sort((a, b) => parseNum(b.attr) - parseNum(a.attr));
      }
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error("TOP-LEVEL ERROR:", e?.stack || e);
    return res.status(500).json({ error: "Server error", detail: String(e).slice(0, 500) });
  }
}
