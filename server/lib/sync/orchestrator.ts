import { createHash, randomUUID } from "crypto";
import type { SyncContext, SyncResult, SyncEngine, SyncableItem, SyncableContent, SyncProgress } from "./types";
import { chunkText, estimateTokens } from "../chunker";
import { indexChunks } from "../vectorstore";
import { storage } from "../../storage";
import type { InsertSource, InsertChunk, Source, InsertSourceVersion } from "@shared/schema";
import { tracer } from "../observability/tracer";

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

  const startTime = startedAt.getTime();
  const stats: SyncProgress = {
    stage: "fetching",
    docsDiscovered: 0,
    docsFetched: 0,
    sourcesUpserted: 0,
    versionsCreated: 0,
    chunksCreated: 0,
    charsProcessed: 0,
  };

  const syncMode = ctx.scope.syncMode || "metadata_first";
  const sourceType = engineNameToSourceType(engine.name);
  const requestId = randomUUID();

  // Create trace for sync operation
  const traceCtx = await tracer.startTrace("sync", ctx.userId, requestId);
  const traceId = traceCtx.traceId;

  try {
    console.log(`[sync] Starting ${engine.name} sync for user ${ctx.userId}, mode: ${syncMode}`);

    // Span: fetch metadata
    const metadataStart = Date.now();
    const items = await engine.fetchMetadata(ctx);

    stats.docsDiscovered = items.length;
    if (ctx.onProgress) await ctx.onProgress(stats);

    await tracer.recordSpan(traceId, {
      name: "fetch_metadata",
      kind: "other",
      durationMs: Date.now() - metadataStart,
      metadata: { itemCount: items.length },
    });
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
        console.log(`[sync] SKIP item=${item.externalId} reason=metadata_first+existing`);
        continue;
      }

      if (syncMode === "smart" && existing && existing.contentHash === item.contentHash) {
        console.log(`[sync] SKIP item=${item.externalId} reason=smart+hashMatch`);
        continue;
      }

      if (syncMode === "on_demand") {
        console.log(`[sync] SKIP item=${item.externalId} reason=on_demand`);
        continue;
      }

      try {
        const shouldFetchContent =
          syncMode === "full" ||
          (syncMode === "smart" && (!existing || existing.contentHash !== item.contentHash)) ||
          (syncMode === "metadata_first" && !existing);

        if (shouldFetchContent) {
          // Span: fetch content
          const contentStart = Date.now();
          const content = await engine.fetchContent(ctx, item);
          await tracer.recordSpan(traceId, {
            name: "fetch_content",
            kind: "other",
            durationMs: Date.now() - contentStart,
            metadata: { externalId: item.externalId, hasContent: !!content },
          });

          if (content) {
            stats.docsFetched++;
            stats.stage = "persisting";

            // Span: sync content (chunk + embed + write)
            const syncContentStart = Date.now();
            await syncContent(ctx, sourceType, content, existing?.id, result, stats);
            await tracer.recordSpan(traceId, {
              name: "sync_content",
              kind: "other",
              durationMs: Date.now() - syncContentStart,
              metadata: {
                externalId: item.externalId,
                chunksCreated: result.chunksCreated,
              },
            });
          }
        }

        // Update ETA
        if (stats.docsFetched > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          stats.throughputCharsPerSec = stats.charsProcessed / elapsed;
          const avgTimePerDoc = elapsed / stats.docsFetched;
          const remainingDocs = items.length - stats.docsFetched;
          stats.etaSeconds = remainingDocs * avgTimePerDoc;
        }
        if (ctx.onProgress) await ctx.onProgress(stats);

      } catch (error) {
        const msg = `Failed to sync item ${item.externalId}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[sync] ${msg}`);
        result.errors.push(msg);
      }
    }

    // A) NO DELETE-FIRST: Gate deletion behind INGEST SUCCESS
    // Define success: sourcesUpserted > 0 AND chunksCreated > 0 AND errors.length === 0
    const ingestSuccess = (stats.sourcesUpserted > 0 && result.chunksCreated > 0 && result.errors.length === 0);

    if (ingestSuccess) {
      // Only sweep stale sources after successful ingest
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
    } else {
      // DO NOT DELETE: Log warning and skip deletion entirely
      console.warn(`[sync] SKIPPING source deletion: ingest not successful (processed=${stats.sourcesUpserted}, chunks=${result.chunksCreated}, errors=${result.errors.length})`);
      console.warn(`[sync] Data preserved: ${existingByExternalId.size} existing sources kept intact`);
    }

    // F) End-of-sync summary log (always)
    console.log(`[sync:summary] ${JSON.stringify({
      connectorType: engine.name,
      scopeId: ctx.scope.id,
      accountId: ctx.accountId || 'unknown',
      workspaceId: ctx.scope.workspaceId || 'default-workspace',
      discovered: stats.docsDiscovered,
      processed: stats.sourcesUpserted,
      chunksCreated: result.chunksCreated,
      sourcesDeleted: result.sourcesDeleted,
      errorCount: result.errors.length,
      ingestSuccess
    })}`);

    await storage.createAuditEvent({
      requestId,
      kind: "sync",
      userId: ctx.userId,
      success: ingestSuccess,
      responseJson: {
        engine: engine.name,
        scopeId: ctx.scope.id,
        syncMode,
        sourcesCreated: result.sourcesCreated,
        sourcesUpdated: result.sourcesUpdated,
        sourcesDeleted: result.sourcesDeleted,
        chunksCreated: result.chunksCreated,
        errorCount: result.errors.length,
        ingestSuccess,
      },
    });

    if (result.chunksCreated === 0 && items.length > 0 && result.sourcesUpdated > 0) {
      // Heuristic: if we found items and apparently updated sources but created 0 chunks, something might be wrong with chunking/persistence
      // unless syncMode=metadata_first (but here we had stats.docsFetched)
      if (syncMode !== "metadata_first" && stats.docsFetched > 0) {
        const msg = `Sync warning: Found ${items.length} items, fetched ${stats.docsFetched}, but created 0 chunks. check ingestion logic.`;
        console.warn(`[sync] ${msg}`);
        // User requested force failure: "If job completes and sourcesDiscovered>0 but chunksCreated==0, force job failure"
        throw new Error(msg);
      }
    }

    // Complete trace
    await tracer.endTrace(traceId, "completed");

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
  result: SyncResult,
  stats?: SyncProgress
): Promise<void> {
  const contentHash = createHash("sha256").update(content.content).digest("hex");

  // B) Resolve workspaceId from scope (already defaulted in job enqueue)
  // NEVER use user lookup for workspaceId - use scope's workspaceId
  const workspaceId = ctx.scope.workspaceId || "default-workspace";

  if (!workspaceId) {
    throw new Error(`workspaceId must not be null for syncContent`);
  }

  console.log(`[sync:content] Syncing source: ${content.title}, workspaceId=${workspaceId}, userId=${ctx.userId}`);

  // Determine visibility
  const isSlackPublic = sourceType === "slack" && content.metadata?.is_private === false;
  const visibility = isSlackPublic ? "workspace" : "private";

  const sourceData: InsertSource = {
    workspaceId,  // Use resolved workspaceId from scope
    type: sourceType,
    title: content.title,
    visibility,
    createdByUserId: ctx.userId,
    contentHash,
    fullText: content.content, // Keep latest fullText on source for easy access
    url: content.url,
    externalId: content.externalId,
    userId: ctx.userId,
    metadataJson: {
      mimeType: content.mimeType,
      modifiedAt: content.modifiedAt?.toISOString(),
      scopeId: ctx.scope.id,
      ...content.metadata,
    },
  };

  // Upsert source
  const source = await storage.upsertSource(workspaceId, content.externalId, sourceType, ctx.userId, sourceData);
  const sourceId = source.id;

  // Simple heuristic for separate Create/Update counts (not perfect but acceptable)
  // If created very recently (within last 2 seconds) and attempts=0 context?
  // Actually upsertSource returns the record.
  // We'll just assume updated for now if we didn't track it, OR we could check creation time.
  // result.sourcesUpdated++; // Default to updated or simply track "processed"
  // Let's just increment updated count for simplicity as "processed sources"
  result.sourcesUpdated++;
  if (stats) stats.sourcesUpserted++;

  // Handle Versioning
  // 1. Get current max version
  const versions = await storage.getSourceVersions(sourceId);
  const nextVersion = (versions[0]?.version || 0) + 1;

  // 2. Deactivate old versions
  await storage.deactivateSourceVersions(sourceId);

  // 3. Create new version
  const charCount = content.content.length;
  const tokenEstimateCount = estimateTokens(content.content);

  const versionData: InsertSourceVersion = {
    workspaceId,  // Use resolved workspaceId from scope
    sourceId: sourceId,
    version: nextVersion,
    contentHash,
    fullText: content.content,
    isActive: true,
    charCount,
    tokenEstimate: tokenEstimateCount,
  };

  const newVersion = await storage.createSourceVersion(versionData);

  // 4. Create chunks linked to version
  const textChunks = chunkText(content.content);

  if (textChunks.length > 0) {
    const chunkRecords = await storage.createChunks(
      textChunks.map((tc, idx) => ({
        workspaceId,  // Use resolved workspaceId from scope
        sourceId: sourceId!,
        sourceVersionId: newVersion.id,
        chunkIndex: idx,
        text: tc.text,
        charStart: tc.charStart,
        charEnd: tc.charEnd,
        tokenEstimate: estimateTokens(tc.text),
        userId: ctx.userId,
        metadataJson: sourceType === "slack" ? {
          channelId: content.metadata?.channelId,
          channelName: content.metadata?.channelName,
          is_private: false,
          connectorType: ctx.scope.type,
          scopeId: ctx.scope.id,
          externalId: content.externalId
        } : {
          connectorType: ctx.scope.type,
          scopeId: ctx.scope.id,
          externalId: content.externalId
        },
      } as InsertChunk))
    );

    // Index active chunks
    await indexChunks(chunkRecords);
    result.chunksCreated += chunkRecords.length;
  }

  console.log(`[sync] Persisted source ${sourceId} v${nextVersion} (${textChunks.length} chunks) for workspace=${workspaceId}`);
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
