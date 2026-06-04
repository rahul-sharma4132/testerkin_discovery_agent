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
