/**
 * Structured logger for observability
 * Outputs JSON-formatted logs for easy parsing
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  route?: string;
  traceId?: string;
  conversationId?: string;
  userId?: number;
  latencyMs?: number;
  status?: number;
  error?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog("debug")) {
      console.log(formatLog("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog("info")) {
      console.log(formatLog("info", message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog("warn")) {
      console.warn(formatLog("warn", message, context));
    }
  },

  error(message: string, context?: LogContext): void {
    if (shouldLog("error")) {
      console.error(formatLog("error", message, context));
    }
  },
};

export default logger;
