# Testerkin — Discovery Agent v0.1
## Technical Documentation

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [How It Works — The Pipeline](#2-how-it-works--the-pipeline)
3. [Project Structure](#3-project-structure)
4. [File-by-File Breakdown](#4-file-by-file-breakdown)
5. [Data Schemas](#5-data-schemas)
6. [How to Run](#6-how-to-run)
7. [The Review UI](#7-the-review-ui)
8. [Configuration Reference](#8-configuration-reference)
9. [pgvector Integration](#9-pgvector-integration)
10. [Known Limitations and Next Steps](#10-known-limitations-and-next-steps)

---

## 1. What This Is

The Testerkin Discovery Agent is a command-line tool that takes a URL, crawls the web application at that URL using a real browser, and uses Claude (Anthropic's AI) to infer what user flows exist in the application — without any documentation, source code, or domain knowledge.

The output is a structured JSON file listing the discovered flows. A companion browser-based UI lets a human reviewer read through each flow and mark it as approved or rejected before it is used downstream.

**The core idea:** treat any web app as a black box. Observe what pages exist, what buttons and inputs are on each page, and what links connect them. Hand that raw observation data to an AI model and ask it to reason about what users are doing.

This is the first working component of Testerkin, a larger tool for automated test generation. The discovery agent's output (the `InferredFlow` schema) is designed to feed directly into the next stage — test case generation.

---

## 2. How It Works — The Pipeline

The agent runs in two sequential steps:

```
Target URL
    │
    ▼
┌─────────────────────────────┐
│  Step 1: PlaywrightCrawler  │
│                             │
│  Launches a real Chromium   │
│  browser. Visits pages via  │
│  BFS. On each page, reads   │
│  all buttons, inputs,       │
│  links, headings, and the   │
│  page title. Stores these   │
│  as PageObservation objects.│
└────────────┬────────────────┘
             │  Array of PageObservation[]
             ▼
┌─────────────────────────────┐
│  Step 2: FlowInferencer     │
│                             │
│  Formats all observations   │
│  into a structured text     │
│  prompt. Sends to Claude    │
│  Sonnet via the Anthropic   │
│  API. Parses the response   │
│  into InferredFlow objects. │
└────────────┬────────────────┘
             │  DiscoverySession (JSON)
             ▼
        output/flows.json
             │
             ▼
     ui/review.html
  (open in browser manually)
```

**Why two steps?**

The crawler and the inferencer are deliberately decoupled. The crawler is a dumb data collector — it does not make any decisions about what the data means. The inferencer does all the reasoning, but it never touches a browser. This separation makes each component easy to test and replace independently.

---

## 3. Project Structure

```
testerkin-discovery/
│
├── src/
│   ├── index.ts                         Entry point — wires crawler + inferencer, writes output
│   │
│   ├── schema/
│   │   └── inferred-flow.ts             All TypeScript interfaces and types used across the project
│   │
│   ├── crawler/
│   │   └── playwright-crawler.ts        Playwright-based BFS web crawler
│   │
│   ├── inference/
│   │   └── flow-inferencer.ts           Claude API integration — converts observations to flows
│   │
│   ├── skills/
│   │   └── skill-loader.ts              Loads skill .md files for inferencer prompt injection
│   │
│   ├── embeddings/
│   │   ├── embedding-client.ts          OpenAI embeddings wrapper
│   │   ├── flow-deduplicator.ts         Similarity search: dedup + delta detection
│   │   └── skill-matcher.ts             Auto skill selection from skill_embeddings table
│   │
│   └── db/
│       ├── client.ts                    pg Pool singleton with pgvector registration
│       ├── migrate.ts                   Runs migration SQL on startup
│       ├── seed-skills.ts               Seeds skill_embeddings from skills/ directory
│       ├── migrations/
│       │   └── 001_initial.sql          Full schema including pgvector tables
│       └── repositories/
│           ├── runs.repository.ts
│           ├── observations.repository.ts
│           ├── flows.repository.ts
│           └── embeddings.repository.ts
│
├── skills/
│   ├── apps/
│   │   ├── ecommerce.md                 Skill for ecommerce apps (SauceDemo, AutomationExercise)
│   │   └── form-practice.md             Skill for form/widget demo apps (DemoQA)
│   └── patterns/
│       └── crud-flows.md                Reusable CRUD pattern skill (stackable with app skills)
│
├── ui/
│   └── review.html                      Standalone browser UI for reviewing output
│
├── output/                              Created at runtime — gitignored
│   ├── observations.json                Raw crawl output (persisted for SKIP_CRAWL reruns)
│   └── flows.json                       Inferred flows output
│
├── CLAUDE.md                            Persistent Cursor/Claude Code context
├── SETUP.md                             Setup guide — pgvector, Docker, env config
├── TECHNICAL_DOC.md                     This file
├── PROMPT.md                            Master Cursor Composer scaffold prompt
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 4. File-by-File Breakdown

### 4.1 `src/schema/inferred-flow.ts`

**Purpose:** Single source of truth for all data types in the project. Both the crawler and the inferencer import from here.

**Types defined:**

| Type | Description |
|---|---|
| `FlowAction` | Union type for the six action types a step can have: `navigate`, `click`, `fill`, `select`, `observe`, `submit` |
| `FlowStatus` | Union type for review status: `pending`, `approved`, `rejected` |
| `FlowDeltaClassification` | Union type for delta detection: `duplicate`, `modified`, `new`, `deleted` |
| `FlowStep` | A single step within a flow — has an order number, action type, plain-English description, the URL it happens on, and optional element name and value |
| `InferredFlow` | The main output object. Represents one complete user flow with name, description, confidence score, category, actors, steps, entry/exit URLs, and review status |
| `PageObservation` | The raw data collected from a single page visit — URL, title, timestamp, headings, navigation path, and a list of interactable elements |
| `InteractableElement` | A single button/input/link/select observed on a page |
| `DiscoverySession` | The top-level output object written to `flows.json` — wraps all flows along with session metadata |
| `FlowDeltaResult` | Result of comparing a flow against stored embeddings — classification + similarity score |

Nothing in this file contains logic. It is purely type definitions.

---

### 4.2 `src/crawler/playwright-crawler.ts`

**Purpose:** Crawl a web application and return one `PageObservation` per page visited.

**How crawling works:**

The crawler uses a Breadth-First Search (BFS) queue. It starts at the `startUrl`, visits that page, collects all `<a href>` links on the page, adds them to the queue, then processes the next URL in the queue. This continues until either the queue is empty or `maxPages` is reached.

On each page visit, it calls `observePage()`, which runs two Playwright `evaluate()` calls inside the browser to read the live DOM:

- **Elements:** queries for `a[href]`, `button`, `[role="button"]`, `[type="submit"]`, `input`, `textarea`, `select` — captures text, href, placeholder, input type, and name attributes. Capped at 60 elements per page.
- **Headings:** queries for `h1, h2, h3, h4` — captures their text content. Capped at 10.

**Key behaviours:**

- **Same-origin only.** The crawler checks that every URL shares the same origin (protocol + domain + port) as the `startUrl`. It will not follow links to external domains.
- **Fragment stripping.** `https://example.com/page#section` and `https://example.com/page` are treated as the same URL. The fragment is stripped before adding to the queue.
- **SPA settle delay.** After `page.goto()` resolves with `networkidle`, the crawler waits an additional 500ms. This handles SPAs that do final DOM manipulation after the network goes idle.
- **Auth hook.** The constructor accepts an optional `onBeforeCrawl` function. If provided, this is called once with the Playwright `Page` object before the BFS loop starts. This is where login logic goes for apps that require authentication.
- **Error tolerance.** If a page fails to load (timeout, 404, etc.), the error is caught and logged as a warning. The crawler skips that URL and continues.
- **Session persistence.** After crawling completes, `PageObservation[]` is written to `output/observations.json`. Set `SKIP_CRAWL=true` to reload from disk and skip the browser entirely on subsequent runs.

**Configuration:**

| Option | Default | Effect |
|---|---|---|
| `startUrl` | required | Where crawling begins |
| `maxPages` | 15 | Stop after visiting this many pages |
| `headless` | `true` | Set to `false` to watch the browser during crawl |
| `timeout` | 15000 | Milliseconds to wait for each page to load |
| `onBeforeCrawl` | none | Optional async function called once before crawling starts |

---

### 4.3 `src/inference/flow-inferencer.ts`

**Purpose:** Take an array of `PageObservation` objects and call the Claude API to convert them into `InferredFlow` objects.

**How inference works:**

The `inferFlows()` method does the following:

1. Calls `formatObservations()` to convert the `PageObservation[]` array into a structured plain-text block. Each page is rendered as a section with its URL, title, headings, navigation breadcrumb, and a bullet list of its interactable elements. This is the text Claude will reason over.

2. Constructs a system prompt and a user prompt. The system prompt instructs Claude to act as a black-box QA analyst. If a skill file was loaded, its content is appended to the system prompt under an `## App-specific guidance` heading. The user prompt contains the formatted observation dump.

3. Sends both to `claude-sonnet-4-5` via the Anthropic SDK with `max_tokens: 4096`. The SDK reads `ANTHROPIC_API_KEY` from the environment automatically.

4. Parses the response. Claude is instructed to return only a raw JSON array with no markdown fences. The code strips any accidental fences before calling `JSON.parse()`. Retry logic fires up to 3 times with a 2-second delay between attempts if parsing fails or the API call throws. Every returned flow has its `status` forced to `"pending"` regardless of what Claude returned.

**System prompt (full text):**

```
You are an expert at analysing web application UI observations and identifying
distinct user flows. You will be given a list of page observations from a web
application crawl. Each observation contains a URL, page title, headings, and
a list of interactable elements.

Your task is to identify all distinct user flows visible in this application.
A user flow is a sequence of UI interactions that achieves a specific goal.

For each flow you identify, return:
- name: short descriptive name (e.g. "User Login", "Create New Record")
- description: one sentence describing what the user accomplishes
- category: one of [authentication, navigation, data-entry, data-management,
  search, checkout, settings, other]
- actor: the type of user performing the flow (e.g. "User", "Admin", "Guest")
- entryPoint: the URL or UI element where the flow begins
- steps: ordered array of steps, each with stepNumber, action, target,
  expectedOutcome
- exitPoint: the final state or URL after the flow completes
- confidence: float 0.0–1.0 based on evidence strength

Confidence guidance:
- 0.85+ : clear entry URL, clear exit URL, all steps have UI evidence
- 0.60–0.85 : steps inferred from element labels without URL confirmation
- below 0.60 : speculative — partial evidence only

Return ONLY a valid JSON array of flow objects. No markdown. No explanation.
No preamble. The response must start with [ and end with ].
```

If a skill file is loaded, this is appended to the system prompt:

```
## App-specific guidance
<contents of the skill .md file>
```

**User prompt:**

```
Here are the page observations from the crawl:

<observations formatted by formatObservations()>

Identify all distinct user flows.
```

**Prompt design decisions:**

- Claude is told to treat the app as a black box. It must not guess at flows that are not evidenced by the observations.
- The inferencer system prompt contains no domain-specific vocabulary. All domain context enters via skill files only.
- Actor inference is evidence-based only — if no role labels are visible in the UI, Claude defaults to "User".
- Confidence scoring is self-reported by Claude. A high score means the steps are unambiguous in the observations; a lower score means Claude is inferring from weaker signals.

**`formatObservations()` output format (example):**

```
── Page 1: "My App — Login" ──
URL: https://app.example.com/login
H-tags: Sign in to your account
Navigated via: direct
Elements:
  • [input] "email" (placeholder: "you@example.com")
  • [input] "password" (type: password)
  • [button] "Sign in"
  • [link] "Forgot your password?" → https://app.example.com/reset
```

This format is deliberately minimal and token-efficient. It gives Claude everything it needs to reason about user intent without sending full HTML.

---

### 4.4 `src/skills/skill-loader.ts`

**Purpose:** Load a skill `.md` file from disk and return its content as a plain string for injection into the inferencer system prompt.

If `SKILL_FILE` env var is set, that path is loaded directly. If the file does not exist, a warning is logged and an empty string is returned. If `SKILL_FILE` is not set, `skill-matcher.ts` is called instead to auto-select the closest skill from the database.

---

### 4.5 `src/embeddings/skill-matcher.ts`

**Purpose:** Automatically select the best matching skill file for a crawl without requiring `SKILL_FILE` to be set manually.

Takes the first 5 page observations, concatenates their titles, headings, and element text into a single string, embeds it using `embedding-client.ts`, and runs a cosine similarity search against `skill_embeddings`. Returns the closest match above similarity 0.5, or an empty string if nothing matches.

---

### 4.6 `src/embeddings/flow-deduplicator.ts`

**Purpose:** Compare newly inferred flows against all flows stored in previous runs and classify each one as `new`, `modified`, or `duplicate`.

After inference, each flow's name and description are embedded and compared against `flow_embeddings` in the database. The similarity threshold table:

| Cosine similarity | Classification |
|---|---|
| > 0.92 | `duplicate` — skip, no new test needed |
| 0.70–0.92 | `modified` — flag for test update |
| < 0.70 | `new` — generate new test case |

Results are logged to the terminal and returned as `FlowDeltaResult[]`.

---

### 4.7 `src/index.ts`

**Purpose:** Entry point. Reads configuration, runs the full pipeline, persists to database, and prints the terminal summary.

**Full pipeline order:**

1. Load `.env` via dotenv
2. Read and validate env vars
3. Run `db/migrate.ts` inline — migration runs before anything else
4. If `SKIP_CRAWL=false` → run `PlaywrightCrawler.crawl()` → write `output/observations.json`
5. If `SKIP_CRAWL=true` → read `output/observations.json` from disk
6. Determine skill: if `SKILL_FILE` set → `loadSkill()`, else → `skillMatcher.match()`
7. Run `FlowInferencer.inferFlows(observations, skillContent)`
8. Write `output/flows.json`
9. Persist: `discovery_runs`, `page_observations`, `inferred_flows` to DB
10. Embed each flow → store in `flow_embeddings`
11. Run `deduplicateFlows()` → log delta classifications
12. Print terminal summary

---

### 4.8 `ui/review.html`

**Purpose:** A standalone, zero-dependency HTML file for reviewing discovery output. No server required — open directly in a browser.

**How to use it:**

1. Open the file in a browser (`File → Open` or drag-drop onto a browser tab).
2. Drag `output/flows.json` onto the file picker, or click to browse.
3. The UI loads and displays all discovered flows in the left sidebar.
4. Click a flow to see its full detail in the right panel — description, badges, step-by-step timeline, confidence score.
5. Click `Approve` or `Reject` on each flow. These update the in-memory state.
6. Click `Export Approved` to download `approved-flows.json` containing only the flows you approved.

**UI features:**

- Filter tabs (All / Pending / Approved / Rejected) update the sidebar list.
- Live counters in the top bar show approved / rejected / pending totals.
- Reviewer notes can be typed and saved per flow.
- Step timeline is colour-coded by action type (navigate = blue, click = green, fill = yellow, submit = red, observe = grey).
- All state is in-memory only. Refreshing the page resets everything — load the file again.

---

## 5. Data Schemas

### `DiscoverySession` — the top-level object written to `flows.json`

```json
{
  "id": "session-1716123456789",
  "targetUrl": "https://example.com",
  "appContext": "Optional one-line description of the app",
  "skillFile": "skills/apps/ecommerce.md",
  "startedAt": "2025-05-20T10:30:00.000Z",
  "completedAt": "2025-05-20T10:32:14.000Z",
  "pagesVisited": 13,
  "flows": [ ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique session ID — timestamp-based |
| `targetUrl` | string | The URL that was crawled |
| `appContext` | string | Value of `APP_CONTEXT` env var at run time |
| `skillFile` | string \| null | Path to the skill file used, or null if none |
| `startedAt` | ISO string | When the crawl began |
| `completedAt` | ISO string | When inference completed |
| `pagesVisited` | number | Total pages the crawler visited |
| `flows` | InferredFlow[] | All flows returned by the inferencer |

---

### `InferredFlow` — one discovered user flow

```json
{
  "id": "flow-add-to-cart",
  "name": "Add product to cart",
  "description": "User browses to a product page and clicks Add to Cart to place it in their shopping cart.",
  "confidence": 0.91,
  "category": "Shopping",
  "actors": ["User"],
  "steps": [
    {
      "order": 1,
      "action": "navigate",
      "description": "Open the product listing page",
      "url": "https://example.com/products",
      "element": null,
      "value": null
    },
    {
      "order": 2,
      "action": "click",
      "description": "Click on a product to open its detail page",
      "url": "https://example.com/products/item-123",
      "element": "Product title link",
      "value": null
    },
    {
      "order": 3,
      "action": "click",
      "description": "Click Add to Cart",
      "url": "https://example.com/products/item-123",
      "element": "Add to Cart button",
      "value": null
    }
  ],
  "entryUrl": "https://example.com/products",
  "exitUrl": "https://example.com/products/item-123",
  "status": "pending",
  "discoveredAt": "2025-05-20T10:31:44.000Z",
  "notes": null
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Flow identifier — slugified from name |
| `name` | string | Short descriptive name |
| `description` | string | One sentence describing user goal |
| `confidence` | number | 0.0–1.0, Claude's self-reported certainty |
| `category` | string | Open-ended label chosen by Claude |
| `actors` | string[] | User types involved (e.g. `["User"]`, `["Admin"]`) |
| `steps` | FlowStep[] | Ordered list of interaction steps |
| `entryUrl` | string | URL where the flow begins |
| `exitUrl` | string | URL or final state after flow completes |
| `status` | FlowStatus | `pending` \| `approved` \| `rejected` |
| `discoveredAt` | ISO string | Timestamp of this discovery run |
| `notes` | string \| null | Reviewer notes added in the UI |

---

### `FlowAction` values

| Value | Meaning |
|---|---|
| `navigate` | User or the app navigates to a new URL |
| `click` | User clicks a button or link |
| `fill` | User types into an input or textarea |
| `select` | User picks an option from a dropdown |
| `submit` | User submits a form |
| `observe` | User views something without interacting (read-only step) |

---

### `FlowDeltaResult` — output of deduplication

```json
{
  "flowId": "uuid",
  "flowName": "Add product to cart",
  "classification": "modified",
  "similarity": 0.84,
  "matchedRunId": "uuid-of-prior-run"
}
```

| Classification | Similarity range | Action |
|---|---|---|
| `duplicate` | > 0.92 | Skip — no new test needed |
| `modified` | 0.70–0.92 | Flag for test update |
| `new` | < 0.70 | Generate new test case |
| `deleted` | In store, absent this run | Retire existing test |

---

## 6. How to Run

See `SETUP.md` for full first-time setup instructions including pgvector, Docker, and environment configuration.

### Quick start (after setup is complete)

```bash
# Run against TodoMVC — no auth, no skill needed
npm run discover:todomvc

# Run against SauceDemo with ecommerce skill
npm run discover:saucedemo

# Run against DemoQA with form-practice skill
npm run discover:demoqa

# Run against The Internet — automation practice ground truth
npm run discover:theinternet
```

### Re-run inference without re-crawling

```bash
npm run infer:only
```

Reads from `output/observations.json`. Playwright is not launched.
Use this when tuning skill files or the inferencer prompt.

### Watch the browser crawl in real time

```bash
HEADLESS=false npm run discover:saucedemo
```

### Run against a custom app

```bash
TARGET_URL=https://your-app.com \
APP_CONTEXT="One sentence describing the app" \
SKILL_FILE=skills/apps/ecommerce.md \
MAX_PAGES=20 \
npm run discover
```

### Run against an authenticated app

1. Open `src/index.ts`
2. Uncomment the `AUTH_HOOK` block near the top
3. Fill in the CSS selectors for the login form
4. Uncomment `onBeforeCrawl: AUTH_HOOK` in the `PlaywrightCrawler` constructor
5. Run:

```bash
TARGET_URL=https://your-app.com \
LOGIN_URL=https://your-app.com/login \
APP_EMAIL=you@example.com \
APP_PASSWORD=yourpassword \
npm run discover
```

### Review the output

```bash
open ui/review.html       # macOS
xdg-open ui/review.html   # Linux
```

Load `output/flows.json`, approve or reject each flow, then click `Export Approved`
to download `approved-flows.json`.

---

## 7. The Review UI

The UI is the human-in-the-loop gate before any discovered flow is used downstream.

### Why manual review?

The inferencer's output quality depends on how much the observed pages reveal about the app's intent. Some flows will be clearly evidenced and should be approved immediately. Others may be speculative (low confidence score) or flat-out wrong if a page had ambiguous labels. The review step ensures that only validated flows move forward.

### Workflow

```
Load flows.json
      │
      ▼
Browse sidebar (All / Pending / Approved / Rejected)
      │
      ▼
Click a flow to open its detail panel
      │
      ├── Read the description and step timeline
      ├── Check the confidence score
      ├── Check the delta classification (new / modified / duplicate)
      ├── Add notes if needed
      │
      ▼
Click Approve or Reject
      │
      ▼  (repeat for all flows)
      │
      ▼
Click "Export Approved"
      │
      ▼
approved-flows.json  ←── This is the output for the next stage
```

### What the confidence score means

| Score | Interpretation |
|---|---|
| 0.85–1.00 | Steps were directly evidenced — buttons, inputs, and URLs all align clearly |
| 0.60–0.84 | Some inference required — partial signals, similar-looking elements |
| Below 0.60 | Speculative — review carefully before approving |

Low confidence does not mean the flow is wrong. It means Claude had limited evidence.
A human reviewer may recognise the flow immediately and approve it regardless.

---

## 8. Configuration Reference

All configuration is via environment variables. No code changes are needed for basic usage.

| Variable | Default | Description |
|---|---|---|
| `TARGET_URL` | `https://demo.playwright.dev/todomvc/` | The URL to start crawling from |
| `APP_CONTEXT` | _(empty)_ | Optional one-sentence description passed to the inferencer |
| `SKILL_FILE` | _(empty)_ | Path to a skill `.md` file. If unset, auto-matched via pgvector |
| `SKIP_CRAWL` | `false` | Skip Playwright, reload from `output/observations.json` |
| `MAX_PAGES` | `15` | Maximum number of pages to crawl |
| `HEADLESS` | `true` | Set to `false` to see the browser window during crawl |
| `OUTPUT_FILE` | `output/flows.json` | File path for the session JSON output |
| `ANTHROPIC_API_KEY` | _(required)_ | Anthropic API key — read automatically by the SDK |
| `OPENAI_API_KEY` | _(required)_ | OpenAI API key — used for embeddings only |
| `DATABASE_URL` | _(required)_ | PostgreSQL connection string |
| `LOGIN_URL` | _(auth hook)_ | Login page URL for authenticated app runs |
| `APP_EMAIL` | _(auth hook)_ | Email/username for login |
| `APP_PASSWORD` | _(auth hook)_ | Password for login |

---

## 9. pgvector Integration

The discovery agent uses PostgreSQL with the pgvector extension for three purposes:
flow deduplication across runs, automatic skill file selection, and cross-run
delta detection. See `SETUP.md` for full installation instructions.

### Database tables

| Table | Purpose |
|---|---|
| `discovery_runs` | One row per crawl session — session anchor for all other tables |
| `page_observations` | Raw crawl output stored as JSONB — enables `SKIP_CRAWL` reruns |
| `inferred_flows` | Claude's output — flows with status tracking |
| `flow_embeddings` | `vector(1536)` embeddings of each flow — dedup and delta detection |
| `skill_embeddings` | `vector(1536)` embeddings of each skill file — auto skill selection |

### How auto skill selection works

At the start of each run (when `SKILL_FILE` is not set):
1. First 5 page observations are concatenated into a single text block
2. That block is embedded using `text-embedding-3-small`
3. Cosine similarity search runs against `skill_embeddings`
4. The closest match above similarity 0.5 is loaded as the skill
5. If nothing matches, inference runs with no skill (generic mode)

Re-seed the skill table whenever you add or update a skill file:
```bash
npm run db:seed:skills
```

### Delta classification thresholds

| Cosine similarity | Classification | Downstream action |
|---|---|---|
| > 0.92 | Duplicate | No new test needed |
| 0.70–0.92 | Modified | Existing test flagged for update |
| < 0.70 | New | New test case generated |
| Present in store, absent this run | Deleted | Existing test retired |

---

## 10. Known Limitations and Next Steps

### Current limitations

**Single-page state is not captured.** The crawler reads the DOM state of each page as it first loads. Flows that only become visible after user interaction (e.g., a modal that opens after clicking a button, a form that appears after a toggle) will not be fully observed. This is the most impactful limitation for SPA-heavy apps — TodoMVC being the primary example.

**JavaScript-heavy navigation.** Some SPAs update the view without changing the URL. The crawler tracks URLs to avoid revisiting pages, which means if two different views share a URL, only the first state is observed.

**Auth sessions.** The auth hook is a simple template. Complex auth flows (MFA, OAuth redirects, CAPTCHA) require additional implementation in the hook.

**One API call for all observations.** All page observations are sent to Claude in a single prompt. For large crawls (30+ pages), the prompt can become very long. There is no chunking or summarisation logic yet.

### Natural next steps

- **Interaction-based observation.** Extend the crawler to click buttons and observe the resulting DOM changes, not just the static page state.
- **Chunked inference.** For large apps, split observations across multiple Claude calls and merge the results.
- **Element clustering.** Embed each `InteractableElement` and cluster them by semantic similarity before sending to Claude — reduces inferencer reasoning load and improves step sequencing quality.
- **Test case generation.** The `InferredFlow` and `FlowStep` schema is designed to be consumed directly by a test case generator that converts each flow into executable Playwright test code.