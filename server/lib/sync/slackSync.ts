import type { SyncContext, SyncEngine, SyncableItem, SyncableContent } from "./types";
import { sanitizeContent, wrapUntrustedContent } from "../safety/sanitize";
import { detectInjection, stripSuspiciousLines } from "../safety/detector";

interface SlackMessage {
  ts: string;
  text: string;
  user?: string;
  username?: string;
  thread_ts?: string;
  reply_count?: number;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
}

interface SlackConversationHistory {
  ok: boolean;
  messages: SlackMessage[];
  has_more: boolean;
  response_metadata?: {
    next_cursor?: string;
  };
}

export const slackSyncEngine: SyncEngine = {
  name: "slack",

  async fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log("[slackSync] Returning fixture metadata");
      return [
        {
          externalId: "C12345678",
          title: "#general",
          mimeType: "text/plain",
          metadata: {
            channelName: "general",
            is_private: false,
          },
        }
      ];
    }

    const items: SyncableItem[] = [];
    const scopeConfig = ctx.scope.scopeConfigJson as {
      channelIds?: string[];
      startDate?: string;
      includeThreads?: boolean;
    } | null;

    if (!scopeConfig?.channelIds || scopeConfig.channelIds.length === 0) {
      console.error("[slackSync] No channelIds in scope config");
      return items;
    }

    const channelInfo = await fetchChannelInfo(ctx.accessToken, scopeConfig.channelIds);

    // Filter out private channels and create audit events for skipped ones
    for (const channel of channelInfo) {
      if (channel.is_private) {
        console.warn(`[slackSync] Skipping private channel ${channel.id} (${channel.name})`);

        // Create audit event for skipped private channel
        const { storage } = await import("../../storage");
        await storage.createAuditEvent({
          requestId: ctx.scope.id, // Use scope ID as request ID for sync events
          kind: "slack_private_channel_skipped",
          userId: ctx.userId,
          success: true,
          responseJson: {
            channelId: channel.id,
            channelName: channel.name,
            reason: "Private channels cannot be indexed as workspace knowledge",
          },
        });
        continue; // Skip private channels
      }

      items.push({
        externalId: channel.id,
        title: `#${channel.name}`,
        mimeType: "text/plain",
        metadata: {
          channelName: channel.name,
          is_private: false, // Only public channels reach here
        },
      });
    }

    console.log(`[slackSync] Found ${items.length} public channels to sync (filtered out ${channelInfo.length - items.length} private channels)`);
    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log(`[slackSync] Returning fixture content for ${item.externalId}`);
      const latestTs = (Date.now() / 1000).toString();
      return {
        ...item,
        content: `# Slack Channel: ${item.title}\n\nMessages: 2\n\n## ${new Date().toISOString().split('T')[0]}\n\n**fixture.user** (12:00): Hello world\n**fixture.bot** (12:01): This is a fixture message.`,
        contentHash: latestTs,
        metadata: {
          source: "slack",
          channelId: item.externalId,
          channelName: item.metadata?.channelName || "general",
          is_private: false,
          messageCount: 2,
          latestMessageTs: latestTs,
        },
      };
    }

    const scopeConfig = ctx.scope.scopeConfigJson as {
      startDate?: string;
      includeThreads?: boolean;
    } | null;

    try {
      const oldest = scopeConfig?.startDate
        ? (new Date(scopeConfig.startDate).getTime() / 1000).toString()
        : undefined;

      const messages = await fetchChannelMessages(
        ctx.accessToken,
        item.externalId,
        oldest,
        scopeConfig?.includeThreads ?? true
      );

      if (messages.length === 0) {
        return null;
      }

      const userIds = new Set<string>();
      for (const msg of messages) {
        if (msg.user) userIds.add(msg.user);
      }

      const userMap = await fetchUserNames(ctx.accessToken, Array.from(userIds));

      let content = formatSlackMessages(item.title, messages, userMap);

      // Sanitize content to prevent prompt injection
      const detection = detectInjection(content);
      const sanitizeResult = sanitizeContent(content, {
        maxLength: 10000,
        sourceType: "slack",
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
      content = wrapUntrustedContent(content, "slack", item.externalId);

      const latestTs = messages.reduce((max, msg) =>
        parseFloat(msg.ts) > parseFloat(max) ? msg.ts : max,
        messages[0].ts
      );

      return {
        ...item,
        content,
        contentHash: latestTs,
        metadata: {
          source: "slack",
          channelId: item.externalId,
          channelName: item.metadata?.channelName || item.title.replace('#', ''),
          is_private: false, // Enforced: only public channels
          messageCount: messages.length,
          latestMessageTs: latestTs,
          injectionDetected: detection.isSuspicious,
          injectionScore: detection.score,
        },
      };
    } catch (error) {
      console.error(`[slackSync] Error fetching channel ${item.externalId}:`, error);
      return null;
    }
  },
};

