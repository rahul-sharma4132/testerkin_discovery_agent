import { mkdir, writeFile, readFile } from 'fs/promises';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { PlaywrightCrawler } from './crawler/playwright-crawler.js';
import { FlowInferencer } from './inference/flow-inferencer.js';
import { loadSkill } from './skills/skill-loader.js';
import { matchSkill } from './embeddings/skill-matcher.js';
import { embedText } from './embeddings/embedding-client.js';
import { deduplicateFlows } from './embeddings/flow-deduplicator.js';
import * as runsRepo from './db/repositories/runs.repository.js';
import * as observationsRepo from './db/repositories/observations.repository.js';
import * as flowsRepo from './db/repositories/flows.repository.js';
import * as embeddingsRepo from './db/repositories/embeddings.repository.js';
import pool from './db/client.js';
import { PageObservation, InferredFlow } from './schema/inferred-flow.js';

dotenv.config();

async function runMigration() {
  const { readFile } = await import('fs/promises');
  const sql = await readFile(resolve('./src/db/migrations/001_initial.sql'), 'utf-8');
  await pool.query(sql);
}

async function main() {
  try {
    console.log('→ Running migration...');
    await runMigration();
    console.log('✓ Migration complete');

    const targetUrl = process.env.TARGET_URL;
    const appContext = process.env.APP_CONTEXT || '';
    const skillFile = process.env.SKILL_FILE;
    const skipCrawl = process.env.SKIP_CRAWL === 'true';
    const maxPages = parseInt(process.env.MAX_PAGES || '15', 10);

    if (!targetUrl) {
      throw new Error('TARGET_URL env var is required');
    }

    let observations: PageObservation[];

    if (!skipCrawl) {
      const crawler = new PlaywrightCrawler({ maxPages });
      observations = await crawler.crawl(targetUrl);

      await mkdir('output', { recursive: true });
      await writeFile('output/observations.json', JSON.stringify(observations, null, 2));
    } else {
      console.log('→ Skipping crawl — using saved observations');
      const data = await readFile('output/observations.json', 'utf-8');
      observations = JSON.parse(data);
    }

    let skillContent = '';
    if (skillFile) {
      skillContent = await loadSkill(skillFile);
    } else {
      skillContent = await matchSkill(observations);
    }

    const inferencer = new FlowInferencer();
    const flows = await inferencer.inferFlows(observations, skillContent);

    await mkdir('output', { recursive: true });
    await writeFile('output/flows.json', JSON.stringify(flows, null, 2));

    const runId = await runsRepo.createRun(targetUrl, appContext, skillFile);
    await runsRepo.updatePageCount(runId, observations.length);

    if (observations.length > 0) {
      await observationsRepo.saveObservations(runId, observations);
    }

    if (flows.length > 0) {
      const flowIds = await flowsRepo.saveFlows(runId, flows);

      for (let i = 0; i < flows.length; i++) {
        const flow = flows[i];
        const embedding = await embedText(flow.name + ' ' + flow.description);
        await embeddingsRepo.saveFlowEmbedding(flowIds[i], runId, embedding);
      }

      const flowsWithEmbeddings = await Promise.all(
        flowIds.map(async (id, i) => {
          const embedding = await embedText(flows[i].name + ' ' + flows[i].description);
          return { id, name: flows[i].name, embedding };
        })
      );

      const deltaResults = await deduplicateFlows(flowsWithEmbeddings, runId);

      const newCount = deltaResults.filter((r) => r.classification === 'new').length;
      const modifiedCount = deltaResults.filter((r) => r.classification === 'modified').length;
      const duplicateCount = deltaResults.filter((r) => r.classification === 'duplicate').length;

      console.log('─────────────────────────────');
      console.log('TesterKin Discovery Complete');
      console.log('─────────────────────────────');
      console.log(`Target:    ${targetUrl}`);
      console.log(`Pages:     ${observations.length}`);
      console.log(`Flows:     ${flows.length}`);
      console.log(`New:       ${newCount}`);
      console.log(`Modified:  ${modifiedCount}`);
      console.log(`Duplicate: ${duplicateCount}`);
      console.log('Output:    output/flows.json');
      console.log('─────────────────────────────');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Discovery failed:', error);
    process.exit(1);
  }
}

main();
