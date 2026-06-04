CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS skill_embeddings CASCADE;
DROP TABLE IF EXISTS flow_embeddings CASCADE;
DROP TABLE IF EXISTS inferred_flows CASCADE;
DROP TABLE IF EXISTS page_observations CASCADE;
DROP TABLE IF EXISTS discovery_runs CASCADE;

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url text NOT NULL,
  app_context text,
  skill_file text,
  ran_at timestamptz DEFAULT now(),
  pages_crawled int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  headings jsonb,
  elements jsonb,
  observed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inferred_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  confidence float,
  steps jsonb,
  status text NOT NULL DEFAULT 'pending',
  inferred_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flow_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES inferred_flows(id) ON DELETE CASCADE,
  run_id uuid REFERENCES discovery_runs(id) ON DELETE CASCADE,
  embedding vector(3072) NOT NULL,
  model text NOT NULL DEFAULT 'gemini-embedding-2',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_file text UNIQUE NOT NULL,
  skill_content text NOT NULL,
  embedding vector(3072) NOT NULL,
  model text NOT NULL DEFAULT 'gemini-embedding-2',
  created_at timestamptz DEFAULT now()
);
