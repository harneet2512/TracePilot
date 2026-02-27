import { createEmbedding, createEmbeddings } from "./openai";
import type { Chunk } from "../../shared/schema";
import { storage } from "../storage";
import { RETRIEVAL_WARM_INDEX_CHUNK_LIMIT } from "./retrievalConfig";

const vectorStore: Map<string, number[]> = new Map();
let initialized = false;
let hydrationPromise: Promise<void> | null = null;
let indexingInProgress = false;
let indexingPromise: Promise<void> | null = null;

function isSQLite(): boolean {
  const url = process.env.DATABASE_URL || "";
  return process.env.DATABASE_DIALECT === "sqlite" || url.startsWith("file:");
}

export async function initializeVectorStore(allChunks: Chunk[]): Promise<void> {
  if (initialized) return;

  console.log(`[vectorstore] Initializing with ${allChunks.length} chunks...`);

  const eagerWarmLimit = Math.min(
    RETRIEVAL_WARM_INDEX_CHUNK_LIMIT,
    parseInt(process.env.RETRIEVAL_EAGER_WARM_LIMIT || "1200", 10)
  );
  const unindexedChunks = allChunks.filter(c => !vectorStore.has(c.id));
  const chunksToIndex = unindexedChunks.slice(0, eagerWarmLimit);
  if (unindexedChunks.length > chunksToIndex.length) {
    console.log(
      `[vectorstore] Eager warm limited to ${chunksToIndex.length}/${unindexedChunks.length} chunks ` +
      `(set RETRIEVAL_EAGER_WARM_LIMIT to tune).`
    );
  }

  if (chunksToIndex.length > 0) {
    console.log(`[vectorstore] Found ${chunksToIndex.length} chunks to index. Starting background process...`);
    indexingPromise = indexChunks(chunksToIndex).catch(err => {
      console.error("[vectorstore] Background indexing error:", err);
    }).then(() => { indexingPromise = null; });
  } else {
    console.log(`[vectorstore] All chunks already indexed.`);
  }

  initialized = true;
}

