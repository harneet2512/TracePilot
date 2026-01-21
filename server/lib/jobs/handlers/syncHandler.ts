import type { Job } from "@shared/schema";
import { registerJobHandler, type JobStats } from "../runner";
import { runSync } from "../../sync/orchestrator";
import { googleSyncEngine } from "../../sync/googleSync";
import { jiraSyncEngine } from "../../sync/jiraSync";
import { confluenceSyncEngine } from "../../sync/confluenceSync";
import { slackSyncEngine } from "../../sync/slackSync";
import type { SyncEngine, SyncContext } from "../../sync/types";
import { storage } from "../../../storage";
import { decryptToken } from "../../oauth";
import { tracer } from "../../observability/tracer";

interface SyncPayload {
  scopeId: string;
  userId: string;
  connectorType: "google" | "atlassian" | "slack";
  accountId: string;
  useConfluence?: boolean;
}

function getEngine(connectorType: string, useConfluence?: boolean): SyncEngine | null {
  switch (connectorType) {
    case "google":
      return googleSyncEngine;
    case "atlassian":
      return useConfluence ? confluenceSyncEngine : jiraSyncEngine;
    case "slack":
      return slackSyncEngine;
    default:
      return null;
  }
}

registerJobHandler("sync", async (job: Job, runId?: string): Promise<{ success: boolean; output?: unknown; error?: string; errorCode?: string; stats?: JobStats }> => {
  const startTime = Date.now();
  const payload = job.inputJson as SyncPayload | null;

  // Start trace for sync
  const traceCtx = await tracer.startTrace("sync", payload?.userId, `sync-${job.id}`);

  try {
    if (!payload) {
      await tracer.endTrace(traceCtx.traceId, "failed", "No payload provided");
      return { success: false, error: "No payload provided", errorCode: "400" };
    }

    if (!payload.scopeId || !payload.userId || !payload.connectorType || !payload.accountId) {
      await tracer.endTrace(traceCtx.traceId, "failed", "Missing required fields");
      return { success: false, error: "Missing required fields: scopeId, userId, connectorType, accountId", errorCode: "400" };
    }

    const engine = getEngine(payload.connectorType, payload.useConfluence);
    if (!engine) {
      await tracer.endTrace(traceCtx.traceId, "failed", `Unknown connector type: ${payload.connectorType}`);
      return { success: false, error: `Unknown connector type: ${payload.connectorType}`, errorCode: "400" };
    }

    const scope = await storage.getUserConnectorScope(payload.scopeId);
    if (!scope) {
      await tracer.endTrace(traceCtx.traceId, "failed", `Scope not found: ${payload.scopeId}`);
      return { success: false, error: `Scope not found: ${payload.scopeId}`, errorCode: "404" };
    }

    const account = await storage.getUserConnectorAccount(payload.accountId);
    if (!account) {
      await tracer.endTrace(traceCtx.traceId, "failed", `Account not found: ${payload.accountId}`);
      return { success: false, error: `Account not found: ${payload.accountId}`, errorCode: "404" };
    }

    console.log(`[sync] start job=${job.id} connector=${payload.connectorType} scope=${payload.scopeId} fixture=${process.env.DEV_CONNECTOR_FIXTURES === "1" ? 1 : 0} oauth=${account.accessToken ? "present" : "missing"} syncMode=${scope.syncMode || "metadata_first"}`);

    // Log DB target (safe parsing)
    try {
      if (process.env.DATABASE_URL) {
        const url = new URL(process.env.DATABASE_URL);
        console.log(`[sync] db target host=${url.hostname} port=${url.port || 5432} db=${url.pathname.slice(1)}`);
      }
    } catch (e) { /* ignore */ }

    // Record sync start span
    const listSpanId = await tracer.startSpan(traceCtx.traceId, {
      name: "sync_list_resources",
      kind: "other",
      metadata: {
        connectorType: payload.connectorType,
        accountId: payload.accountId,
        scopeId: payload.scopeId,
      },
    });

    const accessToken = decryptToken(account.accessToken);
    let lastProgressUpdate = 0;

    const ctx: SyncContext = {
      userId: payload.userId,
      accountId: payload.accountId,
      scope,
      accessToken,
      onProgress: async (stats) => {
        if (runId) {
          // Throttle updates to DB (e.g. every 1 second)
          const now = Date.now();
          if (now - lastProgressUpdate > 1000 || stats.stage === "done" || stats.stage === "error") {
            lastProgressUpdate = now;
            await storage.updateJobRun(runId, {
              statsJson: {
                ...stats,
                lastUpdatedAt: new Date().toISOString()
              }
            });
          }
        }
      }
    };

    const result = await runSync(engine, ctx);

    await tracer.endSpan(listSpanId, result.success ? "completed" : "failed", {
      retrievalCount: result.sourcesCreated + result.sourcesUpdated,
    }, result.success ? undefined : result.errors.join("; "));

    const stats: JobStats = {
      discovered: result.sourcesCreated + result.sourcesUpdated + result.sourcesDeleted,
      processed: result.sourcesCreated + result.sourcesUpdated,
      skipped: 0,
      failed: result.errors.length,
      durationMs: Date.now() - startTime,
    };

    await tracer.endTrace(traceCtx.traceId, result.success ? "completed" : "failed", result.success ? undefined : result.errors.join("; "));

    // Log completion
    console.log(`[sync] done job=${job.id} persisted sources=${result.sourcesCreated + result.sourcesUpdated} versions=0 chunks=${result.chunksCreated} (versions not yet tracked)`);
    return {
      success: result.success,
      output: {
        sourcesCreated: result.sourcesCreated,
        sourcesUpdated: result.sourcesUpdated,
        sourcesDeleted: result.sourcesDeleted,
        chunksCreated: result.chunksCreated,
        errors: result.errors,
      },
      error: result.success ? undefined : result.errors.join("; "),
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tracer.endTrace(traceCtx.traceId, "failed", message);
    return { success: false, error: message, errorCode: "500" };
  }
});
