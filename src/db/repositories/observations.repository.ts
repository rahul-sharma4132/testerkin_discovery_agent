import pool from '../client.js';
import { PageObservation } from '../../schema/inferred-flow.js';

export async function saveObservations(
  runId: string,
  observations: PageObservation[]
): Promise<void> {
  const values = observations.map((obs) => [
    runId,
    obs.url,
    obs.title,
    JSON.stringify(obs.headings),
    JSON.stringify(obs.elements),
    obs.observedAt,
  ]);

  const query = `
    INSERT INTO page_observations (run_id, url, title, headings, elements, observed_at)
    VALUES ${values.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')}
  `;

  const flatValues = values.flat();
  await pool.query(query, flatValues);
}
