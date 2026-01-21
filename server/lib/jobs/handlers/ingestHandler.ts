import { storage } from "../../../storage";
import { chunkText, estimateTokens } from "../../chunker";
import { sanitizeContent } from "../../safety/sanitize";
import { indexChunks } from "../../vectorstore";
import type { Job } from "@shared/schema";
import { registerJobHandler, type JobStats } from "../runner";
import { createHash } from "crypto";
import { tracer } from "../../observability/tracer";

interface IngestPayload {
  files: Array<{
    filename: string;
    content: string;
    mimeType: string;
    size: number;
  }>;
  userId: string;
  accountId?: string;
}

interface IngestResult {
  file: string;
  status: "success" | "duplicate" | "failed";
  sourceId?: string;
  sourceVersionId?: string;
  chunks?: number;
  error?: string;
}

export function registerIngestHandler() {
  registerJobHandler("ingest", async (job: Job) => {
    const startTime = Date.now();
    const payload = job.inputJson as IngestPayload;

    // Start trace for ingestion
    const traceCtx = await tracer.startTrace("sync", payload.userId, `ingest-${job.id}`);

    try {
      if (!payload.files || !Array.isArray(payload.files)) {
        await tracer.endTrace(traceCtx.traceId, "failed", "Invalid payload: missing files array");
        return {
          success: false,
          error: "Invalid payload: missing files array",
          errorCode: "400",
        };
      }

      const stats: JobStats = {
        discovered: payload.files.length,
        processed: 0,
        skipped: 0,
        failed: 0,
      };

      const results: IngestResult[] = [];

      for (const file of payload.files) {
        const fileStartTime = Date.now();
        let extractSpanId: string | undefined;

        try {
          // Extract text span
          extractSpanId = await tracer.startSpan(traceCtx.traceId, {
            name: "extract_text",
            kind: "chunk",
            metadata: { filename: file.filename, size: file.size },
          });

          const contentHash = createHash("sha256").update(file.content).digest("hex");

          // Check for existing source by filename (for same user)
          const existingSources = await storage.getSourcesByUserAndType(payload.userId, "upload");
          const existingSource = existingSources.find(s => s.title === file.filename);

          if (existingSource) {
            // Check if newest active version has same hash (idempotency)
            const activeVersion = await storage.getActiveSourceVersion(existingSource.id);
            if (activeVersion && activeVersion.contentHash === contentHash) {
              // Same content - skip processing
              await tracer.endSpan(extractSpanId, "completed");
              results.push({
                file: file.filename,
                status: "duplicate",
                sourceId: existingSource.id,
                sourceVersionId: activeVersion.id,
              });
              stats.skipped = (stats.skipped || 0) + 1;
              continue;
            }

            // Different content - create new version
            // Deactivate all previous versions for this source
            await storage.deactivateSourceVersions(existingSource.id);

            // Get next version number
            const versions = await storage.getSourceVersions(existingSource.id);
            const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

            // Update source contentHash
            await storage.updateSource(existingSource.id, {
              contentHash,
              fullText: file.content,
              metadataJson: { mimeType: file.mimeType, size: file.size },
            });

            // Create new source version
            // TODO: Get actual workspaceId from user
            const user = await storage.getUser(payload.userId);
            const workspaceId = user?.workspaceId || "default-workspace";

            const sourceVersion = await storage.createSourceVersion({
              workspaceId,
              sourceId: existingSource.id,
              version: nextVersion,
              contentHash,
              fullText: file.content,
              isActive: true,
              charCount: file.content.length,
              tokenEstimate: estimateTokens(file.content),
            });

            // Delete old chunks for this source
            const oldChunks = await storage.getChunksBySourceId(existingSource.id);
            // Note: In production, you'd want to soft-delete or archive old chunks
            // For now, we'll just create new ones and the vector store will be updated

            // Chunk the content
            await tracer.endSpan(extractSpanId, "completed");
            const chunkSpanId = await tracer.startSpan(traceCtx.traceId, {
              name: "chunk_text",
              kind: "chunk",
              metadata: { filename: file.filename },
            });

            const textChunks = chunkText(file.content);

            await tracer.endSpan(chunkSpanId, "completed");

            // Embed and index chunks
            const embedSpanId = await tracer.startSpan(traceCtx.traceId, {
              name: "embed_chunks",
              kind: "embed",
              metadata: { chunkCount: textChunks.length },
            });

            const chunkRecords = await storage.createChunks(
              textChunks.map(tc => ({
                workspaceId,
                sourceId: existingSource.id,
                sourceVersionId: sourceVersion.id,
                chunkIndex: tc.chunkIndex,
                text: tc.text,
                charStart: tc.charStart,
                charEnd: tc.charEnd,
                tokenEstimate: estimateTokens(tc.text),
                userId: payload.userId,
              }))
            );

            await indexChunks(chunkRecords);

            await tracer.endSpan(embedSpanId, "completed", {
              retrievalCount: chunkRecords.length,
            });

            results.push({
              file: file.filename,
              status: "success",
              sourceId: existingSource.id,
              sourceVersionId: sourceVersion.id,
              chunks: chunkRecords.length,
            });
            stats.processed = (stats.processed || 0) + 1;
          } else {
            // New source - create source and first version
            await tracer.endSpan(extractSpanId, "completed");
            const chunkSpanId = await tracer.startSpan(traceCtx.traceId, {
              name: "chunk_text",
              kind: "chunk",
              metadata: { filename: file.filename },
            });

            // New source - create source and first version
            // TODO: Get actual workspaceId from user
            const user = await storage.getUser(payload.userId);
            const workspaceId = user?.workspaceId || "default-workspace";

            const source = await storage.createSource({
              workspaceId,
              type: "upload",
              createdByUserId: payload.userId,
              title: file.filename,
              contentHash,
              fullText: file.content,
              metadataJson: { mimeType: file.mimeType, size: file.size },
              userId: payload.userId,
            });

            const sourceVersion = await storage.createSourceVersion({
              workspaceId,
              sourceId: source.id,
              version: 1,
              contentHash,
              fullText: file.content,
              isActive: true,
              charCount: file.content.length,
              tokenEstimate: estimateTokens(file.content),
            });

            // Sanitize content before chunking to prevent prompt injection
            const sanitizeResult = sanitizeContent(file.content, {
              maxLength: 100000, // Large limit for full file
              sourceType: "upload",
              stripMarkers: true,
            });

            const textChunks = chunkText(sanitizeResult.sanitized);

            await tracer.endSpan(chunkSpanId, "completed");

            const embedSpanId = await tracer.startSpan(traceCtx.traceId, {
              name: "embed_chunks",
              kind: "embed",
              metadata: { chunkCount: textChunks.length },
            });

            const chunkRecords = await storage.createChunks(
              textChunks.map(tc => ({
                workspaceId,
                sourceId: source.id,
                sourceVersionId: sourceVersion.id,
                chunkIndex: tc.chunkIndex,
                text: tc.text, // Already sanitized
                charStart: tc.charStart,
                charEnd: tc.charEnd,
                tokenEstimate: estimateTokens(tc.text),
                userId: payload.userId,
              }))
            );

            await indexChunks(chunkRecords);

            await tracer.endSpan(embedSpanId, "completed", {
              retrievalCount: chunkRecords.length,
            });

            results.push({
              file: file.filename,
              status: "success",
              sourceId: source.id,
              sourceVersionId: sourceVersion.id,
              chunks: chunkRecords.length,
            });
            stats.processed = (stats.processed || 0) + 1;
          }

        } catch (error) {
          if (extractSpanId) {
            await tracer.endSpan(extractSpanId, "failed", undefined, error instanceof Error ? error.message : String(error));
          }
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            file: file.filename,
            status: "failed",
            error: errorMessage,
          });
          stats.failed = (stats.failed || 0) + 1;
        }
      }

      stats.durationMs = Date.now() - startTime;

      await tracer.endTrace(traceCtx.traceId, "completed");

      const hasFailures = stats.failed && stats.failed > 0;
      const allFailed = stats.failed === stats.discovered;

      return {
        success: !allFailed,
        output: { results },
        stats,
        error: hasFailures ? `${stats.failed} file(s) failed to process` : undefined,
      };
    } catch (error) {
      await tracer.endTrace(traceCtx.traceId, "failed", error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
}
