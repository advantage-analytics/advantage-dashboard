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
 * Maximum accepted video size — the largest file we will take, in bytes.
 *
 * The vendor's published API docs now state a limit of "less than 8,000,000,000
 * bytes", marked "Enforced". That supersedes the earlier verbal "5 GB is soft,
 * negotiable to 10–12 GB", which this constant was set from and which nobody has
 * re-confirmed since the docs were published.
 *
 * We take the documented number because the two failure modes are not
 * symmetric. Too low rejects at the file picker: instant, legible, recoverable.
 * Too high lets someone spend an hour uploading a file the vendor refuses at
 * submit — after we have already paid to store it. Ask before raising it back.
 *
 * Note the units. The vendor's bound is decimal and exclusive, so this is
 * 8e9 - 1 and NOT `8 * 1024 ** 3` (8.59e9, which would exceed it by 7%).
 *
 * Unrelated to `MAX_COMPRESS_SIZE` in src/lib/video/compress.ts (2 GB) — that
 * governs the ffmpeg.wasm path, which SplitStep uploads never take.
 */
export const MAX_VIDEO_SIZE_BYTES = 8_000_000_000 - 1;

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
 * and one that gets worse precisely as volume grows. Too short and the cost is
 * a dead job we notice only via a free-text error string.
 *
 * This was 30 days under the Worker, where the number cost nothing: any URL
 * could be killed on demand, so a long expiry was headroom rather than
 * exposure. A SAS cannot be withdrawn (see video-url/azure-sas.ts), which makes
 * the TTL the exposure, not a ceiling above it.
 *
 * 14 days is the compromise: still several times any queue wait observed, but
 * half the window in which a leaked URL reads someone's match video. The
 * shorter real bound is deleting the blob once results are stored, which the
 * webhook now does — expiry is the backstop for jobs that never complete.
 *
 * Do not read the old rationale here as still applying: it argued this could
 * not have been a presigned URL because SigV4 caps expiry at 7 days. Azure SAS
 * has no equivalent ceiling, so nothing about this number is forced.
 */
export const VENDOR_URL_TTL_SECONDS = 14 * 24 * 60 * 60;

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

/**
 * Supabase Storage bucket holding raw vendor results JSON.
 *
 * Named here rather than in each caller because the webhook writes it and the
 * verification script reads it — two places that must agree, with nothing but a
 * human enforcing it. Same failure shape as the R2 bucket name in §2.3 of the
 * handoff: one string, two systems, silent drift.
 */
export const RESULTS_BUCKET = 'match-results';

/** Path the vendor POSTs job status to. */
export const WEBHOOK_PATH = '/api/webhooks/splitstep';

/**
 * Absolute URL the vendor POSTs results to, or null when this deployment
 * cannot receive them.
 *
 * Built from NEXT_PUBLIC_SITE_URL — the variable that already answers "where
 * is this deployment publicly reachable", used by `metadataBase` in
 * app/layout.tsx and by the Stripe checkout redirect. The webhook asks the
 * same question, so it reads the same answer rather than introducing a second
 * origin variable that could disagree with the first.
 *
 * IMPORTANT: it must be set PER ENVIRONMENT in Vercel. A single value shared
 * by Production and Preview means a preview deployment hands the vendor the
 * production origin, where this route does not exist — the POST 404s, and
 * nothing on either side looks wrong.
 *
 * Null for unset and for localhost alike: the vendor calls from outside, so a
 * loopback origin is not a degraded webhook, it is no webhook. Returning null
 * rather than throwing lets the caller pick the status code — a submission
 * refuses with 503, a script prints a readable message.
 */
export function resolveWebhookUrl(
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL
): string | null {
  if (!siteUrl) return null;

  const origin = siteUrl.replace(/\/+$/, '');
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return null;

  return `${origin}${WEBHOOK_PATH}`;
}
