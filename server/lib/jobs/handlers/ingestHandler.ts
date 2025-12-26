import { storage } from "../../../storage";
import { chunkText, estimateTokens } from "../../chunker";
import { indexChunks } from "../../vectorstore";
import type { Job } from "@shared/schema";
import { registerJobHandler, type JobStats } from "../runner";
import { createHash } from "crypto";

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
  chunks?: number;
  error?: string;
}

export function registerIngestHandler() {
  registerJobHandler("ingest", async (job: Job) => {
    const startTime = Date.now();
    const payload = job.inputJson as IngestPayload;
    
    if (!payload.files || !Array.isArray(payload.files)) {
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
      try {
        const contentHash = createHash("sha256").update(file.content).digest("hex");
        
        const existing = await storage.getSourceByContentHash(contentHash);
        if (existing) {
          results.push({
            file: file.filename,
            status: "duplicate",
            sourceId: existing.id,
          });
          stats.skipped = (stats.skipped || 0) + 1;
          continue;
        }

        await storage.deactivateSourceVersions(file.filename);

        const source = await storage.createSource({
          type: "upload",
          title: file.filename,
          contentHash,
          fullText: file.content,
          metadataJson: { mimeType: file.mimeType, size: file.size },
          userId: payload.userId,
        });

        const sourceVersion = await storage.createSourceVersion({
          sourceId: source.id,
          version: 1,
          contentHash,
          isActive: true,
        });

        const textChunks = chunkText(file.content);

        const chunkRecords = await storage.createChunks(
          textChunks.map(tc => ({
            sourceId: source.id,
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

        results.push({
          file: file.filename,
          status: "success",
          sourceId: source.id,
          chunks: chunkRecords.length,
        });
        stats.processed = (stats.processed || 0) + 1;

      } catch (error) {
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

    const hasFailures = stats.failed && stats.failed > 0;
    const allFailed = stats.failed === stats.discovered;

    return {
      success: !allFailed,
      output: { results },
      stats,
      error: hasFailures ? `${stats.failed} file(s) failed to process` : undefined,
    };
  });
}
