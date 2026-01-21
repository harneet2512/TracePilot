import { storage } from "../../../storage";
import { chunkText, estimateTokens } from "../../chunker";
import { indexChunks } from "../../vectorstore";
import type { Job } from "@shared/schema";
import { registerJobHandler, type JobStats } from "../runner";
import { createHash } from "crypto";
import { tracer } from "../../observability/tracer";

interface IngestCallTranscriptPayload {
  callId: string;
}

export function registerIngestCallTranscriptHandler() {
  registerJobHandler("ingest_call_transcript", async (job: Job) => {
    const startTime = Date.now();
    const payload = job.inputJson as IngestCallTranscriptPayload;

    // Start trace for ingestion
    const traceCtx = await tracer.startTrace("sync", payload.callId, `ingest_call_${job.id}`);

    try {
      if (!payload.callId) {
        await tracer.endTrace(traceCtx.traceId, "failed", "Invalid payload: missing callId");
        return {
          success: false,
          error: "Invalid payload: missing callId",
          errorCode: "400",
        };
      }

      const stats: JobStats = {
        discovered: 1,
        processed: 0,
        skipped: 0,
        failed: 0,
      };

      // Get call and turns
      const call = await storage.getVoiceCall(payload.callId);
      if (!call) {
        await tracer.endTrace(traceCtx.traceId, "failed", "Call not found");
        return {
          success: false,
          error: "Call not found",
          errorCode: "404",
        };
      }

      const turns = await storage.getVoiceTurnsByCall(payload.callId);

      // Build transcript with speaker labels
      const transcript = turns.map(turn => {
        const speaker = turn.role === "user" ? "User" : "Assistant";
        return `${speaker}: ${turn.text}`;
      }).join("\n\n");

      if (!transcript.trim()) {
        await tracer.endTrace(traceCtx.traceId, "failed", "Empty transcript");
        return {
          success: false,
          error: "Empty transcript",
          errorCode: "400",
        };
      }

      // Compute content hash
      const contentHash = createHash("sha256").update(transcript).digest("hex");

      // Check for existing source by callId
      const existingSources = await storage.getSourcesByUserAndType(call.userId || "", "voice_call");
      const existingSource = existingSources.find(s => s.externalId === payload.callId);

      if (existingSource) {
        // Check if newest active version has same hash (idempotency)
        const activeVersion = await storage.getActiveSourceVersion(existingSource.id);
        if (activeVersion && activeVersion.contentHash === contentHash) {
          // Same content - skip processing
          await tracer.endTrace(traceCtx.traceId, "completed");
          stats.skipped = 1;
          return {
            success: true,
            output: { callId: payload.callId, status: "duplicate" },
            stats,
          };
        }

        // Different content - create new version
        await storage.deactivateSourceVersions(existingSource.id);

        const versions = await storage.getSourceVersions(existingSource.id);
        const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

        // Update source contentHash
        await storage.updateSource(existingSource.id, {
          contentHash,
        });

        // Create new source version
        // TODO: Get actual workspaceId from user
        const user = call.userId ? await storage.getUser(call.userId) : null;
        const workspaceId = user?.workspaceId || "default-workspace";

        const sourceVersion = await storage.createSourceVersion({
          workspaceId,
          sourceId: existingSource.id,
          version: nextVersion,
          contentHash,
          fullText: transcript,
          isActive: true,
          charCount: transcript.length,
          tokenEstimate: estimateTokens(transcript),
        });

        // Chunk and index
        const textChunks = chunkText(transcript);
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
            userId: call.userId || null,
          }))
        );

        await indexChunks(chunkRecords);

        stats.processed = 1;
      } else {
        // New source - create source and first version
        // TODO: Get actual workspaceId from user
        const user = call.userId ? await storage.getUser(call.userId) : null;
        const workspaceId = user?.workspaceId || "default-workspace";

        const source = await storage.createSource({
          workspaceId,
          type: "voice_call",
          createdByUserId: call.userId || "system",
          title: `Voice Call ${call.callerNumber || call.id.slice(0, 8)}`,
          contentHash,
          fullText: transcript,
          metadataJson: {
            callId: payload.callId,
            callerNumber: call.callerNumber,
            startedAt: call.startedAt.toISOString(),
            completedAt: call.completedAt?.toISOString(),
            turnCount: turns.length,
          },
          userId: call.userId || null,
          externalId: payload.callId,
        });

        const sourceVersion = await storage.createSourceVersion({
          workspaceId,
          sourceId: source.id,
          version: 1,
          contentHash,
          fullText: transcript,
          isActive: true,
          charCount: transcript.length,
          tokenEstimate: estimateTokens(transcript),
        });

        const textChunks = chunkText(transcript);
        const chunkRecords = await storage.createChunks(
          textChunks.map(tc => ({
            workspaceId,
            sourceId: source.id,
            sourceVersionId: sourceVersion.id,
            chunkIndex: tc.chunkIndex,
            text: tc.text,
            charStart: tc.charStart,
            charEnd: tc.charEnd,
            tokenEstimate: estimateTokens(tc.text),
            userId: call.userId || null,
          }))
        );

        await indexChunks(chunkRecords);

        stats.processed = 1;
      }

      const duration = Date.now() - startTime;
      stats.durationMs = duration;

      await tracer.endTrace(traceCtx.traceId, "completed");

      return {
        success: true,
        output: { callId: payload.callId, processed: true },
        stats,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await tracer.endTrace(traceCtx.traceId, "failed", errorMessage);
      return {
        success: false,
        error: errorMessage,
        errorCode: "500",
      };
    }
  });
}


