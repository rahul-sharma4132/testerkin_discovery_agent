import pool from '../client.js';

export async function createRun(
  targetUrl: string,
  appContext?: string,
  skillFile?: string
): Promise<string> {
  const result = await pool.query(
    'INSERT INTO discovery_runs (target_url, app_context, skill_file) VALUES ($1, $2, $3) RETURNING id',
    [targetUrl, appContext || null, skillFile || null]
  );
  return result.rows[0].id;
}

export async function updatePageCount(runId: string, count: number): Promise<void> {
  await pool.query(
    'UPDATE discovery_runs SET pages_crawled = $1 WHERE id = $2',
    [count, runId]
  );
}
