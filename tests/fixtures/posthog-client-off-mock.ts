/**
 * `src/lib/posthog-client.ts` for a plain webpack browser bundle: the real
 * module reads `process.env`, which only Next substitutes, so an unaliased
 * import throws before the harness hydrates. PostHog stays off — the
 * harnesses that alias this assert UI, not analytics.
 */
export const isPostHogOffInDev = true;
export const isPostHogConfigured = false;
