import posthog from "posthog-js";
import { isPostHogConfigured } from "@/lib/posthog-client";

/**
 * The typed registry of product-analytics events captured from the browser.
 *
 * One entry per event: the snake_case name PostHog stores and the properties
 * it carries. `track()` only accepts names listed here, with exactly these
 * properties, so the same event can never be sent under two spellings or
 * with a drifting shape.
 *
 * Privacy (see instrumentation-client.ts): ids, enums, counts and durations
 * only. Never a name, email, URL, file name, note text or anything read out
 * of a video — the athletes include minors, and the content stays in
 * Supabase. Events captured before this file existed (`login_completed`,
 * `staff_invite_sent`, …) still call posthog-js directly; move one here when
 * you next touch it.
 */
export type MatchViewSource = "list" | "share_link" | "dashboard";
export type ShareMethod = "copy_link" | "native_share" | "email";

export interface AnalyticsEvents {
  // Match engagement
  match_viewed: {
    match_id: string;
    tab: string;
    source: MatchViewSource | null;
  };
  stat_clicked: { match_id: string; stat_name: string; section: string };
  key_moment_clicked: {
    match_id: string;
    moment_type: string;
    timestamp_sec: number | null;
  };
  video_played: { match_id: string; position_sec: number };
  match_shared: { match_id: string; method: ShareMethod };
  filter_changed: { view: string; filter_name: string; value: string };

  // Upload flow (/dashboard/matches/new)
  upload_started: { provider: string | null };
  video_selected: {
    file_size_mb: number;
    duration_sec: number | null;
    mime_type: string;
  };
  upload_failed: {
    step: string;
    error_message: string;
    file_size_mb: number | null;
  };
  upload_completed: { file_size_mb: number; upload_duration_sec: number };
  match_created: {
    match_id: string | null;
    time_since_upload_started_sec: number | null;
  };

  // Growth funnels. `program_claim_completed`, `invite_accepted` and
  // `analysis_ready` end in a server redirect or a webhook, so they are
  // captured on the server: see analytics-server.ts.
  program_claim_started: { program_id: string };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

/** Capture one registered event. A no-op while PostHog is off. */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!isPostHogConfigured) return;
  posthog.capture(event, properties);
}

/** Bytes → megabytes, two decimals: a size readable on a chart axis. */
export function toMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** Whole seconds since a `performance.now()` / `Date.now()` mark. */
export function secondsSince(startMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.round((nowMs - startMs) / 1000));
}

/**
 * Error text safe to send: the message only, cut short. Upload errors carry
 * Azure SAS URLs (signed credentials) and Supabase detail, so anything that
 * looks like a URL is dropped before it leaves the browser.
 */
export function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown";
  return raw.replace(/https?:\/\/\S+/g, "[url]").slice(0, 200);
}

// -- Navigation ------------------------------------------------------------

let lastDashboardPath: string | null = null;
let previousDashboardPath: string | null = null;

/**
 * Remember each dashboard path visited. Called by `DashboardShell` on every
 * path change. Two are kept because the order is not fixed: a route with a
 * `loading.tsx` commits the new path (and the shell notes it) before the page
 * mounts, while one without lets the page's effect run first.
 */
export function noteDashboardPath(pathname: string): void {
  if (pathname === lastDashboardPath) return;
  previousDashboardPath = lastDashboardPath;
  lastDashboardPath = pathname;
}

/**
 * Where the page at `currentPath` was opened from: the matches list, any
 * other dashboard page, or null for a direct load (a bookmark, a pasted
 * link, a refresh). The share page answers `share_link` itself.
 */
export function matchViewSource(currentPath: string): MatchViewSource | null {
  const origin =
    lastDashboardPath === currentPath
      ? previousDashboardPath
      : lastDashboardPath;
  if (origin == null) return null;
  return /^\/dashboard\/(team\/)?matches\/?$/.test(origin)
    ? "list"
    : "dashboard";
}

// -- Attribution -----------------------------------------------------------

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const UTM_STORAGE_KEY = "adv_first_utm";

/** The UTM parameters on the current URL, each cut to 100 characters. */
function utmsFromLocation(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const found: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) found[key] = value.slice(0, 100);
  }
  return found;
}

/**
 * Keep the first landing's UTM parameters for this browser session, so a
 * visitor who lands on `/?utm_source=…` and signs up three pages later is
 * still attributed. Called once from instrumentation-client.ts.
 */
export function rememberLandingUtms(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(UTM_STORAGE_KEY)) return;
    const found = utmsFromLocation();
    if (Object.keys(found).length > 0) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    // Storage blocked (private mode): attribution is best-effort.
  }
}

/**
 * On sign-up: write the UTM parameters to the person with `$set_once`, so the
 * first campaign that brought them is never overwritten by a later visit.
 * With the new account's id the browser is identified on the spot — the
 * confirmation link may be opened on another device, and an anonymous
 * person's properties would then never meet the account.
 */
export function setSignupAttribution(userId: string | null): void {
  if (!isPostHogConfigured || typeof window === "undefined") return;
  let utms: Record<string, string> = {};
  try {
    utms = utmsFromLocation();
    if (Object.keys(utms).length === 0) {
      utms = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) ?? "{}");
    }
  } catch {
    // Best-effort, as above.
  }
  if (Object.keys(utms).length === 0) return;
  if (userId && posthog.get_distinct_id() !== userId) {
    posthog.identify(userId, undefined, utms);
  } else {
    posthog.setPersonProperties(undefined, utms);
  }
}
