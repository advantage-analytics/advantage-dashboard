import {
  flushPostHogAfterResponse,
  getPostHogServerClient,
} from "@/lib/llm/adapter";

/**
 * The typed registry of product-analytics events captured on the SERVER —
 * the twin of `analytics.ts`, for moments no browser witnesses (a vendor
 * webhook finishing an analysis) or that end in a server redirect before the
 * client could report them (a claim confirmed from an email link, an invite
 * accepted). Same naming and the same privacy rule: ids, enums and numbers.
 *
 * The client is the one posthog-node instance the LLM adapter already keeps
 * (`getPostHogServerClient`), flushed after the response. Null — and so
 * silent — under `next dev`, on a local production build and without the
 * PostHog env pair. Never throws: analytics must not fail a webhook.
 */
export interface ServerAnalyticsEvents {
  analysis_ready: {
    match_id: string;
    job_id: string;
    processing_duration_sec: number | null;
  };
  program_claim_completed: { program_id: string };
  invite_accepted: { inviter_role: string | null; program_id: string };
}

export function trackServer<E extends keyof ServerAnalyticsEvents>(
  distinctId: string,
  event: E,
  properties: ServerAnalyticsEvents[E],
): void {
  try {
    const posthog = getPostHogServerClient();
    if (!posthog) return;
    posthog.capture({ distinctId, event, properties });
    flushPostHogAfterResponse(posthog);
  } catch (error) {
    console.warn("[analytics] could not capture", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
