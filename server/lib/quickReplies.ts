/**
 * Configurable quick-reply rules for smalltalk/greeting/help messages.
 * Loads from config/quickReplies.json - no hardcoded phrases in business logic.
 */
import { readFileSync } from "fs";
import { join } from "path";

export interface QuickReplyItem {
  label: string;
  text: string;
}

interface QuickReplyRule {
  triggerType: string;
  matchPatterns?: string[];
  maxLength?: number;
  response: string;
  quickReplies: QuickReplyItem[];
}

export const DYNAMIC_GREETING_PLACEHOLDER = "__DYNAMIC_GREETING__";

interface QuickRepliesConfig {
  rules: QuickReplyRule[];
  defaultQuickReplies: QuickReplyItem[];
  greetingTemplate?: string;
  noConnectorsMessage?: string;
  connectorTypeLabels?: Record<string, string>;
  connectorSuggestions?: Record<string, QuickReplyItem[]>;
}

let cachedConfig: QuickRepliesConfig | null = null;

function loadConfig(): QuickRepliesConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const path = join(process.cwd(), "config", "quickReplies.json");
    const raw = readFileSync(path, "utf-8");
    cachedConfig = JSON.parse(raw) as QuickRepliesConfig;
    return cachedConfig!;
  } catch {
    cachedConfig = {
      rules: [],
      defaultQuickReplies: [
        { label: "What can you do?", text: "What can you do?" },
        { label: "Show my portfolio", text: "Show my portfolio" },
      ],
    };
    return cachedConfig;
  }
}

function ruleMatches(rule: QuickReplyRule, message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
  if (rule.maxLength !== undefined && normalized.length <= rule.maxLength) return true;
  if (rule.matchPatterns) {
    for (const p of rule.matchPatterns) {
      try {
        if (new RegExp(p, "i").test(normalized)) return true;
      } catch {
        /* invalid regex, skip */
      }
    }
  }
  return false;
}

export function matchQuickReplyRule(message: string): {
  matched: boolean;
  triggerType?: string;
  response?: string;
  quickReplies?: QuickReplyItem[];
} {
  const config = loadConfig();
  for (const rule of config.rules) {
    if (ruleMatches(rule, message)) {
      return {
        matched: true,
        triggerType: rule.triggerType,
        response: rule.response,
        quickReplies: rule.quickReplies.slice(0, 4),
      };
    }
  }
  return { matched: false };
}

/** Build greeting message with dynamic connector list; used when response is __DYNAMIC_GREETING__. */
export function buildGreetingResponse(
  connectorTypes: string[],
  config: { greetingTemplate?: string; noConnectorsMessage?: string; connectorTypeLabels?: Record<string, string> }
): string {
  const template = config.greetingTemplate ?? "Hello! I'm TracePilot. I search across your connected sources — {connectors}. What would you like to find?";
  const noConnectors = config.noConnectorsMessage ?? "Hello! I'm TracePilot. No sources are connected yet. Connect sources in settings to search your knowledge.";
  const labels = config.connectorTypeLabels ?? { google: "Google Drive", atlassian: "Confluence and Jira", slack: "Slack", upload: "Upload" };
  if (connectorTypes.length === 0) return noConnectors;
  const connectorList = connectorTypes.map((t) => labels[t] ?? t).join(", ");
  return template.replace("{connectors}", connectorList);
}

export function getQuickReplyResponse(message: string): {
  response: string;
  quickReplies: QuickReplyItem[];
  triggerType?: string;
} {
  const config = loadConfig();
  const match = matchQuickReplyRule(message);
  if (match.matched && match.response && match.quickReplies) {
    return {
      response: match.response,
      quickReplies: match.quickReplies,
      triggerType: match.triggerType,
    };
  }
  return {
    response: "Hello! How can I help you today?",
    quickReplies: config.defaultQuickReplies.slice(0, 4),
  };
}

/** Get config for dynamic greeting (template, noConnectorsMessage, connectorTypeLabels). */
export function getGreetingConfig(): Pick<QuickRepliesConfig, "greetingTemplate" | "noConnectorsMessage" | "connectorTypeLabels"> {
  const config = loadConfig();
  return {
    greetingTemplate: config.greetingTemplate,
    noConnectorsMessage: config.noConnectorsMessage,
    connectorTypeLabels: config.connectorTypeLabels,
  };
}

/** Suggestions for active connector types only; falls back to default when none. No hardcoded text — all from config. */
export function getSuggestionsForActiveConnectors(connectorTypes: string[]): QuickReplyItem[] {
  const config = loadConfig();
  const map = config.connectorSuggestions ?? {};
  const defaultList = map.default ?? config.defaultQuickReplies;
  if (connectorTypes.length === 0) return defaultList.slice(0, 4);
  const seen = new Set<string>();
  const out: QuickReplyItem[] = [];
  for (const t of connectorTypes) {
    const list = map[t];
    if (!list) continue;
    for (const item of list) {
      if (seen.has(item.text)) continue;
      seen.add(item.text);
      out.push(item);
      if (out.length >= 4) return out;
    }
  }
  if (out.length === 0) return defaultList.slice(0, 4);
  return out;
}
