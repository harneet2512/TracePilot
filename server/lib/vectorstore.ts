import { createEmbedding, createEmbeddings } from "./openai";
import type { Chunk } from "../../shared/schema";
import { storage } from "../storage";

// In-memory vector store with persistence via chunk vectorRef field
// Embeddings are stored in memory but chunk IDs are tracked in DB
// On startup, re-index all chunks that don't have cached embeddings
const vectorStore: Map<string, number[]> = new Map();
let initialized = false;
let hydrationPromise: Promise<void> | null = null;

export async function initializeVectorStore(allChunks: Chunk[]): Promise<void> {
  if (initialized) return;
  
  console.log(`[vectorstore] Initializing with ${allChunks.length} chunks...`);
  
  // Filter chunks that need embedding (not already in memory)
  const chunksToIndex = allChunks.filter(c => !vectorStore.has(c.id));
  
  if (chunksToIndex.length > 0) {
    console.log(`[vectorstore] Indexing ${chunksToIndex.length} chunks...`);
    await indexChunks(chunksToIndex);
  }
  
  initialized = true;
  console.log(`[vectorstore] Ready with ${vectorStore.size} vectors`);
}

export async function indexChunks(chunks: Chunk[]): Promise<void> {
  if (chunks.length === 0) return;
  
  // Process in batches to avoid rate limits
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    const embeddings = await createEmbeddings(texts);
    
    for (let j = 0; j < batch.length; j++) {
      vectorStore.set(batch[j].id, embeddings[j]);
    }
  }
}

/**
 * Ensures the vector store is hydrated from the database.
 * Called lazily on first retrieval if the store is empty.
 */
export async function ensureVectorStoreHydrated(): Promise<void> {
  // If hydration is in progress, wait for it
  if (hydrationPromise) {
    await hydrationPromise;
    return;
  }
  
  // If store already has data and is initialized, skip
  if (initialized && vectorStore.size > 0) {
    return;
  }
  
  // Check if store is empty - hydrate from DB if needed
  if (vectorStore.size === 0) {
    hydrationPromise = (async () => {
      try {
        const activeChunks = await storage.getActiveChunks();
        if (activeChunks.length > 0) {
          console.log(`[vectorstore] Hydrating vector store with ${activeChunks.length} chunks from database...`);
          await indexChunks(activeChunks);
          initialized = true;
          console.log(`[vectorstore] Hydrated vector store with ${vectorStore.size} chunks`);
        } else {
          // No chunks in DB - mark as initialized to avoid repeated DB queries
          initialized = true;
          console.log(`[vectorstore] No active chunks found in database`);
        }
      } catch (error) {
        console.error(`[vectorstore] Failed to hydrate vector store:`, error);
        throw error;
      } finally {
        hydrationPromise = null;
      }
    })();
    
    await hydrationPromise;
  } else {
    // Store has data but wasn't marked initialized - mark it now
    initialized = true;
  }
}

export async function searchSimilar(
  query: string,
  allChunks: Chunk[],
  topK: number = 5
): Promise<{ chunk: Chunk; score: number }[]> {
  // Ensure vector store is hydrated before searching
  await ensureVectorStoreHydrated();
  
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
