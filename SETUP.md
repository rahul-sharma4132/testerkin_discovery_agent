# TesterKin Discovery Agent — Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | ESM support required |
| npm | 9+ | Comes with Node 18 |
| PostgreSQL | 13+ | With pgvector extension |
| Anthropic API key | — | For flow inference |
| OpenAI API key | — | For embeddings only |

---

## Step 1 — Get a pgvector-enabled PostgreSQL instance

Pick one option. Option A is recommended for local development.

---

### Option A — Docker (recommended for local dev)

Requires Docker Desktop running.

```bash
docker run -d \
  --name testerkin-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testerkin_discovery \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

This uses the official `pgvector/pgvector` image which ships with pgvector
pre-installed. No manual extension build needed.

Your `DATABASE_URL` will be:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/testerkin_discovery
```

To stop and restart the container:
```bash
docker stop testerkin-pg
docker start testerkin-pg
```

To reset the database entirely:
```bash
docker rm -f testerkin-pg
# then re-run the docker run command above
```

---

### Option B — Supabase (free tier, no local Docker needed)

1. Create a free project at https://supabase.com
2. pgvector is enabled by default on all Supabase projects
3. Go to Project Settings → Database → Connection string → URI
4. Copy the connection string and use it as `DATABASE_URL`

Note: Supabase free tier pauses after 1 week of inactivity.
Fine for POC, not for continuous use.

---

### Option C — Local PostgreSQL with manual pgvector install

Only use this if you already have Postgres running locally and cannot use Docker.

```bash
# macOS (Homebrew)
brew install pgvector

# Ubuntu / Debian
sudo apt install postgresql-16-pgvector

# Then connect to your DB and run:
psql -U postgres -d testerkin_discovery -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Verify the extension is active:
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

You should see one row. If you see zero rows, the extension did not install correctly.

---

## Step 2 — Install npm dependencies

```bash
npm install
npx playwright install chromium
```

The `pgvector` npm package is included in `package.json`. It handles serialization
of JavaScript `number[]` arrays into the PostgreSQL `vector` type and back.
Without it, all embedding inserts will throw a type error.

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Required
TARGET_URL=https://www.saucedemo.com
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/testerkin_discovery

# Optional
APP_CONTEXT=Ecommerce demo app with login, product browsing, and cart checkout
SKILL_FILE=skills/apps/ecommerce.md
SKIP_CRAWL=false
MAX_PAGES=15
```

---

## Step 4 — Run the database migration

```bash
npm run db:migrate
```

This runs `src/db/migrations/001_initial.sql` which:
- Enables the pgvector extension
- Creates all 5 tables
- Creates HNSW indexes on `flow_embeddings` and `skill_embeddings`

Expected output:
```
→ Running migration...
✓ Migration complete
```

If migration fails with `extension "vector" does not exist`, your PostgreSQL
instance does not have pgvector installed. Go back to Step 1.

---

## Step 5 — Seed skill embeddings

```bash
npm run db:seed:skills
```

This reads all `.md` files from `skills/apps/` and `skills/patterns/`,
generates an embedding for each, and stores them in `skill_embeddings`.

Expected output:
```
→ Seeding skill: skills/apps/ecommerce.md
→ Seeding skill: skills/apps/form-practice.md
→ Seeding skill: skills/patterns/crud-flows.md
✓ Seeded 3 skills
```

Re-run this whenever you add or update a skill file. The upsert is idempotent.

---

## Step 6 — Verify pgvector is working

Connect to your database and run:

```sql
-- Confirm extension
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- Confirm tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Confirm HNSW indexes exist
SELECT indexname, tablename FROM pg_indexes
WHERE indexdef LIKE '%hnsw%';
```

Expected tables: `discovery_runs`, `flow_embeddings`, `inferred_flows`,
`page_observations`, `skill_embeddings`

Expected indexes: two HNSW indexes on `flow_embeddings` and `skill_embeddings`

---

## Step 7 — Run your first discovery

```bash
# Start with TodoMVC — simplest app, no skill needed
npm run discover:todomvc
```

Expected output:
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

## Step 8 — Review flows in the UI

Open `ui/review.html` directly in your browser (no server needed):

```bash
open ui/review.html      # macOS
xdg-open ui/review.html  # Linux
```

Click "Load flows.json", navigate to `output/flows.json`, and approve or reject each flow.
Click "Export Approved" to download `approved-flows.json`.

---

## POC run sequence

Run the sites in this order. Each one tests a different scenario:

```bash
# 1. SPA — single page, interaction-driven
npm run discover:todomvc

# 2. Multi-page ecommerce with login gate
npm run discover:saucedemo

# 3. Form and widget components
npm run discover:demoqa

# 4. Automation practice site — known ground truth
npm run discover:theinternet
```

After each run, check:
- `output/observations.json` — raw crawl data
- `output/flows.json` — inferred flows with confidence scores
- Terminal summary — new vs modified vs duplicate count

---

## Debugging

### Re-run inference without re-crawling

```bash
npm run infer:only
```

Use this when tuning skill files or the inferencer prompt.
Reads from `output/observations.json` — no Playwright launched.

### Override skill file for a single run

```bash
SKILL_FILE=skills/patterns/crud-flows.md npm run discover:saucedemo
```

### Check what skill was auto-matched

Look for the `→ Auto-matched skill:` line in the terminal output.
If you see `→ No skill matched`, re-seed after adding skill files.

### Inferencer returning empty array

1. Check your `ANTHROPIC_API_KEY` is set and valid
2. Check `output/observations.json` has content (crawler ran successfully)
3. Run `npm run infer:only` to isolate the issue to inference

### pgvector insert failing

Confirm the `pgvector` npm package is installed:
```bash
npm ls pgvector
```

Confirm the pool is registering the vector type at connect time (see `src/db/client.ts`).
Without registration, `vector(1536)` columns will reject `number[]` values.

---

## File locations reference

| File | Purpose |
|---|---|
| `CLAUDE.md` | Persistent Cursor context — read by Claude Code every session |
| `TECHNICAL_DOC.md` | Full architecture specification |
| `SETUP.md` | This file |
| `PROMPT.md` | Master Cursor Composer scaffold prompt |
| `.env` | Local environment variables (gitignored) |
| `output/observations.json` | Raw crawl output (gitignored) |
| `output/flows.json` | Inferred flows (gitignored) |
| `skills/apps/` | App-specific skill files |
| `skills/patterns/` | Reusable pattern skill files |
| `ui/review.html` | Static HITL review UI |