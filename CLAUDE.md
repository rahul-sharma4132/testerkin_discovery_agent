# TesterKin Discovery Agent — Claude Context

## What this project is

A standalone TypeScript module that crawls a target web application using Playwright,
sends page observations to Claude for flow inference, persists results in PostgreSQL,
and uses pgvector embeddings for flow deduplication, delta detection, and automatic
skill file selection.

It is a sub-module of the larger TesterKin 2.0 multi-agent platform (separate repo).
The approved flows output feeds downstream into TesterKin's Test Case Generator (Agent 3).

---

## Tech stack

| Layer | Tool |
|---|---|
| Language | TypeScript (ESM), Node.js |
| Crawling | Playwright (crawl only — never for test execution) |
| Flow inference | Anthropic SDK — `claude-sonnet-4-5` |
| Embeddings | Google Generative AI SDK — `gemini-embedding-2` (vector size: 3072) |
| Database | PostgreSQL + pgvector extension |
| DB client | `pg` (node-postgres) |
| Runner | `ts-node` |

---

## Architecture: the two hard rules

**Rule 1 — The crawler is dumb.**
It collects and records interactable elements. It makes no inferences.
It never calls Claude. It never interprets what it sees.

**Rule 2 — The inferencer never touches a browser.**
It receives `PageObservation[]` and returns `InferredFlow[]`. That is its entire job.
No Playwright imports. No DOM access.

---

## Domain-agnostic inferencer

The flow inferencer system prompt contains NO app-specific vocabulary.
No HRMS terms. No ecommerce terms. No UI framework hints.
Domain context comes exclusively from skill files injected at runtime via
`SKILL_FILE` env var, or auto-matched via `skill_matcher.ts`.
This is a deliberate design decision — never revert it.

---

## Session persistence

After every crawl, raw `PageObservation[]` must be written to `output/observations.json`.
Set `SKIP_CRAWL=true` to re-run inference against saved observations without launching Playwright.
This is the primary debugging loop during development and POC.

---

## File structure

```
testerkin-discovery/
  src/
    index.ts                         ← orchestrator entry point
    crawler/
      playwright-crawler.ts          ← BFS crawler, records elements
    inference/
      flow-inferencer.ts             ← Claude API call, returns InferredFlow[]
    skills/
      skill-loader.ts                ← loads skill .md file by path
    embeddings/
      embedding-client.ts            ← Google Generative AI embeddings wrapper
      flow-deduplicator.ts           ← similarity search: dedup + delta detection
      skill-matcher.ts               ← auto skill selection from skill_embeddings table
    db/
      client.ts                      ← pg Pool singleton
      migrate.ts                     ← runs migration SQL on startup
      seed-skills.ts                 ← seeds skill_embeddings from skills/ directory
      migrations/
        001_initial.sql              ← full schema including pgvector tables
      repositories/
        runs.repository.ts           ← discovery_runs CRUD
        observations.repository.ts   ← page_observations CRUD
        flows.repository.ts          ← inferred_flows CRUD
        embeddings.repository.ts     ← flow_embeddings + skill_embeddings queries
    schema/
      inferred-flow.ts               ← all TypeScript types (source of truth)
  skills/
    apps/
      ecommerce.md                   ← skill for ecommerce apps
      form-practice.md               ← skill for form/widget demo apps
    patterns/
      crud-flows.md                  ← reusable CRUD pattern skill
  ui/
    review.html                      ← static HITL review UI (no server needed)
  output/                            ← gitignored — runtime outputs only
  .env.example
  package.json
  tsconfig.json
  CLAUDE.md                          ← this file
  TECHNICAL_DOC.md                   ← full architecture specification
```

---

## TypeScript types — source of truth

All types live in `src/schema/inferred-flow.ts`. Never duplicate them elsewhere.

```typescript
export interface InteractableElement {
  type: 'button' | 'input' | 'link' | 'select' | 'textarea';
  text?: string;
  placeholder?: string;
  inputType?: string;
  href?: string;
}

export interface PageObservation {
  url: string;
  title: string;
  headings: string[];
  elements: InteractableElement[];
  observedAt: string; // ISO string
}

export interface FlowStep {
  stepNumber: number;
  action: string;
  target: string;
  expectedOutcome: string;
}

export interface InferredFlow {
  name: string;
  description: string;
  category: string;
  actor: string;
  entryPoint: string;
  steps: FlowStep[];
  exitPoint: string;
  confidence: number; // 0.0–1.0
}

export interface DiscoverySession {
  runId: string;
  targetUrl: string;
  appContext: string;
  skillFile?: string;
  ranAt: string;
  pagesCrawled: number;
  flows: InferredFlow[];
}

export type FlowStatus = 'pending' | 'approved' | 'rejected';

export type FlowDeltaClassification = 'duplicate' | 'modified' | 'new' | 'deleted';

export interface FlowDeltaResult {
  flowId: string;
  flowName: string;
  classification: FlowDeltaClassification;
  similarity?: number;
  matchedRunId?: string;
}
```

---

## Database schema

### Base tables

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE discovery_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url    text NOT NULL,
  app_context   text,
  skill_file    text,
  ran_at        timestamptz DEFAULT now(),
  pages_crawled int NOT NULL DEFAULT 0
);

CREATE TABLE page_observations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  url          text NOT NULL,
  title        text,
  headings     jsonb,
  elements     jsonb,
  observed_at  timestamptz DEFAULT now()
);

