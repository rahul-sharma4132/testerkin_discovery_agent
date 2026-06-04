# TesterKin Discovery Agent — Master Scaffold Prompt

Paste the contents of this file into Cursor Composer to scaffold the entire project from scratch.
Cursor must have CLAUDE.md and TECHNICAL_DOC.md open in context before running this prompt.

---

## Cursor Composer Prompt (paste below this line)

---

Read CLAUDE.md and TECHNICAL_DOC.md in full before writing any code.
All architectural decisions, type definitions, DB schema, env vars, and
conventions in those files are authoritative. Do not deviate from them.

Scaffold the complete `testerkin-discovery` TypeScript project as described.
Build every file listed below. Do not skip any file. Do not add files not listed.

---

### Dependencies

Create `package.json` with the following dependencies:

```json
{
  "name": "testerkin-discovery",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "discover":             "ts-node src/index.ts",
    "infer:only":           "SKIP_CRAWL=true ts-node src/index.ts",
    "db:migrate":           "ts-node src/db/migrate.ts",
    "db:seed:skills":       "ts-node src/db/seed-skills.ts",
    "discover:todomvc":     "TARGET_URL=https://demo.playwright.dev/todomvc/ npm run discover",
    "discover:saucedemo":   "TARGET_URL=https://www.saucedemo.com SKILL_FILE=skills/apps/ecommerce.md APP_CONTEXT='Ecommerce demo app with login, product browsing, and cart checkout' npm run discover",
    "discover:demoqa":      "TARGET_URL=https://demoqa.com SKILL_FILE=skills/apps/form-practice.md APP_CONTEXT='UI component demo site with forms, widgets, and interactions' npm run discover",
    "discover:theinternet": "TARGET_URL=https://the-internet.herokuapp.com APP_CONTEXT='Automation practice site with isolated UI interaction examples' npm run discover"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.0",
    "openai": "^4.0.0",
    "pg": "^8.11.0",
    "pgvector": "^0.2.0",
    "playwright": "^1.45.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/pg": "^8.11.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.4.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

Create `.env.example`:

```
TARGET_URL=
APP_CONTEXT=
SKILL_FILE=
SKIP_CRAWL=false
MAX_PAGES=15
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DATABASE_URL=postgresql://localhost:5432/testerkin_discovery
```

Create `.gitignore`:

```
node_modules/
dist/
output/
.env
*.js.map
```

---

### File 1 — src/schema/inferred-flow.ts

Create with every type from CLAUDE.md exactly as written:
InteractableElement, PageObservation, FlowStep, InferredFlow,
DiscoverySession, FlowStatus, FlowDeltaClassification, FlowDeltaResult.
Export all types. No other content in this file.

---

### File 2 — src/db/migrations/001_initial.sql

Create with the full schema from CLAUDE.md — all 5 tables in order:
discovery_runs, page_observations, inferred_flows, flow_embeddings, skill_embeddings.
Include the two HNSW indexes on flow_embeddings and skill_embeddings.
Include CREATE EXTENSION IF NOT EXISTS vector at the top.
Include IF NOT EXISTS on all CREATE TABLE statements.

---

### File 3 — src/db/client.ts

Create a pg Pool singleton with pgvector type registration.
The implementation must match this exactly — do not simplify or omit the registration hook:

```typescript
import { Pool } from 'pg';
import pgvector from 'pgvector/pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn('⚠ DATABASE_URL is not set — database operations will fail');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', async (client) => {
  await pgvector.registerType(client);
});

