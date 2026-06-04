import { PageObservation } from '../schema/inferred-flow.js';
import { embedText } from './embedding-client.js';
import * as embeddingsRepo from '../db/repositories/embeddings.repository.js';

export async function matchSkill(observations: PageObservation[]): Promise<string> {
  try {
    const first5 = observations.slice(0, 5);
    let combined = '';

    for (const obs of first5) {
      combined += obs.title + ' ';
      combined += obs.headings.join(' ') + ' ';
      combined += obs.elements.map((el) => el.text || '').join(' ') + ' ';
    }

    const embedding = await embedText(combined);
    const match = await embeddingsRepo.findClosestSkill(embedding);

    if (match && match.similarity > 0.5) {
      console.log(`→ Auto-matched skill: ${match.skillFile} (similarity: ${match.similarity.toFixed(2)})`);
      return match.skillContent;
    }

    console.log('→ No skill matched — using generic inference');
    return '';
  } catch (error) {
    console.error('⚠ Skill matching failed:', error);
    return '';
  }
}