CREATE TABLE inferred_flows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  category     text,
  confidence   float,
  steps        jsonb,
  status       text NOT NULL DEFAULT 'pending',
  inferred_at  timestamptz DEFAULT now()
);
```

### pgvector tables

```sql
CREATE TABLE flow_embeddings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     uuid REFERENCES inferred_flows(id) ON DELETE CASCADE,
  run_id      uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  embedding   vector(768) NOT NULL,
  model       text NOT NULL DEFAULT 'embedding-001',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE skill_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_file    text UNIQUE NOT NULL,
  skill_content text NOT NULL,
  embedding     vector(768) NOT NULL,
  model         text NOT NULL DEFAULT 'embedding-001',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX ON flow_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX ON skill_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## pgvector Node.js setup

The `pgvector` npm package is required. Without it, inserting `number[]` into
`vector(768)` columns throws a type error. It must be registered with the pg
Pool at connect time.

### db/client.ts must look exactly like this

```typescript
import { Pool } from 'pg';
import pgvector from 'pgvector/pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', async (client) => {
  await pgvector.registerType(client);
});

export default pool;
```

The `pool.on('connect', ...)` registration hook fires for every new connection
the pool creates. Without it, the `vector` type is unknown to the client and
inserts fail.

### Serializing vectors in repository files

When inserting embeddings, always use `pgvector.toSql()` to serialize the array:

```typescript
import pgvector from 'pgvector/pg';

// In embeddings.repository.ts insert queries:
await pool.query(
  'INSERT INTO flow_embeddings (flow_id, run_id, embedding) VALUES ($1, $2, $3)',
  [flowId, runId, pgvector.toSql(embedding)]
);
```

Never pass a raw `number[]` to a vector column — it will fail or produce silent data corruption.

When reading embeddings back from the DB, they are automatically deserialized
to `number[]` after `pgvector.registerType` is called. No manual conversion needed on reads.

---

## Similarity thresholds for delta detection

| Cosine similarity | Classification | Action |
|---|---|---|
| > 0.92 | Duplicate | Skip — no new test needed |
| 0.70–0.92 | Modified | Flag for test update |
| < 0.70 | New flow | Generate new test case |
| In store, absent from current run | Deleted | Retire the test |

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TARGET_URL` | yes | — | URL to crawl |
| `APP_CONTEXT` | no | `''` | One-line app description for inferencer |
| `SKILL_FILE` | no | — | Path to skill `.md` file (overrides auto-match) |
| `SKIP_CRAWL` | no | `false` | Skip Playwright, load from `output/observations.json` |
| `MAX_PAGES` | no | `15` | BFS page cap |
| `ANTHROPIC_API_KEY` | yes | — | Claude API key |
| `GEMINI_API_KEY` | yes | — | Embeddings API key |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |

---

## npm scripts

```json
{
  "discover":              "ts-node src/index.ts",
  "infer:only":            "SKIP_CRAWL=true ts-node src/index.ts",
  "db:migrate":            "ts-node src/db/migrate.ts",
  "db:seed:skills":        "ts-node src/db/seed-skills.ts",
  "discover:todomvc":      "TARGET_URL=https://demo.playwright.dev/todomvc/ npm run discover",
  "discover:saucedemo":    "TARGET_URL=https://www.saucedemo.com SKILL_FILE=skills/apps/ecommerce.md APP_CONTEXT='Ecommerce demo app with login, product browsing, and cart checkout' npm run discover",
  "discover:demoqa":       "TARGET_URL=https://demoqa.com SKILL_FILE=skills/apps/form-practice.md APP_CONTEXT='UI component demo site with forms, widgets, and interactions' npm run discover",
  "discover:theinternet":  "TARGET_URL=https://the-internet.herokuapp.com APP_CONTEXT='Automation practice site with isolated UI interaction examples' npm run discover"
}
```

---

## Orchestrator pipeline (src/index.ts)

```
1. Read env vars
2. If SKIP_CRAWL=false → run PlaywrightCrawler → write output/observations.json
3. If SKIP_CRAWL=true  → read output/observations.json
4. If SKILL_FILE set   → loadSkill(SKILL_FILE)
5. If SKILL_FILE unset → skillMatcher.match(observations) → auto-select skill
6. Run FlowInferencer with (observations, skillContent)
7. Write output/flows.json
8. Persist: discovery_runs, page_observations, inferred_flows to DB
9. Embed each InferredFlow → store in flow_embeddings
10. Run FlowDeduplicator → log delta classifications to console
11. Print summary to terminal
```

---

## Conventions

- All async functions use `try/catch` with explicit console error logging before re-throwing
- Inferencer retries up to 3 times with 2s delay on API failure or JSON parse failure
- All DB operations go through repository files — no raw SQL in business logic files
- `output/` directory is gitignored — never commit `observations.json` or `flows.json`
- Skill files are plain markdown — no frontmatter, no special syntax
- Console output prefix convention:
  - `→` step starting
  - `✓` step succeeded
  - `✗` step failed
  - `⚠` warning / retry

---

## What NOT to do

- Do not add domain-specific vocabulary to the inferencer system prompt
- Do not call Claude from the crawler under any circumstances
- Do not call Playwright from the inferencer under any circumstances
- Do not hardcode model strings outside of `flow-inferencer.ts` and `embedding-client.ts`
- Do not write raw SQL outside of repository files and migration files
- Do not add npm dependencies without checking `package.json` first
- Do not change `InferredFlow` type shape without updating all repositories and the review UI