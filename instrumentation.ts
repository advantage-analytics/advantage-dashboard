import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { Instrumentation } from "next";
import type { PostHog } from "posthog-node";
import { getPostHogServerConfig } from "@/lib/posthog-logs";

// Next compiles this file as its own entry, so a module-level export here is a
// different instance from the one a route handler would import — register()
// never runs on the route's copy and the provider stays null. The provider is
// handed over on globalThis instead; src/lib/posthog-logs.ts reads it there.
declare global {
  var __posthogLogProvider: LoggerProvider | undefined;
  var __posthogErrorClient: PostHog | undefined;
}

/**
 * posthog-js keeps its identity in `ph_<token>_posthog`, a URL-encoded JSON
 * cookie. Reading it links a server error to the browser session that caused
 * it; without one the exception is still captured, just personless.
 */
function distinctIdFromCookie(
  cookieHeader: string | string[] | undefined,
  token: string,
): string | undefined {
  const header = Array.isArray(cookieHeader)
    ? cookieHeader.join("; ")
    : cookieHeader;
  if (!header) return undefined;
  const name = `ph_${token}_posthog=`;
  const raw = header
    .split(/;\s*/)
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  if (!raw) return undefined;
  try {
    const id = JSON.parse(decodeURIComponent(raw))?.distinct_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Anything a Server Component, Route Handler, Server Action or the proxy
 * throws lands in PostHog error tracking with the route that threw it. Errors
 * a route catches and answers with its own 500 never reach this hook — the
 * video pipeline's are logged through src/lib/services/splitstep/pipeline-log.ts.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const config = getPostHogServerConfig();
  if (!config) return;
  const { token, host } = config;

  try {
    const { PostHog } = await import("posthog-node");
    globalThis.__posthogErrorClient ??= new PostHog(token, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
    await globalThis.__posthogErrorClient.captureExceptionImmediate(
      error,
      distinctIdFromCookie(request.headers.cookie, token),
      {
        // The query string is dropped: auth links carry one-time tokens in it.
        $pathname: request.path.split("?")[0],
        method: request.method,
        route_path: context.routePath,
        route_type: context.routeType,
        router_kind: context.routerKind,
      },
    );
  } catch (captureError) {
    // Reporting must never become a second failure on an already-failed request.
    console.error("[posthog] could not capture server error", captureError);
  }
};

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Optional, like every analytics key in .env.example: a checkout without it
  // boots with PostHog off. Only the Supabase keys are needed to start.
  const config = getPostHogServerConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[posthog] PostHog is off: set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST to enable it (see .env.example).",
      );
    }
    return;
  }
  const { token, host } = config;

  globalThis.__posthogLogProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "advantage-dashboard",
    }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${host}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ],
  });
}
