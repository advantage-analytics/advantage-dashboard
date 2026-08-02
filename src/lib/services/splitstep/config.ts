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
// Vendor video access
// ---------------------------------------------------------------------------

/**
 * How long a vendor-facing video URL stays valid.
 *
 * The vendor fetches the video when a worker picks the job up, not at submit,
 * and they declined to bound the queue wait — on the pilot call they said a
 * 72-hour window was fine "in the Pilot, it depends how many videos we send",
 * with no committed date. So the URL has to outlive a wait we cannot predict,
 * and one that gets worse precisely as volume grows.
 *
 * 30 days is deliberately far past anything observed. It is not an estimate of
 * the queue — it is headroom, because the cost of being wrong is a dead job we
 * only notice via a free-text error string (§5 Q7).
 *
 * A presigned URL could not have been set this long: SigV4 caps expiry at 7
 * days. Nothing here would fit inside that ceiling with room to spare.
 *
 * The real lifetime is shorter than this in practice — revoke the token once
 * the job reaches a terminal state rather than letting it idle to expiry.
 */
export const VENDOR_URL_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Flag a job whose video the vendor has never fetched this long after submit.
 *
 * Not a failure on its own — it means the job is still sitting in their queue,
 * which is legitimate. It is the threshold past which silence stops being
 * normal and someone should ask them.
 */
export const VENDOR_DOWNLOAD_STALL_SECONDS = 72 * 60 * 60;

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
