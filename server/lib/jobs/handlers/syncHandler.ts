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
import { normalizeConnectorType } from "../../connectors/resolver";

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

    // Normalize connector type
    let connectorType;
    try {
      connectorType = normalizeConnectorType(payload.connectorType);
      // Log if normalization occurred
      if (connectorType !== payload.connectorType) {
        console.log(`[sync] Normalized connector type: "${payload.connectorType}" -> "${connectorType}"`);
      }
    } catch (e) {
      await tracer.endTrace(traceCtx.traceId, "failed", `Invalid connector type: ${payload.connectorType}`);
      return { success: false, error: `Invalid connector type: ${payload.connectorType}. Allowed: google, atlassian, slack`, errorCode: "400" };
    }

    const engine = getEngine(connectorType, payload.useConfluence);
    if (!engine) {
      await tracer.endTrace(traceCtx.traceId, "failed", `No engine found for connector type: ${connectorType}`);
      return { success: false, error: `No engine found for connector type: ${connectorType}`, errorCode: "400" };
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
    if (!accessToken && account.accessToken && account.accessToken.length > 0) {
      console.error(`[syncHandler] Token decryption failed for account ${account.id}. Raw len: ${account.accessToken.length}, Decrypted len: 0`);
      // We know this is a misconfiguration or bad data
      await tracer.endTrace(traceCtx.traceId, "failed", `Token decryption failed (Encryption Key Mismatch)`);
      return {
        success: false,
        error: "Server misconfig: Encryption key mismatch (cannot decrypt token). Re-connect account.",
        errorCode: "500"
      };
    }
    console.log(`[syncHandler] Decrypted token for acc=${account.id}, encryptedLen=${account.accessToken?.length}, decryptedLen=${accessToken?.length}, val=${accessToken ? (accessToken.substring(0, 5) + "...") : "null"}`);
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
      chunksCreated: result.chunksCreated,
      sourcesCreated: result.sourcesCreated,
      sourcesUpdated: result.sourcesUpdated,
      sourcesDeleted: result.sourcesDeleted,
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
