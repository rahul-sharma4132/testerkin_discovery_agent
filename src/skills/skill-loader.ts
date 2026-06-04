import { readFile } from 'fs/promises';

export async function loadSkill(skillPath: string | undefined): Promise<string> {
  if (!skillPath) {
    console.log('→ No skill file — using generic inference');
    return '';
  }

  try {
    const content = await readFile(skillPath, 'utf-8');
    const filename = skillPath.split('/').pop();
    console.log(`→ Skill loaded: ${filename}`);
    return content;
  } catch (error) {
    console.warn(`⚠ Skill file not found: ${skillPath}`);
    return '';
  }
}
