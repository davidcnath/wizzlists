import express from "express";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import registerGenerate from "../api/generate.js";
import registerSort from "../api/sort.js";
import registerSuggestSort from "../api/suggest-sort.js";
import registerHealth from "../api/health.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

// Static frontend
app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

// API routes
registerGenerate(app);
registerSort(app);
registerSuggestSort(app);
registerHealth(app);

// Fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`WizzLists dev server on http://localhost:${PORT}`);
});
