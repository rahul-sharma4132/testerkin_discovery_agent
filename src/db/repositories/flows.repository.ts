import pool from '../client.js';
import { InferredFlow, FlowStatus } from '../../schema/inferred-flow.js';

export async function saveFlows(
  runId: string,
  flows: InferredFlow[]
): Promise<string[]> {
  const results = await Promise.all(
    flows.map((flow) =>
      pool.query(
        'INSERT INTO inferred_flows (run_id, name, description, category, confidence, steps, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [
          runId,
          flow.name,
          flow.description,
          flow.category,
          flow.confidence,
          JSON.stringify(flow.steps),
          'pending',
        ]
      )
    )
  );

  return results.map((r) => r.rows[0].id);
}

export async function updateFlowStatus(flowId: string, status: FlowStatus): Promise<void> {
  await pool.query(
    'UPDATE inferred_flows SET status = $1 WHERE id = $2',
    [status, flowId]
  );
}

export async function getFlowsByRun(runId: string): Promise<InferredFlow[]> {
  const result = await pool.query(
    'SELECT name, description, category, confidence, steps FROM inferred_flows WHERE run_id = $1',
    [runId]
  );

  return result.rows.map((row) => ({
    name: row.name,
    description: row.description,
    category: row.category,
    confidence: row.confidence,
    steps: row.steps,
    actor: 'User',
    entryPoint: '',
    exitPoint: '',
  }));
}
