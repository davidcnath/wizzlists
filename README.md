# wizzlists
My list generator MVP


├─ README.md
├─ .gitignore
├─ .env.example                 # API keys, config (never commit real .env)
├─ package.json
│
├─ public/                      # Static frontend (served as-is)
│  ├─ index.html                # Single screen UI
│  └─ assets/
│     ├─ css/styles.css
│     └─ js/
│        ├─ generator.js        # SUPER-thin: calls /api endpoints, updates UI
│        └─ ui/                 # (optional) tiny UI helpers/components
│           ├─ list.js
│           └─ sortBar.js
│
├─ api/                         # Backend routes (Node/Express or serverless)
│  ├─ generate.js               # MAIN: topic → items (streams if you want)
│  ├─ suggest-sort.js           # 3 tailored sort suggestions
│  ├─ sort.js                   # Sort existing items by criterion (streams updates)
│  └─ health.js                 # Ping for uptime checks
│
├─ src/                         # All logic lives here (imported by /api/*)
│  ├─ pipeline/
│  │  ├─ runPipeline.js         # Orchestrates the 4 steps
│  │  ├─ step.gptQueries.js     # 1) GPT → wiki queries
│  │  ├─ step.wikiFetch.js      # 2) Wikipedia fetch (fast, parallel, capped)
│  │  ├─ step.gptStructure.js   # 3) GPT → normalized JSON list
│  │  └─ step.gptFillBlanks.js  # 4) (optional) fill missing values
│  │
│  ├─ services/
│  │  ├─ wikipedia.js           # REST helpers (search, page extracts, pageviews)
│  │  ├─ openai.js              # OpenAI client + JSON-mode helpers
│  │  └─ cache.js               # LRU or in-memory cache wrapper
│  │
│  ├─ logic/
│  │  ├─ interestingPick.js     # popularity + diversity pick for “not obscure”
│  │  ├─ suggestSort.js         # 2 safe + 1 quirky attribute suggestions
│  │  ├─ fetchAttribute.js      # get attribute for item (wiki-first, then GPT)
│  │  ├─ rankAndSort.js         # sorts list given key + tie-breakers
│  │  └─ confidence.js          # roll-up 0–100 confidence score
│  │
│  ├─ utils/
│  │  ├─ normalize.js           # units, dates, numbers
│  │  ├─ text.js                # tiny parsers, truncation, slugs
│  │  ├─ errors.js              # error types & safe messages
│  │  ├─ timers.js              # timeouts, abort controllers, concurrency
│  │  └─ schema.js              # zod/valibot schemas (optional)
│  │
│  └─ types/
│     └─ index.d.ts             # (optional) JSDoc/TS types for ListItem, etc.
│
├─ scripts/                     # Dev/ops helpers (optional)
│  └─ start-server.mjs
│
└─ test/                        # (optional) unit/integration tests
   ├─ pipeline.test.js
   └─ services.test.js
