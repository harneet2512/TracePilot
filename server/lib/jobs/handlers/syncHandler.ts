import type { Job } from "@shared/schema";
import { registerJobHandler } from "../runner";
import { runSync } from "../../sync/orchestrator";
import { googleSyncEngine } from "../../sync/googleSync";
import { jiraSyncEngine } from "../../sync/jiraSync";
import { confluenceSyncEngine } from "../../sync/confluenceSync";
import { slackSyncEngine } from "../../sync/slackSync";
import type { SyncEngine, SyncContext } from "../../sync/types";
import { storage } from "../../../storage";
import { decryptToken } from "../../oauth";

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

registerJobHandler("sync", async (job: Job): Promise<{ success: boolean; output?: unknown; error?: string }> => {
  const payload = job.inputJson as SyncPayload | null;
  
  if (!payload) {
    return { success: false, error: "No payload provided" };
  }

  if (!payload.scopeId || !payload.userId || !payload.connectorType || !payload.accountId) {
    return { success: false, error: "Missing required fields: scopeId, userId, connectorType, accountId" };
  }

  const engine = getEngine(payload.connectorType, payload.useConfluence);
  if (!engine) {
    return { success: false, error: `Unknown connector type: ${payload.connectorType}` };
  }

  const scope = await storage.getUserConnectorScope(payload.scopeId);
  if (!scope) {
    return { success: false, error: `Scope not found: ${payload.scopeId}` };
  }

  const account = await storage.getUserConnectorAccount(payload.accountId);
  if (!account) {
    return { success: false, error: `Account not found: ${payload.accountId}` };
  }

  const accessToken = decryptToken(account.accessToken);
  
  const ctx: SyncContext = {
    userId: payload.userId,
    accountId: payload.accountId,
    scope,
    accessToken,
  };

  try {
    const result = await runSync(engine, ctx);

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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});
