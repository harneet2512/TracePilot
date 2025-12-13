import { createEmbedding, createEmbeddings } from "./openai";
import type { Chunk } from "@shared/schema";

// In-memory vector store (simpler than pgvector for MVP)
// Stores embeddings in memory, keyed by chunk ID
const vectorStore: Map<string, number[]> = new Map();

export async function indexChunks(chunks: Chunk[]): Promise<void> {
  if (chunks.length === 0) return;
  
  const texts = chunks.map(c => c.text);
  const embeddings = await createEmbeddings(texts);
  
  for (let i = 0; i < chunks.length; i++) {
    vectorStore.set(chunks[i].id, embeddings[i]);
  }
}

export async function searchSimilar(
  query: string,
  allChunks: Chunk[],
  topK: number = 5
): Promise<{ chunk: Chunk; score: number }[]> {
  if (allChunks.length === 0) return [];
  
  const queryEmbedding = await createEmbedding(query);
  
  const scored: { chunk: Chunk; score: number }[] = [];
  
  for (const chunk of allChunks) {
    const embedding = vectorStore.get(chunk.id);
    if (embedding) {
      const score = cosineSimilarity(queryEmbedding, embedding);
      scored.push({ chunk, score });
    }
  }
  
  // Sort by score descending and take top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export function clearVectorStore(): void {
  vectorStore.clear();
}

export function getVectorStoreSize(): number {
  return vectorStore.size;
}
