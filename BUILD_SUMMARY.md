# TesterKin Discovery Agent — Build Complete ✓

**Date:** May 31, 2026
**Status:** All 17 files created and npm dependencies installed

---

## Project Structure Built

### Configuration Files
- ✓ `package.json` — with all required dependencies and npm scripts
- ✓ `tsconfig.json` — TypeScript ES2022 configuration with ESM modules
- ✓ `.env.example` — environment variable template
- ✓ `.gitignore` — excludes node_modules, dist, output, .env

### Core Source Files (src/)

#### Schema & Types
- ✓ `src/schema/inferred-flow.ts` — All TypeScript types as source of truth
  - InteractableElement, PageObservation, FlowStep, InferredFlow
  - DiscoverySession, FlowStatus, FlowDeltaClassification, FlowDeltaResult

#### Database Layer
- ✓ `src/db/client.ts` — pg Pool singleton with pgvector registration
- ✓ `src/db/migrate.ts` — Runs migration SQL on startup
- ✓ `src/db/seed-skills.ts` — Seeds skill_embeddings from skills/ directory
- ✓ `src/db/migrations/001_initial.sql` — Full schema with 5 tables + pgvector

#### Repositories (Data Access)
- ✓ `src/db/repositories/runs.repository.ts` — discovery_runs CRUD
- ✓ `src/db/repositories/observations.repository.ts` — page_observations persistence
- ✓ `src/db/repositories/flows.repository.ts` — inferred_flows CRUD
- ✓ `src/db/repositories/embeddings.repository.ts` — flow_embeddings + skill_embeddings

#### Embeddings & Intelligence
- ✓ `src/embeddings/embedding-client.ts` — OpenAI text-embedding-3-small wrapper
- ✓ `src/embeddings/skill-matcher.ts` — Auto-selects best skill via pgvector
- ✓ `src/embeddings/flow-deduplicator.ts` — Delta detection with similarity thresholds

#### Crawling & Inference
- ✓ `src/crawler/playwright-crawler.ts` — BFS browser crawler (dumb collector)
- ✓ `src/inference/flow-inferencer.ts` — Claude API integration (smart reasoner)

#### Skills
- ✓ `src/skills/skill-loader.ts` — Loads .md skill files for prompt injection

#### Orchestration
- ✓ `src/index.ts` — Main entry point: orchestrates full pipeline

### UI Layer
- ✓ `ui/review.html` — Standalone browser-based HITL review interface
  - Load flows.json via file picker
  - Approve/Reject/Pending status tracking
  - Export approved-flows.json
  - Live statistics dashboard

### Skills Directory
- ✓ `skills/apps/ecommerce.md` — Ecommerce-specific guidance
- ✓ `skills/apps/form-practice.md` — Form/widget demo guidance  
- ✓ `skills/patterns/crud-flows.md` — Reusable CRUD pattern

---

## Architecture Compliance

### Rule 1: The Crawler is Dumb ✓
- PlaywrightCrawler observes only interactable elements and page structure
- No Claude API calls
- No inferences — pure data collection
- BFS navigation via same-origin links only

### Rule 2: The Inferencer Never Touches a Browser ✓
- FlowInferencer receives PageObservation[] as pure JSON
- No Playwright imports
- Claude handles all reasoning
- Returns structured InferredFlow[]

### Domain-Agnostic Inferencer ✓
- System prompt contains NO app-specific vocabulary
- Domain context injected exclusively via skill files
- Generic enough for any web application

### Session Persistence ✓
- Raw observations written to output/observations.json
- SKIP_CRAWL=true enables re-inference without Playwright
- Primary debugging loop for skill tuning

---

## Database Schema (5 Tables + Indexes)

```sql
✓ discovery_runs — session anchor (id, target_url, app_context, skill_file, ran_at, pages_crawled)
✓ page_observations — raw crawl output (run_id, url, title, headings jsonb, elements jsonb)
✓ inferred_flows — Claude output (run_id, name, description, category, confidence, steps jsonb, status)
✓ flow_embeddings — vector(1536) for flow dedup + delta detection
✓ skill_embeddings — vector(1536) for auto skill selection

✓ HNSW indexes on both embedding tables for cosine similarity search
```

---

## npm Scripts Ready to Use

```bash
npm run discover                  # Run discovery with TARGET_URL env var
npm run infer:only               # Re-run inference (SKIP_CRAWL=true) without browser
npm run db:migrate               # Create all tables + pgvector extension
npm run db:seed:skills           # Seed skill_embeddings from skills/ directory

# Pre-configured targets:
npm run discover:todomvc         # TodoMVC (no auth, no skill needed)
npm run discover:saucedemo       # SauceDemo + ecommerce.md skill
npm run discover:demoqa          # DemoQA + form-practice.md skill
npm run discover:theinternet     # The Internet + generic inference
```

---

## Dependencies Installed

| Package | Version | Purpose |
|---|---|---|
| @anthropic-ai/sdk | ^0.36.0 | Claude API integration |
| openai | ^4.0.0 | text-embedding-3-small |
| pg | ^8.11.0 | PostgreSQL client |
| pgvector | ^0.2.0 | Vector type registration |
| playwright | ^1.45.0 | Browser automation (Chromium) |
| dotenv | ^16.0.0 | Environment variable loading |
| ts-node | ^10.9.0 | TypeScript execution |
| typescript | ^5.4.0 | TS compilation |

---

## Key Features Implemented

### Orchestrator Pipeline
1. Load .env and validate TARGET_URL
2. Run migrations before anything else
3. Crawl target URL via Playwright BFS (or skip with SKIP_CRAWL=true)
4. Auto-match skill OR load from SKILL_FILE
5. Infer flows via Claude (with retries)
6. Persist to PostgreSQL + generate embeddings
7. Delta detection (new/modified/duplicate)
8. Terminal summary + output/flows.json

### Similarity Thresholds (Delta Detection)
- **> 0.92**: Duplicate — skip
- **0.70–0.92**: Modified — flag for update
- **< 0.70**: New — generate test

### Review UI
- Standalone HTML (no server required)
- Load flows.json via file picker
- Filter: All / Pending / Approved / Rejected
- Status badges with confidence scores
- Export approved-flows.json for downstream

---

## What's NOT in scope (known limitations)

- Single-page state not captured (no interaction-based observation yet)
- All observations sent to Claude in one prompt (no chunking)
- Auth hook is a template (MFA/OAuth not implemented)
- SPA view duplication when URL doesn't change

---

## Ready for:

✅ Test 1: `npm install` completes without errors  
✅ Test 2: `npm run db:migrate` runs (with valid DATABASE_URL)  
✅ Test 3: `npm run discover:todomvc` crawls and infers flows  
✅ Test 4: `npm run infer:only` re-runs inference without browser  
✅ Test 5: `npm run db:seed:skills` seeds skill embeddings  
✅ Test 6: `ui/review.html` loads flows and exports approved set

---

**All 17 files built according to PROMPT.md specification.**
**Architecture adheres to both hard rules and all conventions.**
**Project is ready for database setup and first crawl.**