async function fetchChannelInfo(accessToken: string, channelIds: string[]): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];

  for (const channelId of channelIds) {
    const url = `https://slack.com/api/conversations.info?channel=${channelId}`;

    if (process.env.PROOF_FIXTURES === "1") {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const fixturePath = path.resolve(process.cwd(), "proof/fixtures/slack_channel_info.json");
        const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        if (data.ok && data.channel) {
          channels.push({
            id: data.channel.id, // Use fixture ID, or override if needed? No, use fixture.
            name: data.channel.name,
            is_private: data.channel.is_private,
          });
        }
        continue;
      } catch (e) {
        console.error("Proof fixture error:", e);
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`[slackSync] Failed to fetch channel info ${channelId}: ${response.status}`);
      continue;
    }

    const data = await response.json();
    if (data.ok && data.channel) {
      channels.push({
        id: data.channel.id,
        name: data.channel.name,
        is_private: data.channel.is_private,
      });
    }
  }

  return channels;
}

async function fetchChannelMessages(
  accessToken: string,
  channelId: string,
  oldest?: string,
  includeThreads = true
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  const limit = 200;

  do {
    let url = `https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`;
    if (oldest) url += `&oldest=${oldest}`;
    if (cursor) url += `&cursor=${cursor}`;

    if (process.env.PROOF_FIXTURES === "1") {
      try {
        const fs = await import("fs");
        const path = await import("path");
        // Only return messages on first page, then stop
        if (cursor) {
          return messages;
        }
        const fixturePath = path.resolve(process.cwd(), "proof/fixtures/slack_messages.json");
        const data: SlackConversationHistory = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

        // For incremental sync proof: check if we should verify idempotency.
        // But here we just return the fixture. Ideally fixture has stable IDs.

        for (const msg of data.messages) {
          messages.push(msg);
          if (includeThreads && msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
            const replies = await fetchThreadReplies(accessToken, channelId, msg.thread_ts);
            for (const reply of replies) {
              if (reply.ts !== msg.ts) {
                messages.push(reply);
              }
            }
          }
        }
        return messages;
      } catch (e) {
        console.error("Proof fixture error:", e);
        return [];
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    const data: SlackConversationHistory = await response.json();
    if (!data.ok) {
      throw new Error("Slack API returned error");
    }

    for (const msg of data.messages) {
      messages.push(msg);

      if (includeThreads && msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
        const replies = await fetchThreadReplies(accessToken, channelId, msg.thread_ts);
        for (const reply of replies) {
          if (reply.ts !== msg.ts) {
            messages.push(reply);
          }
        }
      }
    }

    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  return messages;
}

async function fetchThreadReplies(
  accessToken: string,
  channelId: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const replies: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    let url = `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=200`;
    if (cursor) url += `&cursor=${cursor}`;

    if (process.env.PROOF_FIXTURES === "1") {
      try {
        const fs = await import("fs");
        const path = await import("path");
        if (cursor) break; // One page
        const fixturePath = path.resolve(process.cwd(), "proof/fixtures/slack_replies.json");
        const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        if (data.ok) {
          replies.push(...data.messages);
        }
        break;
      } catch (e) { console.error(e); break; }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      break;
    }

    const data = await response.json();
    if (!data.ok) {
      break;
    }

    replies.push(...data.messages);
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return replies;
}

async function fetchUserNames(
  accessToken: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();

  for (const userId of userIds.slice(0, 100)) {
    const url = `https://slack.com/api/users.info?user=${userId}`;

    if (process.env.PROOF_FIXTURES === "1") {
      // Simple mock for any user
      userMap.set(userId, `Proof User ${userId}`);
      continue;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) continue;

    const data = await response.json();
    if (data.ok && data.user) {
      userMap.set(userId, data.user.real_name || data.user.name || userId);
    }
  }

  return userMap;
}

function formatSlackMessages(
  channelName: string,
  messages: SlackMessage[],
  userMap: Map<string, string>
): string {
  const parts: string[] = [];

  parts.push(`# Slack Channel: ${channelName}`);
  parts.push("");
  parts.push(`Messages: ${messages.length}`);
  parts.push("");

  let currentDate = "";

  for (const msg of messages) {
    const timestamp = new Date(parseFloat(msg.ts) * 1000);
    const dateStr = timestamp.toISOString().split("T")[0];
    const timeStr = timestamp.toISOString().split("T")[1].substring(0, 5);

    if (dateStr !== currentDate) {
      currentDate = dateStr;
      parts.push("");
      parts.push(`## ${dateStr}`);
      parts.push("");
    }

    const userName = msg.user
      ? userMap.get(msg.user) || msg.username || msg.user
      : msg.username || "Unknown";

    const isReply = msg.thread_ts && msg.thread_ts !== msg.ts;
    const prefix = isReply ? "  > " : "";

    parts.push(`${prefix}**${userName}** (${timeStr}): ${msg.text}`);
  }

  return parts.join("\n");
}
