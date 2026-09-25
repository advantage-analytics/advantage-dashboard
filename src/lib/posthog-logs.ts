import { SeverityNumber } from "@opentelemetry/api-logs";

// The provider is created by register() in the root instrumentation.ts and
// published on globalThis — importing it from that file would get a separate,
// never-registered copy. Unset (no token, or edge runtime) makes every call
// here a no-op.

export type LogAttributes = Record<string, string | number | boolean>;

const loggerName = "posthog-export";

const SEVERITY = {
  info: [SeverityNumber.INFO, "INFO"],
  warn: [SeverityNumber.WARN, "WARN"],
  error: [SeverityNumber.ERROR, "ERROR"],
} as const;

export type LogLevel = keyof typeof SEVERITY;

export function isPostHogLoggingEnabled(): boolean {
  return globalThis.__posthogLogProvider !== undefined;
}

export function logPostHog(
  level: LogLevel,
  body: string,
  attributes: LogAttributes,
) {
  const [severityNumber, severityText] = SEVERITY[level];
  globalThis.__posthogLogProvider?.getLogger(loggerName).emit({
    body,
    severityNumber,
    severityText,
    attributes,
  });
}

export function logPostHogInfo(body: string, attributes: LogAttributes) {
  logPostHog("info", body, attributes);
}

export function logPostHogError(body: string, attributes: LogAttributes) {
  logPostHog("error", body, attributes);
}

export async function flushPostHogLogs() {
  await globalThis.__posthogLogProvider?.forceFlush();
}
