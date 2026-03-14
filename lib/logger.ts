/**
 * Structured logging utility for server-side code
 *
 * Provides consistent log formatting with context for debugging and monitoring.
 * In production, logs are JSON-formatted for easy parsing by log aggregators.
 */

// ============================================
// Types
// ============================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  // Request context
  requestId?: string;
  userId?: string;

  // Resource context
  conversationId?: string;
  runId?: string;
  model?: string;

  // Performance
  durationMs?: number;

  // Additional context
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ============================================
// Configuration
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ============================================
// Logger Implementation
// ============================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatError(error: unknown): LogEntry["error"] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: IS_PRODUCTION ? undefined : error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = formatError(error);
  }

  return entry;
}

function outputLog(entry: LogEntry): void {
  if (IS_PRODUCTION) {
    // JSON format for production (easier to parse)
    const output = JSON.stringify(entry);

    switch (entry.level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  } else {
    // Human-readable format for development
    const prefix = `[${entry.timestamp.split("T")[1].split(".")[0]}] [${entry.level.toUpperCase()}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";

    switch (entry.level) {
      case "error":
        console.error(`${prefix} ${entry.message}${contextStr}`);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
      case "warn":
        console.warn(`${prefix} ${entry.message}${contextStr}`);
        break;
      case "debug":
        console.debug(`${prefix} ${entry.message}${contextStr}`);
        break;
      default:
        console.log(`${prefix} ${entry.message}${contextStr}`);
    }
  }
}

// ============================================
// Public API
// ============================================

/**
 * Log a debug message (development only)
 */
export function debug(message: string, context?: LogContext): void {
  if (!shouldLog("debug")) return;
  outputLog(formatLogEntry("debug", message, context));
}

/**
 * Log an info message
 */
export function info(message: string, context?: LogContext): void {
  if (!shouldLog("info")) return;
  outputLog(formatLogEntry("info", message, context));
}

/**
 * Log a warning message
 */
export function warn(message: string, context?: LogContext): void {
  if (!shouldLog("warn")) return;
  outputLog(formatLogEntry("warn", message, context));
}

/**
 * Log an error message
 */
export function error(
  message: string,
  err?: unknown,
  context?: LogContext,
): void {
  if (!shouldLog("error")) return;
  outputLog(formatLogEntry("error", message, context, err));
}

/**
 * Create a child logger with preset context
 * Useful for request-scoped logging
 */
export function createLogger(baseContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      warn(message, { ...baseContext, ...context }),
    error: (message: string, err?: unknown, context?: LogContext) =>
      error(message, err, { ...baseContext, ...context }),
  };
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(requestId: string, userId?: string) {
  return createLogger({ requestId, userId });
}

// Default export for convenience
const logger = {
  debug,
  info,
  warn,
  error,
  createLogger,
  createRequestLogger,
};

export default logger;
