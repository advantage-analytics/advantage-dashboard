// Client-safe PostHog readiness check — NEXT_PUBLIC_ env vars only, so it is
// safe to import from a "use client" component. Every component that calls
// posthog-js directly reads this instead of re-deriving it.
// instrumentation-client.ts keeps its own read because posthog.init() needs
// the values, not just a boolean; server code uses getPostHogServerConfig()
// in posthog-logs.ts. Both honour isPostHogOffInDev below.

/**
 * `next dev` sends nothing to PostHog unless NEXT_PUBLIC_POSTHOG_IN_DEV=true.
 *
 * Local and production share one project, and the server half of a dev error
 * carries no hostname — so the project's localhost test-account filter cannot
 * hide it. Before this, every half-saved edit's `X is not defined` landed in
 * error tracking as a production issue. Previews and production build with
 * NODE_ENV=production and are unaffected.
 */
export const isPostHogOffInDev =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_POSTHOG_IN_DEV !== "true";

export const isPostHogConfigured =
  !isPostHogOffInDev &&
  Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
    process.env.NEXT_PUBLIC_POSTHOG_HOST,
  );