export default pool;
```

The `pool.on('connect', ...)` hook is mandatory. Without it, all vector column
inserts will throw a type error regardless of whether the extension is installed.

---

### File 4 — src/db/migrate.ts

Read the SQL from migrations/001_initial.sql using fs.readFile.
Execute it against the pool from client.ts.
Log: → Running migration...
Log: ✓ Migration complete on success.
Log: ✗ Migration failed: <error> on failure.
This file is runnable directly via ts-node.

---

### File 5 — src/db/seed-skills.ts

Read all .md files from skills/apps/ and skills/patterns/ recursively.
For each file:
  - Read its content
  - Generate an embedding via embedding-client.ts
  - Upsert into skill_embeddings (ON CONFLICT skill_file DO UPDATE SET skill_content, embedding, model)
Log: → Seeding skill: <filename> for each file.
Log: ✓ Seeded N skills on completion.
This file is runnable directly via ts-node.

---

### File 6 — src/db/repositories/runs.repository.ts

Functions:
  createRun(targetUrl, appContext, skillFile?): Promise<string>  ← returns run id
  updatePageCount(runId, count): Promise<void>

---

### File 7 — src/db/repositories/observations.repository.ts

Functions:
  saveObservations(runId, observations: PageObservation[]): Promise<void>
  ← bulk insert all observations for a run in a single query

---

### File 8 — src/db/repositories/flows.repository.ts

Functions:
  saveFlows(runId, flows: InferredFlow[]): Promise<string[]>  ← returns inserted flow ids
  updateFlowStatus(flowId, status: FlowStatus): Promise<void>
  getFlowsByRun(runId): Promise<InferredFlow[]>

---

### File 9 — src/db/repositories/embeddings.repository.ts

Functions:
  saveFlowEmbedding(flowId, runId, embedding: number[]): Promise<void>
  findSimilarFlows(embedding: number[], excludeRunId: string, limit?: number):
    Promise<Array<{ flowId: string; flowName: string; similarity: number; runId: string }>>
  saveSkillEmbedding(skillFile, skillContent, embedding: number[]): Promise<void>
  findClosestSkill(embedding: number[]):
    Promise<{ skillFile: string; skillContent: string; similarity: number } | null>

Use parameterised queries throughout.
For vector operations use the <=> operator (cosine distance).
similarity = 1 - (embedding <=> $1::vector)

CRITICAL — vector serialization:
When inserting any embedding, always wrap the number[] with pgvector.toSql():

```typescript
import pgvector from 'pgvector/pg';
// correct:
await pool.query('INSERT INTO flow_embeddings (..., embedding) VALUES (..., $3)',
  [flowId, runId, pgvector.toSql(embedding)]);
// wrong — will throw a type error:
await pool.query('INSERT INTO flow_embeddings (..., embedding) VALUES (..., $3)',
  [flowId, runId, embedding]);
```

Reads are automatic after pool registration — no conversion needed on SELECT.

---

### File 10 — src/embeddings/embedding-client.ts

Wrap the OpenAI SDK.
Export a single async function:
  embedText(text: string): Promise<number[]>

Use model text-embedding-3-small.
Read OPENAI_API_KEY from process.env.
Throw a clear error if the key is not set.
Return the embedding array from the first result.

---

### File 11 — src/embeddings/skill-matcher.ts

Export:
  matchSkill(observations: PageObservation[]): Promise<string>

Implementation:
  1. Take the first 5 observations (or all if fewer than 5).
  2. Concatenate their titles, headings, and element text into a single string.
  3. Embed that string using embedText().
  4. Call findClosestSkill() from embeddings.repository.ts.
  5. If a match is found with similarity > 0.5, log:
       → Auto-matched skill: <skillFile> (similarity: <score>)
     and return the skill content.
  6. If no match or similarity <= 0.5, log:
       → No skill matched — using generic inference
     and return an empty string.

---

### File 12 — src/embeddings/flow-deduplicator.ts

Export:
  deduplicateFlows(
    flows: Array<{ id: string; name: string; embedding: number[] }>,
    currentRunId: string
  ): Promise<FlowDeltaResult[]>

Implementation:
  For each flow, call findSimilarFlows() and take the top result.
  Apply thresholds from CLAUDE.md:
    > 0.92  → 'duplicate'
    0.70–0.92 → 'modified'
    < 0.70  → 'new'
  Log each classification:
    ✓ [new]      <flow name>
    ⚠ [modified] <flow name> (similarity: <score>)
    → [duplicate] <flow name> — skipping
  Return FlowDeltaResult[] for all flows.

---

### File 13 — src/skills/skill-loader.ts

Export:
  loadSkill(skillPath: string | undefined): Promise<string>

If skillPath is undefined, return ''.
If the file does not exist, log a warning and return ''.
If the file exists, read and return its contents.
Log:
  → Skill loaded: <filename>    on success
  → No skill file — using generic inference    if undefined

---

### File 14 — src/crawler/playwright-crawler.ts

Implement a BFS crawler using Playwright Chromium (headless: true).

Constructor options:
  maxPages: number (default 15)
  onBeforeCrawl?: (page: Page) => Promise<void>  ← auth hook

Method:
  crawl(startUrl: string): Promise<PageObservation[]>

BFS logic:
  - Maintain a visited Set<string> and a queue of URLs to visit
  - For each page:
    - Navigate with timeout 30s
    - Call onBeforeCrawl if set
    - Record: url, title, headings (h1/h2/h3 text), all interactable elements
    - Collect all same-origin href links and add unvisited ones to the queue
    - Stop when visited.size >= maxPages

Element recording rules:
  - buttons: text content
  - inputs: type attribute, placeholder attribute
  - links (a tags with href): text content, href (same-origin only for queueing)
  - selects: label or nearest text
  - textareas: placeholder

Log:
  → Crawling: <url> for each page visited
  ✓ Crawl complete: <N> pages visited on completion

---

### File 15 — src/inference/flow-inferencer.ts

Constructor:
  FlowInferencer()

Method:
  inferFlows(observations: PageObservation[], skillContent?: string): Promise<InferredFlow[]>

System prompt (do not add any domain-specific vocabulary — keep it generic):

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
- category: one of [authentication, navigation, data-entry, data-management, search, checkout, settings, other]
- actor: the type of user performing the flow (e.g. "User", "Admin", "Guest")
- entryPoint: the URL or UI element where the flow begins
- steps: ordered array of steps, each with stepNumber, action, target, expectedOutcome
- exitPoint: the final state or URL after the flow completes
- confidence: float 0.0–1.0 based on evidence strength

Confidence guidance:
- 0.85+ : clear entry URL, clear exit URL, all steps have UI evidence
- 0.60–0.85 : steps inferred from element labels without URL confirmation
- below 0.60 : speculative — partial evidence only

Return ONLY a valid JSON array of flow objects. No markdown. No explanation.
No preamble. The response must start with [ and end with ].
```

