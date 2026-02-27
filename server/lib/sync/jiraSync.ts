import type { SyncContext, SyncEngine, SyncableItem, SyncableContent } from "./types";
import { sanitizeContent, wrapUntrustedContent, type SourceType } from "../safety/sanitize";
import { detectInjection, stripSuspiciousLines } from "../safety/detector";

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    updated: string;
    issuetype: { name: string };
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    reporter?: { displayName: string } | null;
    labels?: string[];
    comment?: {
      comments: Array<{
        author: { displayName: string };
        body: string;
        created: string;
      }>;
    };
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

export const jiraSyncEngine: SyncEngine = {
  name: "jira",

  async fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log("[jiraSync] Returning fixture metadata");
      return [
        {
          externalId: "fixture-issue-1",
          title: "PROJ-123: Implement Login Flow (Fixture)",
          url: "https://jira.atlassian.com/browse/PROJ-123",
          mimeType: "text/plain",
          contentHash: "fixture-jira-hash-1",
          modifiedAt: new Date(),
        }
      ];
    }

    const items: SyncableItem[] = [];
    const scopeConfig = ctx.scope.scopeConfigJson as {
      cloudId?: string;
      projectKeys?: string[];
      jql?: string;
    } | null;

    if (!scopeConfig?.cloudId) {
      console.error("[jiraSync] No cloudId in scope config");
      return items;
    }

    const baseUrl = `https://api.atlassian.com/ex/jira/${scopeConfig.cloudId}/rest/api/3`;

    let jql = scopeConfig.jql || "";
    if (scopeConfig.projectKeys && scopeConfig.projectKeys.length > 0) {
      const projectFilter = `project in (${scopeConfig.projectKeys.join(",")})`;
      jql = jql ? `(${jql}) AND ${projectFilter}` : projectFilter;
    }

    if (!jql) {
      jql = "order by updated DESC";
    }

    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const url = `${baseUrl}/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,updated`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }

      const data: JiraSearchResponse = await response.json();

      for (const issue of data.issues) {
        items.push({
          externalId: issue.id,
          title: `${issue.key}: ${issue.fields.summary}`,
          url: `https://atlassian.net/browse/${issue.key}`,
          modifiedAt: new Date(issue.fields.updated),
          contentHash: issue.fields.updated,
        });
      }

      startAt += data.issues.length;
      hasMore = startAt < data.total;
    }

    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log(`[jiraSync] Returning fixture content for ${item.externalId}`);
      return {
        ...item,
        content: `PROJ-123: Implement Login Flow\n\nStatus: In Progress\nPriority: High\nAssignee: Fixture User\n\nDescription:\nUser must be able to login with email/password.\n\nComments:\nfixture-user: This is urgent.`.repeat(20),
        metadata: {
          source: "jira",
          issueKey: "PROJ-123",
          issueType: "Story",
        },
      };
    }

    const scopeConfig = ctx.scope.scopeConfigJson as { cloudId?: string } | null;
    if (!scopeConfig?.cloudId) return null;

    const baseUrl = `https://api.atlassian.com/ex/jira/${scopeConfig.cloudId}/rest/api/3`;
    const url = `${baseUrl}/issue/${item.externalId}?expand=renderedFields&fields=summary,description,issuetype,status,priority,assignee,reporter,labels,comment`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[jiraSync] Failed to fetch issue ${item.externalId}: ${response.status}`);
      return null;
    }

    const issue: JiraIssue = await response.json();

    let content = formatJiraIssue(issue);

    // Sanitize content to prevent prompt injection
    const detection = detectInjection(content);
    const sanitizeResult = sanitizeContent(content, {
      maxLength: 10000,
      sourceType: "jira",
      stripMarkers: true,
    });

    // If highly suspicious, strip suspicious lines
    if (detection.isSuspicious && detection.score >= 20) {
      const stripped = stripSuspiciousLines(sanitizeResult.sanitized, detection);
      content = stripped.cleaned;
    } else {
      content = sanitizeResult.sanitized;
    }

    // Wrap in untrusted context delimiters
    content = wrapUntrustedContent(content, "jira", issue.key);

    return {
      ...item,
      content,
      metadata: {
        source: "jira",
        issueKey: issue.key,
        issueType: issue.fields.issuetype?.name,
        status: issue.fields.status?.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter?.displayName,
        labels: issue.fields.labels,
        injectionDetected: detection.isSuspicious,
        injectionScore: detection.score,
      },
    };
  },
};

function formatJiraIssue(issue: JiraIssue): string {
  const parts: string[] = [];

  parts.push(`# ${issue.key}: ${issue.fields.summary}`);
  parts.push("");

  parts.push(`**Type:** ${issue.fields.issuetype?.name || "Unknown"}`);
  parts.push(`**Status:** ${issue.fields.status?.name || "Unknown"}`);
  if (issue.fields.priority) {
    parts.push(`**Priority:** ${issue.fields.priority.name}`);
  }
  if (issue.fields.assignee) {
    parts.push(`**Assignee:** ${issue.fields.assignee.displayName}`);
  }
  if (issue.fields.reporter) {
    parts.push(`**Reporter:** ${issue.fields.reporter.displayName}`);
  }
  if (issue.fields.labels && issue.fields.labels.length > 0) {
    parts.push(`**Labels:** ${issue.fields.labels.join(", ")}`);
  }
  parts.push("");

  if (issue.fields.description) {
    parts.push("## Description");
    parts.push("");
    parts.push(extractTextFromAdf(issue.fields.description));
    parts.push("");
  }

  if (issue.fields.comment?.comments && issue.fields.comment.comments.length > 0) {
    parts.push("## Comments");
    parts.push("");
    for (const comment of issue.fields.comment.comments) {
      parts.push(`### ${comment.author.displayName} (${comment.created})`);
      parts.push(extractTextFromAdf(comment.body));
      parts.push("");
    }
  }

  return parts.join("\n");
}

function extractTextFromAdf(adfOrString: unknown): string {
  if (typeof adfOrString === "string") {
    return adfOrString;
  }

  if (!adfOrString || typeof adfOrString !== "object") {
    return "";
  }

  const adf = adfOrString as { content?: unknown[] };
  if (!adf.content || !Array.isArray(adf.content)) {
    return "";
  }

  return extractTextFromNodes(adf.content);
}

function extractTextFromNodes(nodes: unknown[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    const n = node as { type?: string; text?: string; content?: unknown[] };

    if (n.type === "text" && n.text) {
      parts.push(n.text);
    } else if (n.content && Array.isArray(n.content)) {
      parts.push(extractTextFromNodes(n.content));
    }
  }

  return parts.join(" ");
}
