/**
 * The labeller queue's rules: when a match is due, which jobs enter the
 * queue, the order it is shown in, and which rows a labeller may claim.
 * Settled in `docs/superpowers/specs/2026-11-12-admin-strip/README.md`.
 *
 * Pure: no Supabase, no clock. Every rule that needs the time takes `now`, so
 * the server loaders and the client boards agree on one reading. The two
 * helpers it reuses live in dependency-free modules for the same reason.
 *
 * `completedAt` is `processing_jobs.completed_at` — a real moment (when the
 * vendor's results landed), not a calendar day like `matches.date`.
 */

import { isTestAccountEmail } from "@/lib/services/notifications/test-account";
import {
  jobVideoSeconds,
  type JobVideoSpan,
} from "@/lib/services/labels/video-seconds";

/** Hours from results landing to the label being due, for every priority. */
export const LABEL_DUE_WINDOW_HOURS = 36;

/** Jobs completed before this moment never enter the queue. */
export const LABEL_QUEUE_FROM = "2026-10-29T00:00:00Z";

/** How many of the earliest-due open matches a labeller may choose among. */
export const LABEL_CLAIM_CHOICES = 3;

/** A moment as the boards hold it: an ISO string, a `Date` or epoch ms. */
export type Moment = string | number | Date;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function toMs(moment: Moment): number {
  if (moment instanceof Date) return moment.getTime();
  if (typeof moment === "number") return moment;
  return Date.parse(moment);
}

/**
 * When a job's label is due: `completedAt` plus `LABEL_DUE_WINDOW_HOURS`.
 * One window for every priority — the Express / Priority / Standard tiers
 * come later, and nothing sets `processing_jobs.priority` today.
 */
export function labelDueAt(completedAt: Moment): Date {
  return new Date(toMs(completedAt) + LABEL_DUE_WINDOW_HOURS * HOUR_MS);
}

/** True from the due moment on — the boolean the boards style on. */
export function isOverdue(dueAt: Moment, now: Moment): boolean {
  return toMs(now) >= toMs(dueAt);
}

/**
 * "Due in N min" under an hour (at least 1), "Due in N h" (floored) from one
 * hour up, "Overdue by N h" (floored, at least 1) once due.
 */
export function labelDueText(dueAt: Moment, now: Moment): string {
  const left = toMs(dueAt) - toMs(now);
  if (isOverdue(dueAt, now)) {
    return `Overdue by ${Math.max(1, Math.floor(-left / HOUR_MS))} h`;
  }
  if (left < HOUR_MS) {
    return `Due in ${Math.max(1, Math.floor(left / MINUTE_MS))} min`;
  }
  return `Due in ${Math.floor(left / HOUR_MS)} h`;
}

/** The design's urgency tag. Only 'express' is anything but standard. */
export type UrgencyLevel = "express" | "standard";

export function urgencyLevel(
  priority: string | null | undefined,
): UrgencyLevel {
  return priority === "express" ? "express" : "standard";
}

/** The label session on a job, as far as the queue cares. */
export interface QueueSession {
  status: string;
  assignedTo: string | null;
  /**
   * When an admin passed the published session. A `complete` session with
   * none is "Published, to check" and stays in the queue until it is set.
   * Absent reads as none.
   */
  checkedAt?: string | null;
  /** When an admin sent it back to its labeller; it is then never claimable. */
  sentBackAt?: string | null;
}

/** A finished `processing_jobs` row joined to its match owner and session. */
export interface LabelQueueJob extends JobVideoSpan {
  id: string;
  completedAt: string | null;
  /** The match owner's login email. */
  ownerEmail: string | null;
  session: QueueSession | null;
}

/**
 * Whether a job belongs to a test workspace. Today that is only a match owner
 * with a test-suite login (`isTestAccountEmail`). The owner has not yet said
 * whether named test programs (e.g. "ZZ Test Program") are excluded too; if
 * they are, add that rule here, and only here, with the program on the job.
 */
export function isTestOwner(job: Pick<LabelQueueJob, "ownerEmail">): boolean {
  return isTestAccountEmail(job.ownerEmail);
}

/**
 * Whether a job enters the queue: completed on or after `LABEL_QUEUE_FROM`,
 * some video to label, and not a test workspace's. A published (`complete`)
 * session stays while it waits for the admin's check, and leaves once
 * `checkedAt` is set.
 */
export function enterLabelQueue(job: LabelQueueJob): boolean {
  if (!job.completedAt) return false;
  const completed = toMs(job.completedAt);
  if (!Number.isFinite(completed) || completed < toMs(LABEL_QUEUE_FROM)) {
    return false;
  }
  if (!(jobVideoSeconds(job) > 0)) return false;
  if (isTestOwner(job)) return false;
  if (job.session?.status === "complete") return !job.session.checkedAt;
  return true;
}

/** Earliest due first; ties by job id. Returns a new array. */
export function sortByDue<T extends { id: string; dueAt: Moment }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const diff = toMs(a.dueAt) - toMs(b.dueAt);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * No session yet, or an open (`labelling`) one nobody holds. A sent-back
 * session is addressed to its labeller, so it is never open to anyone else
 * even with nobody assigned; a published one has nothing left to claim.
 */
function isOpenToClaim(session: QueueSession | null): boolean {
  return (
    session === null ||
    (session.status === "labelling" &&
      session.assignedTo === null &&
      !session.sentBackAt)
  );
}

/**
 * The ids a labeller may claim: the first `LABEL_CLAIM_CHOICES` open rows, in
 * the order given — pass rows through `sortByDue` first. Rows someone already
 * holds are skipped rather than counted, so there are always three choices
 * while three open matches wait.
 */
export function claimableJobIds(
  rows: readonly { id: string; session: QueueSession | null }[],
): string[] {
  return rows
    .filter((row) => isOpenToClaim(row.session))
    .slice(0, LABEL_CLAIM_CHOICES)
    .map((row) => row.id);
}

/**
 * A published session's timeliness against its due moment, as the admin's
 * "to check" rows print it: "On time" when published at or before `dueAt`,
 * else "N h late" (floored, at least 1).
 */
export function labelPublishedText(publishedAt: Moment, dueAt: Moment): string {
  const late = toMs(publishedAt) - toMs(dueAt);
  if (late <= 0) return "On time";
  return `${Math.max(1, Math.floor(late / HOUR_MS))} h late`;
}

/**
 * How long ago a moment was, against the server's `now`: "just now",
 * "N min ago", "N h ago", then "N days ago". Floored, so it never runs
 * ahead; a moment in the future reads as "just now". Both boards print
 * publishes and send-backs with it.
 */
export function agoText(at: Moment, now: Moment): string {
  const ms = toMs(now) - toMs(at);
  if (!(ms >= MINUTE_MS)) return "just now";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} min ago`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)} h ago`;
  const days = Math.floor(ms / DAY_MS);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
