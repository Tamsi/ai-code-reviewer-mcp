/**
 * Minimal logger that writes to stderr.
 *
 * On a stdio MCP transport, stdout is reserved for the JSON-RPC protocol, so any
 * diagnostic output MUST go to stderr to avoid corrupting the message stream.
 */

type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? order.info;

function emit(level: Level, message: string, meta?: unknown): void {
  if (order[level] < threshold) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] ai-code-reviewer:`;
  if (meta !== undefined) {
    process.stderr.write(`${prefix} ${message} ${safeStringify(meta)}\n`);
  } else {
    process.stderr.write(`${prefix} ${message}\n`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit("debug", message, meta),
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};
