export * from "./types";
export * from "./orchestrator";
export { googleSyncEngine } from "./googleSync";
export { jiraSyncEngine } from "./jiraSync";
export { confluenceSyncEngine } from "./confluenceSync";
export { slackSyncEngine } from "./slackSync";

import type { SyncEngine } from "./types";
import { googleSyncEngine } from "./googleSync";
import { jiraSyncEngine } from "./jiraSync";
import { confluenceSyncEngine } from "./confluenceSync";
import { slackSyncEngine } from "./slackSync";

export function getSyncEngine(type: string): SyncEngine | null {
  switch (type) {
    case "google":
    case "drive":
      return googleSyncEngine;
    case "jira":
      return jiraSyncEngine;
    case "confluence":
      return confluenceSyncEngine;
    case "slack":
      return slackSyncEngine;
    default:
      return null;
  }
}