If skillContent is a non-empty string, append it to the system prompt under:
## App-specific guidance
<skillContent>

User prompt:
```
Here are the page observations from the crawl:

<observations as JSON>

Identify all distinct user flows.
```

Retry logic:
- Strip markdown code fences before JSON.parse
- Validate parsed result is an array
- Retry up to 3 times with 2s delay on failure
- Return [] if all retries fail, log the error

Log:
  → Sending <N> page observations to Claude...
  ✓ Inferred <N> flows on success
  ⚠ Inference attempt <n> failed, retrying... on each retry
  ✗ Inference failed after 3 attempts on final failure

---

### File 16 — src/index.ts

This is the orchestrator. Follow the pipeline from CLAUDE.md exactly:

```
1.  Load .env (dotenv)
2.  Read and validate env vars: TARGET_URL (required), APP_CONTEXT, SKILL_FILE,
    SKIP_CRAWL, MAX_PAGES, DATABASE_URL (required)
3.  Run db/migrate.ts inline (await migration before anything else)
4.  If SKIP_CRAWL=false:
      Run PlaywrightCrawler.crawl(TARGET_URL)
      Write observations to output/observations.json (create output/ if needed)
      Update run page count in DB
5.  If SKIP_CRAWL=true:
      Read output/observations.json
      Log: → Skipping crawl — using saved observations
6.  Determine skill content:
      If SKILL_FILE set → loadSkill(SKILL_FILE)
      Else → matchSkill(observations)  ← auto-match
7.  Run FlowInferencer.inferFlows(observations, skillContent)
8.  Write output/flows.json
9.  Persist to DB:
      Create discovery_run record
      Save page_observations
      Save inferred_flows → collect returned flow ids
10. Embed each flow (name + description) → save to flow_embeddings
11. Run deduplicateFlows() → log delta classifications
12. Print terminal summary:
      ─────────────────────────────
      TesterKin Discovery Complete
      ─────────────────────────────
      Target:    <url>
      Pages:     <N>
      Flows:     <N>
      New:       <N>
      Modified:  <N>
      Duplicate: <N>
      Output:    output/flows.json
      ─────────────────────────────
```

---

### File 17 — ui/review.html

A fully self-contained static HTML file. No server needed.
The user opens it directly in a browser and loads output/flows.json via a file picker.

Features:
- File picker to load flows.json
- Display each InferredFlow as a card showing:
    name, category, confidence (as a coloured badge: green ≥0.85, amber 0.60–0.84, red <0.60),
    actor, entryPoint, exitPoint, description
  Expand/collapse to show steps
- Three buttons per card: Approve / Reject / Pending (updates status in memory)
- Export button that downloads the filtered (approved only) flows as approved-flows.json
- Flow count summary at the top: Total / Approved / Rejected / Pending
- No external CDN dependencies — use plain HTML, CSS, and vanilla JS only

---

### Done when

1. `npm install` completes without errors
2. `npm run db:migrate` runs and creates all 5 tables
3. `npm run discover:todomvc` completes and writes `output/observations.json`
   and `output/flows.json` with at least 1 inferred flow
4. `npm run infer:only` re-runs inference using the saved observations
   without launching a browser
5. `npm run db:seed:skills` seeds the skill files into `skill_embeddings`
6. Opening `ui/review.html` in a browser and loading `output/flows.json`
   displays the flows with Approve/Reject controls and exports `approved-flows.json`

Do not mark the task done until all 6 checks pass.