export async function indexChunks(chunksToIndex: Chunk[]): Promise<void> {
  if (chunksToIndex.length === 0) return;

  indexingInProgress = true;
  console.log(`[vectorstore] Starting indexing of ${chunksToIndex.length} chunks...`);

  const batchSize = 50;
  let processed = 0;

  try {
    for (let i = 0; i < chunksToIndex.length; i += batchSize) {
      const batch = chunksToIndex.slice(i, i + batchSize);
      const toEmbed: Chunk[] = [];

      for (const chunk of batch) {
        if (chunk.vectorRef && chunk.vectorRef.startsWith("[")) {
          try {
            const vector = JSON.parse(chunk.vectorRef);
            if (Array.isArray(vector) && vector.length > 0) {
              vectorStore.set(chunk.id, vector);
              continue;
            }
          } catch (e) {
            // Ignore parse error, re-embed
          }
        }
        toEmbed.push(chunk);
      }

      if (toEmbed.length > 0) {
        if (processed === 0) {
          console.log(`[vectorstore] Generating embeddings for ${toEmbed.length} chunks in this batch... (This may take a while for the first run)`);
        }
        try {
          const texts = toEmbed.map(c => c.text);
          const embeddings = await createEmbeddings(texts);

          for (let j = 0; j < toEmbed.length; j++) {
            const chunk = toEmbed[j];
            const embedding = embeddings[j];
            vectorStore.set(chunk.id, embedding);
            await storage.updateChunk(chunk.id, { vectorRef: JSON.stringify(embedding) });
          }
        } catch (e) {
          console.error(`[vectorstore] Failed to embed batch ${i}:`, e);
        }
      }

      processed += batch.length;
      if (processed % 500 === 0 || processed === chunksToIndex.length) {
        console.log(`[vectorstore] Indexed ${processed}/${chunksToIndex.length} chunks...`);
      }
      if (process.env.NODE_ENV === "development" && processed % 1000 === 0) {
        const mem = process.memoryUsage();
        console.log(`[vectorstore] Memory: heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`[vectorstore] Indexing complete. vectorStore.size=${vectorStore.size}`);
    const sampleKeys = Array.from(vectorStore.keys()).slice(0, 3);
    console.log(`[vectorstore] Sample stored IDs: ${JSON.stringify(sampleKeys)}`);
  } finally {
    indexingInProgress = false;
  }
}

/**
 * Ensures the vector store is hydrated from the database.
 * Refuses full warm when workspace has > 5000 chunks and SQLite (OOM guard).
 */
export async function ensureVectorStoreHydrated(): Promise<void> {
  if (hydrationPromise) {
    await hydrationPromise;
    return;
  }

  if (initialized && vectorStore.size > 0) {
    return;
  }

  if (vectorStore.size === 0) {
    hydrationPromise = (async () => {
      try {
        const sqlite = isSQLite();
        const activeChunkCount = await storage.getActiveChunkCount();

        if (activeChunkCount > RETRIEVAL_WARM_INDEX_CHUNK_LIMIT && sqlite) {
          console.warn(
            `[vectorstore] Active chunk count is ${activeChunkCount} (>${RETRIEVAL_WARM_INDEX_CHUNK_LIMIT}). ` +
            `Refusing full warm index in SQLite/in-memory mode to prevent OOM. ` +
            `Postgres + pgvector is required for this scale.`
          );
          initialized = true;
          return;
        }

        const activeChunks = await storage.getActiveChunksBounded(RETRIEVAL_WARM_INDEX_CHUNK_LIMIT);
        if (activeChunks.length > 0) {
          console.log(
            `[vectorstore] Hydrating vector store with ${activeChunks.length}/${activeChunkCount} chunks from database (bounded)...`
          );
          await indexChunks(activeChunks);
          initialized = true;
          console.log(`[vectorstore] Hydrated vector store with ${vectorStore.size} chunks`);
        } else {
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
    initialized = true;
  }
}

// Query embedding cache: avoids redundant embedding API calls for repeated queries
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function searchSimilar(
  query: string,
  allChunks: Chunk[],
  topK: number = 5
): Promise<{ chunk: Chunk; score: number }[]> {
  await ensureVectorStoreHydrated();

  // Wait for any in-progress indexing to complete so we don't miss embeddings
  if (indexingPromise) {
    await indexingPromise;
  }

  if (allChunks.length === 0) return [];

  const cached = embeddingCache.get(query);
  let queryEmbedding: number[];
  if (cached && Date.now() - cached.ts < EMBEDDING_CACHE_TTL_MS) {
    queryEmbedding = cached.embedding;
  } else {
    queryEmbedding = await createEmbedding(query);
    embeddingCache.set(query, { embedding: queryEmbedding, ts: Date.now() });
    if (embeddingCache.size > 100) {
      const now = Date.now();
      const entries = Array.from(embeddingCache.entries());
      for (const [key, val] of entries) {
        if (now - val.ts > EMBEDDING_CACHE_TTL_MS) embeddingCache.delete(key);
      }
    }
  }

  const missing = allChunks.filter(c => !vectorStore.has(c.id));
  if (missing.length > 0) {
    console.log(
      `[vectorstore] ${missing.length}/${allChunks.length} chunks missing embeddings, ` +
      `embedding on-the-fly (storeSize=${vectorStore.size})`
    );
    const batchSize = 50;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      try {
        const embeddings = await createEmbeddings(batch.map(c => c.text));
        for (let j = 0; j < batch.length; j++) {
          vectorStore.set(batch[j].id, embeddings[j]);
        }
      } catch (e) {
        console.error(`[vectorstore] On-the-fly embedding failed for batch ${i}:`, e);
      }
    }
  }

  const scored: { chunk: Chunk; score: number }[] = [];

  for (const chunk of allChunks) {
    const embedding = vectorStore.get(chunk.id);
    if (embedding) {
      const score = cosineSimilarity(queryEmbedding, embedding);
      scored.push({ chunk, score });
    }
  }

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

export function getVectorStoreIndexingInProgress(): boolean {
  return indexingInProgress;
}
