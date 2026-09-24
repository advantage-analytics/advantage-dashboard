/**
 * When an unwatched match video expires (SwingVision Add video T8).
 *
 * The clock is `coalesce(last_viewed_at, activated_at)` — exactly the
 * expression `supabase/migrations/20260924140000_match_video_last_viewed.sql`
 * documents. A view (the player's first `play` of a loaded source, POSTed to
 * `/api/matches/[matchId]/video/viewed`) restarts it; nothing else does.
 * `last_viewed_at` was never backfilled, so a video nobody has played since
 * tracking began is measured from its activation.
 *
 * Pure: no Supabase, no Next.js, no clock of its own — `now` is always an
 * argument, so the Film empty state, Settings › Usage and the warning job can
 * all ask the same question and get the same answer.
 */

/** A video unwatched this long expires. */
export const MATCH_VIDEO_EXPIRY_DAYS = 365;

/** How long before expiry the warning starts. */
export const MATCH_VIDEO_EXPIRY_WARN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MatchVideoExpiryInput {
  /** `match_video_attachments.activated_at` — set on every active row. */
  activatedAt: string | Date;
  /** `match_video_attachments.last_viewed_at`; null = never played since tracking began. */
  lastViewedAt: string | Date | null;
}

export interface MatchVideoExpiry {
  /** Clock + {@link MATCH_VIDEO_EXPIRY_DAYS}. */
  expiresAt: Date;
  /**
   * True from {@link MATCH_VIDEO_EXPIRY_WARN_DAYS} days before `expiresAt`
   * onward (and past it). With a 365/30 policy that is day 335 of the clock;
   * day 334 is still quiet.
   */
  warning: boolean;
  /** Whole calendar months (UTC) since the clock started. Never negative. */
  monthsUnwatched: number;
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole calendar months from `from` to `to`, UTC; 0 when `to` is not later. */
function wholeMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  // Not a full month yet if `to` sits earlier in its month than `from` did.
  const fromRest =
    from.getTime() -
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toRest =
    to.getTime() -
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (
    to.getUTCDate() < from.getUTCDate() ||
    (to.getUTCDate() === from.getUTCDate() && toRest < fromRest)
  ) {
    months -= 1;
  }
  return Math.max(0, months);
}

/**
 * Expiry for one active video at `now`.
 *
 * A `lastViewedAt` that does not parse is treated as absent, so the answer
 * falls back to `activatedAt` rather than to "expired". An `activatedAt`
 * that does not parse is a caller bug and throws.
 */
export function matchVideoExpiry(
  input: MatchVideoExpiryInput,
  now: Date,
): MatchVideoExpiry {
  const activated = toDate(input.activatedAt);
  if (!activated) {
    throw new RangeError("matchVideoExpiry: activatedAt is not a valid date");
  }
  const clock = toDate(input.lastViewedAt) ?? activated;

  const expiresAt = new Date(
    clock.getTime() + MATCH_VIDEO_EXPIRY_DAYS * DAY_MS,
  );
  const warnFrom = expiresAt.getTime() - MATCH_VIDEO_EXPIRY_WARN_DAYS * DAY_MS;

  return {
    expiresAt,
    warning: now.getTime() >= warnFrom,
    monthsUnwatched: wholeMonthsBetween(clock, now),
  };
}
