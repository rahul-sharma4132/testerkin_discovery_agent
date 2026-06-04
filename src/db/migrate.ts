import { readFile } from 'fs/promises';
import { resolve } from 'path';
import pool from './client.js';

async function runMigration() {
  try {
    console.log('→ Running migration...');
    const sqlPath = resolve('./src/db/migrations/001_initial.sql');
    const sql = await readFile(sqlPath, 'utf-8');
    await pool.query(sql);
    console.log('✓ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
