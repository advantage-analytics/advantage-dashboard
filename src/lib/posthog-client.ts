// Client-safe PostHog readiness check — NEXT_PUBLIC_ env vars only, so it is
// safe to import from a "use client" component. Every component that calls
// posthog-js directly reads this instead of re-deriving it.
// instrumentation-client.ts keeps its own read because posthog.init() needs
// the values, not just a boolean; server code uses getPostHogServerConfig()
// in posthog-logs.ts.

export const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);
