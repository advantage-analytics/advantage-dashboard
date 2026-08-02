/**
 * SplitStep integration — tunable constants.
 *
 * Every threshold and cap for the video-analysis pipeline lives here so there is
 * exactly one place to edit when a limit is renegotiated or a new account tier
 * is introduced. Do not inline these values at call sites.
 *
 * Internally this provider is `splitstep`. In every user-visible string it is
 * "Advantage Intelligence" — see PROVIDER_DISPLAY_NAME.
 */

/** User-facing provider name. Never surface the vendor's name in the UI. */
export const PROVIDER_DISPLAY_NAME = 'Advantage Intelligence';

/** Internal provider identifier — matches `matches.source_provider`. */
export const PROVIDER_ID = 'splitstep' as const;

// ---------------------------------------------------------------------------
// Video requirements
// ---------------------------------------------------------------------------

/**
 * Maximum accepted video size.
 *
 * The vendor documents "less than 5 GB", but that ceiling is soft and has been
 * confirmed negotiable to 10–12 GB. We accept up to 12 GB; raise or lower this
 * single constant if the agreement changes.
 *
 * Unrelated to `MAX_COMPRESS_SIZE` in src/lib/video/compress.ts (2 GB) — that
 * governs the ffmpeg.wasm path, which SplitStep uploads never take.
 */
export const MAX_VIDEO_SIZE_BYTES = 12 * 1024 * 1024 * 1024;

/**
 * Resolution floor. Hard — this is a model constraint, not a policy one, and
 * the vendor rejects below it.
 */
export const MIN_VIDEO_WIDTH = 1920;
export const MIN_VIDEO_HEIGHT = 1080;

/** Frame-rate floor. Hard, same reason as resolution. */
export const MIN_VIDEO_FPS = 30;

/** Vendor's recommended frame rate. Below this we warn but do not block. */
export const RECOMMENDED_VIDEO_FPS = 60;

/** Accepted containers. MP4 (H.264) is the vendor's preferred format. */
export const ACCEPTED_VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const;
export const ACCEPTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
] as const;

/**
 * Shortest clip we will accept. A trim window under this can't contain a
 * meaningful amount of play, and is nearly always a mis-set trim handle.
 */
export const MIN_TRIM_DURATION_SECONDS = 60;

// ---------------------------------------------------------------------------
// Processing quota
// ---------------------------------------------------------------------------

/**
 * Pilot caps, per calendar month (UTC). Free through 31 December 2026.
 *
 * There is no `programs` table yet, so every account is currently 'individual'.
 * Callers must go through getMonthlyCapSeconds() rather than reading these
 * directly — that keeps the collegiate tier a code change, not a migration.
 */
export type AccountType = 'individual' | 'program';

const MONTHLY_CAP_HOURS: Record<AccountType, number> = {
  individual: 2,
  program: 75,
};

/** Monthly processing allowance, in seconds, for an account tier. */
export function getMonthlyCapSeconds(accountType: AccountType): number {
  return MONTHLY_CAP_HOURS[accountType] * 60 * 60;
}

/** First of the current month, UTC — the `processing_usage.billing_month` key. */
export function currentBillingMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}
