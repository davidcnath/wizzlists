export default function registerSuggestSort(app) {
  app.post("/api/suggest-sort", (req, res) => {
    const { topic } = req.body || {};
    const t = String(topic || "").toLowerCase();

    // Very light heuristic just for the mock:
    let safe1 = { label: "alphabetical", key: "name", expectedType: "text", rationale: "Always available." };
    let safe2 = { label: "year", key: "year", expectedType: "date", rationale: "Common across many topics." };
    let quirky = { label: "popularity", key: "popularity", expectedType: "number", rationale: "Fun proxy metric." };

    if (t.includes("mountain")) {
      safe1 = { label: "height", key: "elevation_m", expectedType: "number", rationale: "Widely documented in infoboxes." };
      safe2 = { label: "prominence", key: "prominence_m", expectedType: "number", rationale: "Common secondary metric." };
      quirky = { label: "climbing difficulty", key: "difficulty", expectedType: "text", rationale: "Playful estimate." };
    } else if (t.includes("actor") || t.includes("cast")) {
      safe1 = { label: "birth year", key: "birth_year", expectedType: "date", rationale: "Biographical infobox." };
      safe2 = { label: "awards", key: "awards_count", expectedType: "number", rationale: "Often listed on Wikipedia." };
      quirky = { label: "screen time", key: "screen_time", expectedType: "number", rationale: "Playful/estimated." };
    } else if (t.includes("lake")) {
      safe1 = { label: "area", key: "area_km2", expectedType: "number", rationale: "List tables / infobox." };
      safe2 = { label: "max depth", key: "max_depth_m", expectedType: "number", rationale: "Often available." };
      quirky = { label: "clarity", key: "clarity", expectedType: "text", rationale: "Playful." };
    }

    res.json([safe1, safe2, quirky]);
  });
}
