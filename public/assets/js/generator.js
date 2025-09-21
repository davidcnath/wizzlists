let currentGenSource = null;
let currentSortSource = null;

const qs = (s) => document.querySelector(s);
const listEl = qs("#list");
const promptEl = qs("#prompt");
const controlsEl = qs("#controls");
const sortAreaEl = qs("#sort-area");
const chipsEl = qs("#chips");
const confWrapEl = qs("#confidence-wrap");
const confBarEl = qs("#confidence");

let state = {
  topic: "",
  mode: "fast",
  limit: 10,
  items: [],
};

function resetUI() {
  listEl.innerHTML = "";
  chipsEl.innerHTML = "";
  confBarEl.style.width = "0%";
  promptEl.classList.remove("hidden");
  controlsEl.classList.add("hidden");
  sortAreaEl.classList.add("hidden");
  confWrapEl.classList.add("hidden");
}

function renderItem(item) {
  const li = document.createElement("li");
  li.id = `item-${item.id}`;
  li.innerHTML = `
    <strong>${item.title}</strong>
    <small>${item.blurb || ""}</small>
  `;
  listEl.appendChild(li);
}

function reorderList(orderIds) {
  const map = new Map(state.items.map(i => [i.id, i]));
  state.items = orderIds.map(id => map.get(id)).filter(Boolean);
  listEl.innerHTML = "";
  state.items.forEach(renderItem);
}

function fetchSuggestions() {
  return fetch("/api/suggest-sort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: state.topic, sampleTitles: state.items.slice(0,5).map(i=>i.title) })
  }).then(r => r.json());
}

function setChips(suggestions) {
  chipsEl.innerHTML = "";
  suggestions.forEach(s => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = s.label;
    b.onclick = () => startSort(s.key);
    chipsEl.appendChild(b);
  });
}

function startGenerate() {
  // Close existing streams
  currentGenSource?.close();
  currentSortSource?.close();

  const url = `/api/generate?topic=${encodeURIComponent(state.topic)}&limit=${state.limit}&mode=${state.mode}`;
  const es = new EventSource(url);
  currentGenSource = es;

  promptEl.classList.add("hidden");
  controlsEl.classList.remove("hidden");

  es.addEventListener("item", (e) => {
    const item = JSON.parse(e.data);
    state.items.push(item);
    renderItem(item);
  });

  es.addEventListener("done", async () => {
    es.close();
    // Show sort area & fetch suggestions
    sortAreaEl.classList.remove("hidden");
    const sugs = await fetchSuggestions();
    setChips(sugs);
  });

  es.addEventListener("error", () => es.close());
}

function startSort(criterion) {
  // Close any previous sort stream
  currentSortSource?.close();

  confWrapEl.classList.remove("hidden");
  confBarEl.style.width = "0%";

  const es = new EventSourcePolyfill("/api/sort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ items: state.items, criterion, mode: state.mode })
  });
  currentSortSource = es;

  es.addEventListener("rank", (e) => {
    const { order } = JSON.parse(e.data);
    reorderList(order);
  });

  es.addEventListener("confidence", (e) => {
    const { value } = JSON.parse(e.data);
    const clamped = Math.max(0, Math.min(100, value));
    confBarEl.style.width = clamped + "%";
  });

  es.addEventListener("done", () => es.close());
  es.addEventListener("error", () => es.close());
}

// Minimal polyfill to POST with SSE
class EventSourcePolyfill {
  constructor(url, { method = "GET", headers = {}, payload = undefined } = {}) {
    this.controller = new AbortController();
    this.listeners = new Map();
    this.closed = false;

    fetch(url, {
      method,
      headers: { Accept: "text/event-stream", ...headers },
      body: payload,
      signal: this.controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error("SSE connection failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = parseSSE(chunk);
          if (ev && this.listeners.has(ev.event)) {
            this.listeners.get(ev.event).forEach((fn) => fn({ data: ev.data }));
          }
        }
      }
    }).catch(() => {
      if (this.listeners.has("error")) this.listeners.get("error").forEach((fn) => fn(new Event("error")));
    });
  }
  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
  }
}
function parseSSE(chunk) {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trim();
  }
  try { return { event, data: data ? JSON.parse(data) : null }; }
  catch { return { event, data }; }
}

// Hook up UI
document.getElementById("topic-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.topic = String(document.getElementById("topic-input").value || "").trim();
  state.mode = document.getElementById("mode").value;
  state.limit = 10;
  state.items = [];
  listEl.innerHTML = "";
  if (!state.topic) return;
  startGenerate();
});

document.getElementById("more").addEventListener("click", () => {
  if (state.items.length >= 20) return;
  state.limit = Math.min(20, state.limit + 10);
  startGenerate(); // re-run; mock re-streams items and adds more
});

document.getElementById("restart").addEventListener("click", () => {
  currentGenSource?.close();
  currentSortSource?.close();
  state = { topic: "", mode: "fast", limit: 10, items: [] };
  resetUI();
});

// Custom sort form
document.getElementById("custom-sort-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const key = String(document.getElementById("custom-sort").value || "").trim();
  if (!key) return;
  startSort(key);
});

// Initial state
resetUI();
