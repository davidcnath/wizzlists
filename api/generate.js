// /api/generate.js — WIKIPEDIA-FIRST VERSION (Next.js-safe: uses global fetch)

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

// 2) Minimal Wikipedia helpers (safe placeholder — won’t crash if the page is missing)
async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "WizzLists/1.0 (https://wizzlists.com; contact@yourmail.com)" }
  });
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

// --- Wikidata subject/property mapping --- //
function mapSubjectAndProperty(subjectRaw, sortKeyRaw) {
  const subject = String(subjectRaw || "").toLowerCase();
  const sortKey = String(sortKeyRaw || "").toLowerCase();

  // Common classes (QIDs) and default properties (PIDs)
  // You can extend this table over time.
  const C = {
    mountains: { qid: "Q8502", defaultPid: "P2044" },      // elevation above sea level
    mountain:  { qid: "Q8502", defaultPid: "P2044" },
    lakes:     { qid: "Q23397", defaultPid: null },        // decide by sort key (volume/area)
    lake:      { qid: "Q23397", defaultPid: null },
    cities:    { qid: "Q515",  defaultPid: "P1082" },      // population
    city:      { qid: "Q515",  defaultPid: "P1082" },
    countries: { qid: "Q6256", defaultPid: "P1082" },      // population
    country:   { qid: "Q6256", defaultPid: "P1082" },
  };

  const PID = {
    height: "P2048",        // generic height
    elevation: "P2044",     // elevation above sea level
    population: "P1082",
    area: "P2046",
    volume: "P2047",        // water volume
  };

  // Pick class by subject keyword
  let key = Object.keys(C).find(k => subject.includes(k));
  const clazz = key ? C[key] : null;

  // Pick property by sort key (or a sensible default for the class)
  let pid = PID[sortKey] || clazz?.defaultPid || null;

  // Special-case: lakes + “height” really means elevation, and lakes + “volume” is P2047
  if (clazz?.qid === "Q23397") {
    if (sortKey.includes("volume")) pid = "P2047";
    else if (sortKey.includes("area")) pid = "P2046";
  }

  // Special-case: mountains + “height” → use elevation (P2044) for usefulness
  if (clazz?.qid === "Q8502" && (sortKey === "height" || sortKey === "elevation")) {
    pid = "P2044";
  }

  return { classQid: clazz?.qid || null, pid };
}

// --- Build a SPARQL that returns label, numeric value, and English Wikipedia URL --- //
function buildSparql({ classQid, pid, limit }) {
  // Only return items that have the property ?val
  // Pull the enwiki article via the schema:about trick
  return `
SELECT ?item ?itemLabel ?article ?val WHERE {
  ?item wdt:P31/wdt:P279* wd:${classQid} .
  ?item wdt:${pid} ?val .
  OPTIONAL {
    ?article schema:about ?item ;
             schema:inLanguage "en" ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?val)
LIMIT ${limit}
`.trim();
}

// --- Fetch from Wikidata Query Service --- //
async function runSparql(query) {
  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      "Accept": "application/sparql-results+json",
      "Content-Type": "application/sparql-query",
      "User-Agent": "WizzLists/1.0 (https://wizzlists.com; contact@yourmail.com)"
    },
    body: query
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Real implementation: Wikipedia/Wikidata first --- //
async function generateWithWikipediaFirst({ subject, length, sortKey }) {
  const { classQid, pid } = mapSubjectAndProperty(subject, sortKey);

  // If we can’t map the subject/property, signal GPT fallback
  if (!classQid || !pid) {
    return { items: [], needGPT: [], filledBy: "gpt_fallback_needed" };
  }

  // Ask for a little more than needed (helps if some rows lack enwiki)
  const limit = Math.min(Math.max(length * 2, length + 3), 50);
  const query = buildSparql({ classQid, pid, limit });

  const data = await runSparql(query);
  if (!data?.results?.bindings?.length) {
    return { items: [], needGPT: [], filledBy: "gpt_fallback_needed" };
  }

  // Normalize rows → items your frontend already understands
  // We’ll render numeric values as human-friendly (meters, km², etc.) when obvious.
  const formatVal = (num, pid) => {
    const v = Number(num);
    if (!Number.isFinite(v)) return null;
    if (pid === "P2044" || pid === "P2048") return `${Math.round(v)} m`;    // elevation/height
    if (pid === "P2046") return `${Math.round(v)} m²`;                      // area (raw unit varies; refine later)
    if (pid === "P1082") return `${Math.round(v).toLocaleString()}`;        // population
    if (pid === "P2047") return `${Math.round(v)} m³`;                      // volume (often m³; sometimes km³ — refine later)
    return String(v);
  };

  const itemsRaw = data.results.bindings.map(b => {
    const name = b.itemLabel?.value || "";
    const url = b.article?.value || null;
    const val = b.val?.value ?? null;

    return {
      name,
      attr: formatVal(val, pid), // your existing code sorts on .attr for custom sorts
      url
    };
  });

  // Keep those that have a name; take top “length”
  let items = itemsRaw.filter(x => x.name).slice(0, length);

  // If we’re missing some numeric attrs, mark for GPT patch (rare here, but keep the contract)
  const needGPT = items.filter(i => !i.attr).map(i => ({ name: i.name }));

  return {
    items,
    needGPT,
    filledBy: "wikipedia_first"
  };
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
- If real data is unavailable, fabricate a plausible but reasonable value that fits the subject.
- Mark fabricated values with tier: "fabricated".
- Confidence must be between 0 and 1 (observed > derived > imputed > fabricated).
- Exactly ${N} items. Use a stable approach with seed=${seed}.
Subject: "${subject}"
Sort by: "${sortKey}"
  `.trim();

  if (!process.env.OPENAI_API_KEY) throw new Error("NO_OPENAI_KEY");

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
    throw new Error(`OPENAI_FAIL ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "";

  // Try parse once, then self-heal if needed
  try {
    return JSON.parse(text);
  } catch {
    const fixResp = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });
    const fixData = await fixResp.json();
    const fixed = fixData?.choices?.[0]?.message?.content || "{}";
    return JSON.parse(fixed);
  }
}

