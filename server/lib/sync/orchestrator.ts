import { createHash, randomUUID } from "crypto";
import type { SyncContext, SyncResult, SyncEngine, SyncableItem, SyncableContent } from "./types";
import { chunkText, estimateTokens } from "../chunker";
import { indexChunks } from "../vectorstore";
import { storage } from "../../storage";
import type { InsertSource, InsertChunk, Source } from "@shared/schema";

type SourceType = "upload" | "confluence" | "drive" | "jira" | "slack";

function engineNameToSourceType(engineName: string): SourceType {
  if (engineName === "google") return "drive";
  return engineName as SourceType;
}

export async function runSync(
  engine: SyncEngine,
  ctx: SyncContext
): Promise<SyncResult> {
  const startedAt = new Date();
  const result: SyncResult = {
    success: true,
    sourcesCreated: 0,
    sourcesUpdated: 0,
    sourcesDeleted: 0,
    chunksCreated: 0,
    errors: [],
    startedAt,
    completedAt: startedAt,
  };

  const syncMode = ctx.scope.syncMode || "metadata_first";
  const sourceType = engineNameToSourceType(engine.name);
  const requestId = randomUUID();

  try {
    console.log(`[sync] Starting ${engine.name} sync for user ${ctx.userId}, mode: ${syncMode}`);

    const items = await engine.fetchMetadata(ctx);
    console.log(`[sync] Found ${items.length} items to sync`);

    const existingSources = await storage.getSourcesByUserAndType(ctx.userId, sourceType);
    const existingByExternalId = new Map<string | null, Source>(
      existingSources.map(s => [s.externalId, s])
    );

    const seenExternalIds = new Set<string>();

    for (const item of items) {
      seenExternalIds.add(item.externalId);

      const existing = existingByExternalId.get(item.externalId);

      if (syncMode === "metadata_first" && existing) {
        continue;
      }

      if (syncMode === "smart" && existing && existing.contentHash === item.contentHash) {
        continue;
      }

      if (syncMode === "on_demand") {
        continue;
      }

      try {
        const shouldFetchContent = 
          syncMode === "full" || 
          (syncMode === "smart" && (!existing || existing.contentHash !== item.contentHash)) ||
          (syncMode === "metadata_first" && !existing);

        if (shouldFetchContent) {
          const content = await engine.fetchContent(ctx, item);
          if (content) {
            await syncContent(ctx, sourceType, content, existing?.id, result);
          }
        }
      } catch (error) {
        const msg = `Failed to sync item ${item.externalId}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[sync] ${msg}`);
        result.errors.push(msg);
      }
    }

    const entriesToCheck = Array.from(existingByExternalId.entries());
    for (const [externalId, source] of entriesToCheck) {
      if (externalId && !seenExternalIds.has(externalId)) {
        try {
          await storage.deleteSource(source.id);
          result.sourcesDeleted++;
        } catch (error) {
          const msg = `Failed to delete source ${source.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(msg);
        }
      }
    }

    await storage.createAuditEvent({
      requestId,
      kind: "sync",
      userId: ctx.userId,
      success: true,
      responseJson: {
        engine: engine.name,
        scopeId: ctx.scope.id,
        syncMode,
        sourcesCreated: result.sourcesCreated,
        sourcesUpdated: result.sourcesUpdated,
        sourcesDeleted: result.sourcesDeleted,
        chunksCreated: result.chunksCreated,
        errorCount: result.errors.length,
      },
    });

  } catch (error) {
    result.success = false;
    const msg = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    console.error(`[sync] ${msg}`);

    await storage.createAuditEvent({
      requestId,
      kind: "sync",
      userId: ctx.userId,
      success: false,
      error: msg,
      responseJson: {
        engine: engine.name,
        scopeId: ctx.scope.id,
      },
    });
  }

  result.completedAt = new Date();
  console.log(`[sync] Completed ${engine.name} sync: ${result.sourcesCreated} created, ${result.sourcesUpdated} updated, ${result.sourcesDeleted} deleted`);

  return result;
}

async function syncContent(
  ctx: SyncContext,
  sourceType: SourceType,
  content: SyncableContent,
  existingSourceId: string | undefined,
  result: SyncResult
): Promise<void> {
  const contentHash = createHash("sha256").update(content.content).digest("hex");

  if (existingSourceId) {
    await storage.deleteSource(existingSourceId);
    result.sourcesUpdated++;
  } else {
    result.sourcesCreated++;
  }

  const sourceData: InsertSource = {
    type: sourceType,
    title: content.title,
    contentHash,
    fullText: content.content,
    url: content.url,
    externalId: content.externalId,
    userId: ctx.userId,
    metadataJson: {
      mimeType: content.mimeType,
      modifiedAt: content.modifiedAt?.toISOString(),
      ...content.metadata,
    },
  };

  const source = await storage.createSource(sourceData);

  const textChunks = chunkText(content.content);

  if (textChunks.length > 0) {
    const chunkRecords = await storage.createChunks(
      textChunks.map((tc, idx) => ({
        sourceId: source.id,
        chunkIndex: idx,
        text: tc.text,
        charStart: tc.charStart,
        charEnd: tc.charEnd,
        tokenEstimate: estimateTokens(tc.text),
        userId: ctx.userId,
      } as InsertChunk))
    );

    await indexChunks(chunkRecords);
    result.chunksCreated += chunkRecords.length;
  }
}

export async function syncOnDemand(
  engine: SyncEngine,
  ctx: SyncContext,
  externalId: string
): Promise<SyncableContent | null> {
  const sourceType = engineNameToSourceType(engine.name);
  
  try {
    const items = await engine.fetchMetadata(ctx);
    const item = items.find(i => i.externalId === externalId);
    
    if (!item) {
      console.error(`[sync] Item ${externalId} not found in scope`);
      return null;
    }

    const content = await engine.fetchContent(ctx, item);
    if (!content) {
      return null;
    }

    const existing = await storage.getSourceByExternalId(externalId, ctx.userId);
    const result: SyncResult = {
      success: true,
      sourcesCreated: 0,
      sourcesUpdated: 0,
      sourcesDeleted: 0,
      chunksCreated: 0,
      errors: [],
      startedAt: new Date(),
      completedAt: new Date(),
    };

    await syncContent(ctx, sourceType, content, existing?.id, result);
    
    return content;
  } catch (error) {
    console.error(`[sync] On-demand sync failed for ${externalId}:`, error);
    return null;
  }
}
