import { after } from "next/server";
import {
  flushPostHogLogs,
  isPostHogLoggingEnabled,
  logPostHog,
  type LogAttributes,
  type LogLevel,
} from "@/lib/posthog-logs";

/**
 * Console logging for the Advantage Intelligence pipeline, mirrored to PostHog
 * Logs so a stuck job or a failed delivery can be followed by `jobId` /
 * `matchId` without opening Vercel's runtime logs.
 *
 * The console line is exactly what `console.log|warn|error(message, detail)`
 * printed before — Vercel's logs are unchanged. Only the PostHog copy is
 * filtered: those logs are kept longer and read by more people, and the
 * pipeline handles credentials that must not end up there. Vendor payloads
 * carry signed result URLs and the upload flow mints SAS links, so:
 *
 * - `body` attributes (the raw webhook delivery, the vendor's raw response)
 *   are dropped outright;
 * - any string that contains a URL or a `sig=` is redacted;
 * - objects are flattened to truncated JSON, redacted the same way.
 */

const DROPPED_KEYS = new Set(["body", "rawBody"]);
const MAX_VALUE_LENGTH = 500;
const SENSITIVE = /https?:\/\/|[?&]sig=/i;

function safeString(value: string): string {
  if (SENSITIVE.test(value)) return "[redacted]";
  return value.length > MAX_VALUE_LENGTH
    ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
    : value;
}

function toAttribute(value: unknown): string | number | boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return safeString(value);
  if (value instanceof Error) return safeString(value.message);
  try {
    return safeString(JSON.stringify(value));
  } catch {
    return safeString(String(value));
  }
}

function toAttributes(message: string, detail: unknown): LogAttributes {
  const attributes: LogAttributes = {};
  // "[splitstep-webhook] received" → scope "splitstep-webhook", filterable.
  const scope = /^\[([^\]]+)\]/.exec(message)?.[1];
  if (scope) attributes.scope = scope;

  if (detail instanceof Error) {
    attributes.error = safeString(detail.message);
  } else if (detail !== null && typeof detail === "object") {
    for (const [key, value] of Object.entries(detail)) {
      if (DROPPED_KEYS.has(key)) continue;
      const attribute = toAttribute(value);
      if (attribute !== undefined) attributes[key] = attribute;
    }
  } else if (detail !== undefined) {
    const attribute = toAttribute(detail);
    if (attribute !== undefined) attributes.detail = attribute;
  }
  return attributes;
}

const CONSOLE: Record<LogLevel, (...args: unknown[]) => void> = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

function write(level: LogLevel, message: string, ...detail: unknown[]) {
  CONSOLE[level](message, ...detail);

  if (!isPostHogLoggingEnabled()) return;
  logPostHog(level, safeString(message), toAttributes(message, detail[0]));
  // The batch processor exports on a timer a serverless function may not live
  // to see. Outside a request scope (a script, a test) after() throws, and the
  // timer is all there is.
  try {
    after(flushPostHogLogs);
  } catch {
    // not in a request
  }
}

export const pipelineLog = {
  info: (message: string, ...detail: unknown[]) =>
    write("info", message, ...detail),
  warn: (message: string, ...detail: unknown[]) =>
    write("warn", message, ...detail),
  error: (message: string, ...detail: unknown[]) =>
    write("error", message, ...detail),
};
