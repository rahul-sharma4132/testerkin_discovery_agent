import { GoogleGenerativeAI } from '@google/generative-ai';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();

  const response = await client.getGenerativeModel({ model: 'gemini-embedding-2' }).embedContent(text);

  return response.embedding.values;
}
