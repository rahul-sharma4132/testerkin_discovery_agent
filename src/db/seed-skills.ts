import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import pool from './client.js';
import { embedText } from '../embeddings/embedding-client.js';
import * as embeddingsRepo from './repositories/embeddings.repository.js';

async function seedSkills() {
  try {
    console.log('→ Seeding skills...');
    const skillsDir = resolve('./skills');
    const skills: Array<{ path: string; content: string }> = [];

    async function walkDir(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          const content = await readFile(fullPath, 'utf-8');
          const skillPath = fullPath.replace(skillsDir, 'skills');
          skills.push({ path: skillPath, content });
        }
      }
    }

    await walkDir(skillsDir);

    for (const skill of skills) {
      console.log(`→ Seeding skill: ${skill.path}`);
      const embedding = await embedText(skill.content);
      await embeddingsRepo.saveSkillEmbedding(skill.path, skill.content, embedding);
    }

    console.log(`✓ Seeded ${skills.length} skills`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Seeding failed:', error);
    process.exit(1);
  }
}

seedSkills();
