import { SeverityNumber } from "@opentelemetry/api-logs";
import { isPostHogOffInDev } from "@/lib/posthog-client";

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
 *
 * Null under `next dev`, and for a production build run outside Vercel,
 * unless NEXT_PUBLIC_POSTHOG_IN_DEV=true — see isPostHogOffInDev and
 * isLocalProductionServer.
 */
export function getPostHogServerConfig(): {
  token: string;
  host: string;
} | null {
  if (isPostHogOffInDev || isLocalProductionServer()) return null;
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  return token && host ? { token, host } : null;
}

/**
 * `next build && next start` on a laptop or in an agent sandbox runs with
 * NODE_ENV=production, so isPostHogOffInDev does not catch it — yet it shares
 * the production project, and its server errors carry no hostname for the
 * localhost test-account filter to match. PostHog issue 01a19a80 was four of
 * them: a throwaway `/zz-action-check` Server Action, thrown on purpose against
 * a local build, filed as a high-severity production TypeError. Vercel sets
 * VERCEL=1 at runtime on every deployment (production and previews), so only
 * those report; NEXT_PUBLIC_POSTHOG_IN_DEV=true opts a local build back in.
 * Server-only: browser errors carry a localhost $current_url the filter hides.
 */
export function isLocalProductionServer(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.NODE_ENV === "production" &&
    !env.VERCEL &&
    env.NEXT_PUBLIC_POSTHOG_IN_DEV !== "true"
  );
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
