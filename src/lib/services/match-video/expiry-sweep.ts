/**
 * SwingVision Add video T9 — the retention half of the daily cleanup cron.
 *
 * Two steps, run by `handleCleanupCron` BEFORE the existing sweep, in this
 * order:
 *
 *   1. expire  `match_video_expire_unwatched` retires every active video whose
 *              clock (`coalesce(last_viewed_at, activated_at)`) is a year old,
 *              as `retired_reason = 'expired'` and due for cleanup now — so the
 *              sweep that runs straight after deletes both objects the same
 *              morning. The row stays; the statistics are never touched.
 *   2. warn    `match_video_claim_expiry_warnings` stamps `expiry_warned_at`
 *              on videos 30 days from that, and returns them; each one is
 *              emailed to its uploader, once, behind
 *              `claimSend("match_video_expiry:<attachment>:<clock date>")`.
 *
 * Expire runs first so a video already past its date is never warned about a
 * removal that has happened — the SQL also refuses to warn a row that is due.
 *
 * The day counts are {@link MATCH_VIDEO_EXPIRY_DAYS} and
 * {@link MATCH_VIDEO_EXPIRY_WARN_DAYS}, passed to both RPCs as parameters:
 * `lib/match-video/expiry.ts` stays the one place the policy is written, so
 * the Film empty state, Settings › Usage and this sweep agree on every date.
 *
 * Why the warning stamps BEFORE the send: stamp-and-return is the claim that
 * keeps two concurrent sweeps off the same row. A send that then fails is not
 * retried — losing one notice is the cheaper failure, since anyone who opens
 * the video keeps it — and `claimSend` stops a duplicate if a stamp is ever
 * cleared without a view.
 *
 * SERVER ONLY: the service-role RPCs and the mail sender. Listed in
 * `tests/client-bundle-boundary.spec.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { titleCaseName } from "@/lib/data/person-name";
import {
  MATCH_VIDEO_EXPIRY_DAYS,
  MATCH_VIDEO_EXPIRY_WARN_DAYS,
  matchVideoExpiry,
} from "@/lib/match-video/expiry";
import {
  matchVideoExpiryEmail,
  sendEmail,
  type EmailMessage,
  type EmailResult,
} from "@/lib/services/email";
import { claimSend } from "@/lib/services/notifications/should-notify";

const LOG = "[match-video-expiry]";

/** Rows retired per run. Anything left is taken tomorrow. */
export const EXPIRY_BATCH_LIMIT = 50;

/**
 * Warnings claimed per run. Kept well under Resend's free-tier 100 sends a
 * day (`docs/email-system.md` §9), which every other product email shares.
 */
export const WARNING_BATCH_LIMIT = 25;

/**
 * Wall-clock budget for the warning step. The route has 60 s in all
 * (`maxDuration`) and the sweep still has to run after this; one send can
 * take two `SEND_TIMEOUT_MS` (10 s) calls when Resend is struggling. So rows
 * are claimed ONE at a time and no new row is claimed once the budget is
 * spent: a row is only stamped when it is about to be sent, and whatever is
 * left is claimed tomorrow instead of being stamped and never mailed.
 */
export const WARNING_TIME_BUDGET_MS = 15_000;

/* -------------------------------------------------------------------------
 * Expire
 * ---------------------------------------------------------------------- */

export interface ExpireResult {
  expired: number;
}

/** Retire every year-unwatched video in one batch. Throws on an RPC error. */
export async function expireUnwatchedMatchVideos(
  db: SupabaseClient,
  limit: number = EXPIRY_BATCH_LIMIT,
): Promise<ExpireResult> {
  const { data, error } = await db.rpc("match_video_expire_unwatched", {
    p_limit: limit,
    p_expiry_days: MATCH_VIDEO_EXPIRY_DAYS,
  });
  if (error) {
    throw new Error(`match_video_expire_unwatched: ${error.code ?? "rpc"}`);
  }
  const expired = Array.isArray(data) ? data.length : 0;
  if (expired > 0) console.log(`${LOG} expired`, { expired });
  return { expired };
}

/* -------------------------------------------------------------------------
 * Warn
 * ---------------------------------------------------------------------- */

/** One row of `match_video_claim_expiry_warnings`, already stamped. */
export interface ExpiryWarningRow {
  attachment_id: string;
  match_id: string;
  uploaded_by: string | null;
  activated_at: string;
  last_viewed_at: string | null;
  expiry_warned_at: string;
  player1_name: string | null;
  player2_name: string | null;
  match_date: string | null;
  program_id: string | null;
  program_school_name: string | null;
  program_team: string | null;
  uploader_email: string | null;
  uploader_first_name: string | null;
  uploader_last_name: string | null;
}

