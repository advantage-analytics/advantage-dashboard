import { SeverityNumber } from "@opentelemetry/api-logs";

// The provider is created by register() in the root instrumentation.ts and
// published on globalThis — importing it from that file would get a separate,
// never-registered copy. Unset (no token, or edge runtime) makes every call
// here a no-op.

export type LogAttributes = Record<string, string | number | boolean>;

const loggerName = "posthog-export";

const SEVERITY_NUMBER: Record<LogLevel, SeverityNumber> = {
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export type LogLevel = "info" | "warn" | "error";

/**
 * The two PostHog env vars, shared by every server-side reader
 * (instrumentation.ts's onRequestError and register(), the LLM adapter's
 * observability client) so a renamed or missing var breaks in one place, not
 * three. Client components read the client-safe equivalent in
 * src/lib/posthog-client.ts instead — different module on purpose, since
 * NEXT_PUBLIC_ vars are the only thing safe to import into a browser bundle,
 * and this one is imported by server-only files.
 */
export function getPostHogServerConfig(): {
  token: string;
  host: string;
} | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  return token && host ? { token, host } : null;
}

export function isPostHogLoggingEnabled(): boolean {
  return globalThis.__posthogLogProvider !== undefined;
}

export function logPostHog(
  level: LogLevel,
  body: string,
  attributes: LogAttributes,
) {
  globalThis.__posthogLogProvider?.getLogger(loggerName).emit({
    body,
    severityNumber: SEVERITY_NUMBER[level],
    severityText: level.toUpperCase(),
    attributes,
  });
}

export async function flushPostHogLogs() {
  await globalThis.__posthogLogProvider?.forceFlush();
}
