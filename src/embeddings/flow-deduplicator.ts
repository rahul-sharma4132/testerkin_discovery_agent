import { FlowDeltaResult } from '../schema/inferred-flow.js';
import * as embeddingsRepo from '../db/repositories/embeddings.repository.js';

export async function deduplicateFlows(
  flows: Array<{ id: string; name: string; embedding: number[] }>,
  currentRunId: string
): Promise<FlowDeltaResult[]> {
  const results: FlowDeltaResult[] = [];

  for (const flow of flows) {
    const similar = await embeddingsRepo.findSimilarFlows(flow.embedding, currentRunId, 1);

    if (similar.length === 0) {
      console.log(`✓ [new]      ${flow.name}`);
      results.push({
        flowId: flow.id,
        flowName: flow.name,
        classification: 'new',
      });
    } else {
      const { similarity, runId } = similar[0];
      if (similarity > 0.92) {
        console.log(`→ [duplicate] ${flow.name} — skipping`);
        results.push({
          flowId: flow.id,
          flowName: flow.name,
          classification: 'duplicate',
          similarity,
          matchedRunId: runId,
        });
      } else if (similarity >= 0.7 && similarity <= 0.92) {
        console.log(`⚠ [modified] ${flow.name} (similarity: ${similarity.toFixed(2)})`);
        results.push({
          flowId: flow.id,
          flowName: flow.name,
          classification: 'modified',
          similarity,
          matchedRunId: runId,
        });
      } else {
        console.log(`✓ [new]      ${flow.name}`);
        results.push({
          flowId: flow.id,
          flowName: flow.name,
          classification: 'new',
          similarity,
        });
      }
    }
  }

  return results;
}