export interface ExpiryWarningDeps {
  /** Stamp and return up to `limit` rows due a warning. Throws on error. */
  claimWarnings: (limit: number) => Promise<ExpiryWarningRow[]>;
  /** `claimSend` from `services/notifications/should-notify.ts`. */
  claimSend: (dedupeKey: string) => Promise<boolean>;
  /** `sendEmail`. Never throws. */
  send: (message: EmailMessage) => Promise<EmailResult>;
  now?: () => Date;
  /** Monotonic-enough milliseconds for the budget. Defaults to `Date.now`. */
  elapsedClock?: () => number;
}

export interface WarnResult {
  /** Rows stamped as warned this run. */
  warned: number;
  /** Warnings the sender accepted. */
  emailed: number;
  /** Stamped but not sent: no uploader or address, or the key was spent. */
  skipped: number;
  /** Sends the sender refused. */
  failed: number;
}

/**
 * `match_video_expiry:<attachment>:<clock date>` — one warning per video per
 * retention clock. A view moves the clock, so a later warning gets a new key.
 */
export function expiryWarningDedupeKey(
  attachmentId: string,
  clock: Date,
): string {
  return `match_video_expiry:${attachmentId}:${clock.toISOString().slice(0, 10)}`;
}

/** "Cardinal · M" — the team label the Film and wizard frames use. */
function teamLabelOf(row: ExpiryWarningRow): string | null {
  if (!row.program_id || !row.program_school_name?.trim()) return null;
  const name = row.program_school_name.trim();
  const squad =
    row.program_team === "mens"
      ? "M"
      : row.program_team === "womens"
        ? "W"
        : null;
  return squad ? `${name} · ${squad}` : name;
}

function dateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Claim the due warnings one at a time and email each uploader once, up to
 * `limit` rows or {@link WARNING_TIME_BUDGET_MS}, whichever comes first.
 */
export async function warnExpiringMatchVideos(
  deps: ExpiryWarningDeps,
  limit: number = WARNING_BATCH_LIMIT,
  budgetMs: number = WARNING_TIME_BUDGET_MS,
): Promise<WarnResult> {
  const now = deps.now?.() ?? new Date();
  const clockMs = deps.elapsedClock ?? Date.now;
  const startedAt = clockMs();
  const result: WarnResult = { warned: 0, emailed: 0, skipped: 0, failed: 0 };

  while (result.warned < limit && clockMs() - startedAt < budgetMs) {
    const [row] = await deps.claimWarnings(1);
    if (!row) break;
    result.warned += 1;

    const to = row.uploader_email?.trim();
    if (!row.uploaded_by || !to) {
      // A team video whose uploader's account is gone stays stamped, so it is
      // not offered again every morning; it expires on its date regardless.
      result.skipped += 1;
      continue;
    }

    const clock = dateOrNull(row.last_viewed_at) ?? new Date(row.activated_at);
    if (
      !(await deps.claimSend(expiryWarningDedupeKey(row.attachment_id, clock)))
    ) {
      result.skipped += 1;
      continue;
    }

    const expiry = matchVideoExpiry(
      { activatedAt: row.activated_at, lastViewedAt: row.last_viewed_at },
      now,
    );
    const name =
      titleCaseName(
        [row.uploader_first_name, row.uploader_last_name].join(" "),
      ) || to;

    const sent = await deps.send(
      matchVideoExpiryEmail({
        to,
        recipientName: name,
        matchId: row.match_id,
        player1Name: row.player1_name?.trim() || "Player 1",
        player2Name: row.player2_name?.trim() || "Player 2",
        matchDate: dateOrNull(row.match_date),
        expiresAt: expiry.expiresAt,
        teamLabel: teamLabelOf(row),
      }),
    );
    if (sent.ok) {
      result.emailed += 1;
    } else {
      result.failed += 1;
      console.error(`${LOG} send failed`, {
        attachmentId: row.attachment_id,
        error: sent.error,
      });
    }
  }

  if (result.warned > 0) console.log(`${LOG} warned`, result);
  return result;
}

/** The real claim, dedupe and sender, over the service-role client. */
export function productionExpiryWarningDeps(
  db: SupabaseClient,
): ExpiryWarningDeps {
  return {
    claimWarnings: async (limit) => {
      const { data, error } = await db.rpc(
        "match_video_claim_expiry_warnings",
        {
          p_limit: limit,
          p_expiry_days: MATCH_VIDEO_EXPIRY_DAYS,
          p_warn_days: MATCH_VIDEO_EXPIRY_WARN_DAYS,
        },
      );
      if (error) {
        throw new Error(
          `match_video_claim_expiry_warnings: ${error.code ?? "rpc"}`,
        );
      }
      return (data ?? []) as ExpiryWarningRow[];
    },
    claimSend,
    send: sendEmail,
  };
}