async function fillBlanksWithGPT(missingItems, sortKey) {
  if (!process.env.OPENAI_API_KEY) return [];
  const prompt = `
Fill in the missing "${sortKey}" values for these entities.
Return JSON array: [{ "title": ..., "${sortKey}": number or null }]
If no reliable data exists, return null.
Entities:
${missingItems.map(x => `- ${x.name || x.title}`).join("\n")}
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
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

// 4) API Handler
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST with JSON body." });
    }

    // Safe body parse
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
        // No Wikipedia data → AI full generation (your original path)
        try {
          out = await generateViaAI({ subject, sortKey, N, seed });
        } catch (e) {
          console.error("AI path error:", e?.message || e);
          out = null;
        }
      } else {
        // We have some data from Wikipedia
        let items = wikiResult.items;

        if (wikiResult.needGPT?.length) {
          const patched = await fillBlanksWithGPT(wikiResult.needGPT, sortKey);
          items = items.map(item => {
            const found = patched.find(p => (p.title || p.name) === (item.title || item.name));
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

    // --- FALLBACK FABRICATE (never 500) ---
    if (!out || !Array.isArray(out.items)) {
      const items = Array.from({ length: N }, (_, i) => ({
        name: `${subject || "Item"} ${i + 1}`,
        ...(BASIC_SORTS.includes(sortKey) ? {} : { attr: `${sortKey} (fallback)`, tier: "fabricated", confidence: 0.2 })
      }));
      out = {
        items,
        meta: {
          subject,
          sort_requested: sortKey,
          sort_used: sortKey,
          length: items.length,
          sources: [],
          notes: ["AI/Wiki unavailable — fallback list"],
          version: "v1"
        }
      };
    } else {
      // Normalize & sort like before
      out.items = out.items.slice(0, N);

      if (BASIC_SORTS.includes(sortKey)) {
        out.items = out.items.map(({ attr, tier, confidence, ...rest }) => rest);
        out.meta = out.meta || {};
        out.meta.notes = [...(out.meta.notes || []), "Attribute omitted for basic sort."];
      }

      if (BASIC_SORTS.includes(sortKey)) {
        if (sortKey === "alphabetical") out.items = sortAlphabetical(out.items);
        else if (sortKey === "random") out.items = seededShuffle(out.items, seed);
        // chronological: left as-is
      } else {
        const parseNum = (val) => {
          if (!val) return NaN;
          const m = String(val).match(/[\d\.]+/);
          return m ? parseFloat(m[0]) : NaN;
        };
        out.items.sort((a, b) => parseNum(b.attr ?? b[sortKey]) - parseNum(a.attr ?? a[sortKey]));
      }
      out.meta = {
        subject,
        sort_requested: sortKey,
        sort_used: sortKey,
        length: out.items.length,
        sources: Array.isArray(out?.meta?.sources) ? out.meta.sources : (out.meta?.sources ? [out.meta.sources] : []),
        notes: Array.isArray(out?.meta?.notes) ? out.meta.notes : (out.meta?.notes ? [out.meta.notes] : []),
        version: "v1"
      };
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error("TOP-LEVEL ERROR:", e?.stack || e);
    return res.status(500).json({ error: "Server error", detail: String(e).slice(0, 500) });
  }
}
