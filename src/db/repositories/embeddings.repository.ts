import pool from '../client.js';
import pgvector from 'pgvector/pg';

export async function saveFlowEmbedding(
  flowId: string,
  runId: string,
  embedding: number[]
): Promise<void> {
  await pool.query(
    'INSERT INTO flow_embeddings (flow_id, run_id, embedding) VALUES ($1, $2, $3)',
    [flowId, runId, pgvector.toSql(embedding)]
  );
}

export async function findSimilarFlows(
  embedding: number[],
  excludeRunId: string,
  limit: number = 1
): Promise<Array<{ flowId: string; flowName: string; similarity: number; runId: string }>> {
  const result = await pool.query(
    `
    SELECT 
      f.id as "flowId",
      f.name as "flowName",
      (1 - (fe.embedding <=> $1::vector)) as similarity,
      f.run_id as "runId"
    FROM flow_embeddings fe
    JOIN inferred_flows f ON fe.flow_id = f.id
    WHERE f.run_id != $2
    ORDER BY fe.embedding <=> $1::vector
    LIMIT $3
    `,
    [pgvector.toSql(embedding), excludeRunId, limit]
  );

  return result.rows;
}

export async function saveSkillEmbedding(
  skillFile: string,
  skillContent: string,
  embedding: number[]
): Promise<void> {
  await pool.query(
    `
    INSERT INTO skill_embeddings (skill_file, skill_content, embedding)
    VALUES ($1, $2, $3)
    ON CONFLICT (skill_file) DO UPDATE SET skill_content = $2, embedding = $3
    `,
    [skillFile, skillContent, pgvector.toSql(embedding)]
  );
}

export async function findClosestSkill(
  embedding: number[]
): Promise<{ skillFile: string; skillContent: string; similarity: number } | null> {
  const result = await pool.query(
    `
    SELECT 
      skill_file as "skillFile",
      skill_content as "skillContent",
      (1 - (embedding <=> $1::vector)) as similarity
    FROM skill_embeddings
    ORDER BY embedding <=> $1::vector
    LIMIT 1
    `,
    [pgvector.toSql(embedding)]
  );

  if (result.rows.length === 0) return null;

  return {
    skillFile: result.rows[0].skillFile,
    skillContent: result.rows[0].skillContent,
    similarity: result.rows[0].similarity,
  };
}
