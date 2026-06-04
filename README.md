# TesterKin Discovery Agent

A standalone TypeScript module that autonomously crawls a web application, infers user flows using Claude AI, and persists results in PostgreSQL with pgvector embeddings for deduplication and delta detection.

Part of the **TesterKin 2.0** multi-agent platform. The approved flows output feeds directly into the downstream Test Case Generator (Agent 3).

---

## How It Works

```
Target URL
    │
    ▼
┌─────────────────────────────┐
│  Step 1: PlaywrightCrawler  │   BFS crawl — records interactable
│  (dumb collector)           │   elements, headings, links per page
└────────────┬────────────────┘
             │  PageObservation[]  ──►  output/observations.json
             ▼
┌─────────────────────────────┐
│  Step 2: FlowInferencer     │   Sends observations to Claude
│  (smart reasoner)           │   Sonnet — returns InferredFlow[]
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Step 3: Persist + Embed    │   PostgreSQL + pgvector
│                             │   Dedup / delta detection
└────────────┬────────────────┘
             │
             ▼
      ui/review.html
  (HITL review — open in browser)
```

**Two hard rules that never change:**

- **The crawler is dumb.** It collects interactable elements and makes zero inferences. It never calls Claude.
- **The inferencer never touches a browser.** It receives `PageObservation[]` and returns `InferredFlow[]`. No Playwright imports.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (ESM), Node.js 18+ |
| Crawling | Playwright (Chromium, BFS) |
| Flow inference | Anthropic SDK — `claude-sonnet-4-5` |
| Embeddings | Google Generative AI — `gemini-embedding-2` (3072-dim vectors) |
| Database | PostgreSQL 13+ with pgvector extension |
| DB client | `pg` (node-postgres) + `pgvector` npm package |
| Runner | `ts-node` (ESM loader) |

---

## Project Structure

```
testerkin-discovery/
├── src/
│   ├── index.ts                          Orchestrator entry point
│   ├── schema/
│   │   └── inferred-flow.ts             All TypeScript types (source of truth)
│   ├── crawler/
│   │   └── playwright-crawler.ts        BFS Playwright crawler
│   ├── inference/
│   │   └── flow-inferencer.ts           Claude API — observations → flows
│   ├── skills/
│   │   └── skill-loader.ts              Loads skill .md files for prompt injection
│   ├── embeddings/
│   │   ├── embedding-client.ts          Gemini embeddings wrapper
│   │   ├── flow-deduplicator.ts         Delta detection (new / modified / duplicate)
│   │   └── skill-matcher.ts             Auto skill selection via pgvector cosine search
│   └── db/
│       ├── client.ts                    pg Pool singleton with pgvector registration
│       ├── migrate.ts                   Runs migration SQL
│       ├── seed-skills.ts               Seeds skill_embeddings table
│       ├── migrations/
│       │   └── 001_initial.sql          Full schema — 5 tables + HNSW indexes
│       └── repositories/
│           ├── runs.repository.ts
│           ├── observations.repository.ts
│           ├── flows.repository.ts
│           └── embeddings.repository.ts
├── skills/
│   ├── apps/
│   │   ├── ecommerce.md                 Skill for ecommerce apps
│   │   └── form-practice.md             Skill for form/widget demo apps
│   └── patterns/
│       └── crud-flows.md                Reusable CRUD pattern skill
├── ui/
│   └── review.html                      Static HITL review UI (no server needed)
├── output/                              Created at runtime — gitignored
│   ├── observations.json
│   └── flows.json
├── .env.example
├── package.json
├── tsconfig.json
├── SETUP.md                             Detailed first-time setup guide
└── TECHNICAL_DOC.md                     Full architecture specification
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| PostgreSQL + pgvector | 13+ |
| Anthropic API key | — |
| Google Gemini API key | — |

---

## Setup

### 1. Start a pgvector-enabled PostgreSQL instance

**Option A — Docker (recommended)**

```bash
docker run -d \
  --name testerkin-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testerkin_discovery \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**Option B — Supabase (no Docker)**

