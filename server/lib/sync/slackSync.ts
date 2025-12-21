import type { SyncContext, SyncEngine, SyncableItem, SyncableContent } from "./types";

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

    for (const channel of channelInfo) {
      items.push({
        externalId: channel.id,
        title: `#${channel.name}`,
        mimeType: "text/plain",
      });
    }

    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
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

      const content = formatSlackMessages(item.title, messages, userMap);

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
          messageCount: messages.length,
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