Create a free project at [supabase.com](https://supabase.com). pgvector is enabled by default. Copy the connection string from Project Settings → Database → URI.

See `SETUP.md` for more options including manual pgvector installation.

### 2. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
TARGET_URL=https://www.saucedemo.com
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/testerkin_discovery

# Optional
APP_CONTEXT=Ecommerce demo app with login, product browsing, and cart checkout
SKILL_FILE=skills/apps/ecommerce.md
SKIP_CRAWL=false
MAX_PAGES=15
```

### 4. Run database migration

```bash
npm run db:migrate
```

Creates all 5 tables and HNSW indexes. Expected output:

```
→ Running migration...
✓ Migration complete
```

### 5. Seed skill embeddings

```bash
npm run db:seed:skills
```

Embeds all skill files in `skills/` and stores them in `skill_embeddings` for auto-matching.

---

## Running Discoveries

### Pre-configured targets

```bash
# TodoMVC — simplest app, no auth, no skill needed
npm run discover:todomvc

# SauceDemo — multi-page ecommerce with login gate
npm run discover:saucedemo

# DemoQA — form and widget components
npm run discover:demoqa

# The Internet — automation practice site
npm run discover:theinternet
```

### Custom target

```bash
TARGET_URL=https://your-app.com \
APP_CONTEXT="One sentence describing the app" \
SKILL_FILE=skills/apps/ecommerce.md \
MAX_PAGES=20 \
npm run discover
```

### Re-run inference without re-crawling

```bash
npm run infer:only
```

Reads from `output/observations.json`. Playwright is not launched. Use this when tuning skill files or the inferencer prompt.

### Watch the browser in real time

```bash
HEADLESS=false npm run discover:saucedemo
```

### Expected terminal output

```
→ Crawling: https://demo.playwright.dev/todomvc/
✓ Crawl complete: 1 pages visited
→ No skill file — using generic inference
→ Sending 1 page observations to Claude...
✓ Inferred 3 flows
✓ Saved to output/flows.json
─────────────────────────────
TesterKin Discovery Complete
─────────────────────────────
Target:    https://demo.playwright.dev/todomvc/
Pages:     1
Flows:     3
New:       3
Modified:  0
Duplicate: 0
Output:    output/flows.json
─────────────────────────────
```

---

## Review UI

Open the standalone review UI in a browser — no server required:

```bash
open ui/review.html       # macOS
xdg-open ui/review.html   # Linux
```

1. Click "Load flows.json" and navigate to `output/flows.json`
2. Browse discovered flows in the sidebar (filter: All / Pending / Approved / Rejected)
3. Click a flow to see its description, steps, confidence score, and delta classification
4. Click **Approve** or **Reject** — add reviewer notes if needed
5. Click **Export Approved** to download `approved-flows.json` for downstream use

---

## Skill Files

Skill files are plain Markdown injected into the inferencer system prompt to provide domain context. The inferencer is deliberately domain-agnostic — all domain knowledge enters exclusively via skill files.

| Skill file | Use case |
|---|---|
| `skills/apps/ecommerce.md` | Shopping apps — SauceDemo, AutomationExercise |
| `skills/apps/form-practice.md` | Form/widget demo apps — DemoQA |
| `skills/patterns/crud-flows.md` | Reusable CRUD patterns — stackable with app skills |

**Auto-matching:** When `SKILL_FILE` is not set, the first 5 page observations are embedded with Gemini and compared against `skill_embeddings` via cosine similarity. The closest match above 0.5 similarity is loaded automatically. If nothing matches, inference runs without a skill.

Re-seed after adding or editing skill files:

```bash
npm run db:seed:skills
```

---

## Flow Delta Detection

After each run, every newly inferred flow is embedded and compared against all flows stored from previous runs. Each flow is classified:

| Cosine similarity | Classification | Action |
|---|---|---|
| > 0.92 | `duplicate` | Skip — no new test needed |
| 0.70–0.92 | `modified` | Flag existing test for update |
| < 0.70 | `new` | Generate new test case |
| Present in store, absent this run | `deleted` | Retire existing test |

Classifications are printed in the terminal summary and stored in the output.

---

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `TARGET_URL` | yes | — | URL to start crawling from |
| `ANTHROPIC_API_KEY` | yes | — | Anthropic API key |
| `GEMINI_API_KEY` | yes | — | Google Gemini API key (embeddings) |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `APP_CONTEXT` | no | `''` | One-line app description for the inferencer |
| `SKILL_FILE` | no | — | Path to a skill `.md` file (overrides auto-match) |
| `SKIP_CRAWL` | no | `false` | Skip Playwright, load from `output/observations.json` |
| `MAX_PAGES` | no | `15` | BFS page cap |
| `HEADLESS` | no | `true` | Set to `false` to watch the browser during crawl |

---

## Database Schema

```
discovery_runs       — One row per crawl session
page_observations    — Raw crawl output stored as JSONB
inferred_flows       — Claude's output with status tracking (pending/approved/rejected)
flow_embeddings      — vector(3072) per flow — dedup and delta detection
skill_embeddings     — vector(3072) per skill file — auto skill selection
```

Both vector tables use HNSW indexes (`vector_cosine_ops`) for fast similarity search.

---

## Debugging

**Re-run inference without re-crawling:**
```bash
npm run infer:only
```

**Override skill for a single run:**
```bash
SKILL_FILE=skills/patterns/crud-flows.md npm run discover:saucedemo
```

**Check what skill was auto-matched:**
Look for `→ Auto-matched skill:` in the terminal output.

**Inferencer returning an empty array:**
1. Verify `ANTHROPIC_API_KEY` is set and valid
2. Check `output/observations.json` has content
3. Run `npm run infer:only` to isolate the issue

**pgvector insert failing:**
```bash
npm ls pgvector   # Confirm it is installed
```
Confirm `src/db/client.ts` registers the vector type with `pool.on('connect', ...)`.

---

## Known Limitations

- **Single-page state only.** The crawler reads the DOM as it first loads. Flows requiring interaction to reveal UI (modals, toggles, dynamic forms) may not be fully observed.
- **SPA navigation.** If two views share a URL, only the first DOM state is captured.
- **Single prompt.** All observations are sent to Claude in one call. Large crawls (30+ pages) produce very long prompts with no chunking yet.
- **Auth hook is a template.** Complex flows — MFA, OAuth redirects, CAPTCHA — require additional implementation.

---

## npm Scripts

| Script | Description |
|---|---|
| `npm run discover` | Run discovery against `TARGET_URL` |
| `npm run infer:only` | Re-run inference from saved observations (no browser) |
| `npm run db:migrate` | Create tables and pgvector extension |
| `npm run db:seed:skills` | Seed skill embeddings from `skills/` directory |
| `npm run discover:todomvc` | Discovery against TodoMVC |
| `npm run discover:saucedemo` | Discovery against SauceDemo with ecommerce skill |
| `npm run discover:demoqa` | Discovery against DemoQA with form-practice skill |
| `npm run discover:theinternet` | Discovery against The Internet (automation practice) |

---

## Further Reading

- `SETUP.md` — Detailed first-time setup including pgvector Docker, Supabase, and manual installation options
- `TECHNICAL_DOC.md` — Full architecture specification with file-by-file breakdown, data schemas, and design decisions
- `CLAUDE.md` — Persistent AI assistant context for Cursor/Claude Code sessions
