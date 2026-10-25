/**
 * The first-match feedback prompt: one question, asked once, after a player
 * has read their first match report and come back to the dashboard.
 *
 * Pure — no `react` or `next/*` imports — so the dialog, the route that saves
 * an answer and the offline spec all read the same copy and limits, and the
 * limits here are the ones the `product_feedback` table checks.
 */

import type { WorkspaceKind } from "@/lib/workspace/types";

/** `product_feedback.prompt` for this question. */
export const FIRST_MATCH_FEEDBACK_PROMPT = "first_match" as const;

/** The five-point "how useful" scale, low to high. */
export const FIRST_MATCH_FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type FirstMatchFeedbackRating =
  (typeof FIRST_MATCH_FEEDBACK_RATINGS)[number];

/** The table's check on `note`. */
export const MAX_FIRST_MATCH_FEEDBACK_NOTE = 1000;

export interface FirstMatchFeedback {
  rating: FirstMatchFeedbackRating;
  /** The optional note, trimmed; null when nothing was written. */
  note: string | null;
}

export const FIRST_MATCH_FEEDBACK_COPY = {
  title: "How was your first match report?",
  contract:
    "One question, asked once. It goes straight to the people building Advantage.",
  ratingLabel: "How useful was it?",
  ratingLow: "Not useful",
  ratingHigh: "Very useful",
  noteLabel: "What would make it more useful?",
  notePlaceholder: "Optional",
  notNow: "Not now",
  send: "Send",
  sending: "Sending…",
  failed: "Could not send that. Try again.",
  thanks: "Thanks — that helps.",
} as const;

/** What a screen reader says for one point on the scale. */
export function ratingLabel(rating: FirstMatchFeedbackRating): string {
  return `${rating} out of ${FIRST_MATCH_FEEDBACK_RATINGS.length}`;
}

/** The word for each point on the scale — said under a chosen box, and read back by whoever reads the answers. */
export const FIRST_MATCH_FEEDBACK_WORDS: Record<
  FirstMatchFeedbackRating,
  string
> = {
  1: "Not useful",
  2: "Not very useful",
  3: "Somewhat useful",
  4: "Useful",
  5: "Very useful",
};

// ── When to ask ─────────────────────────────────────────────────────────────

/**
 * How long after first reading the report a visit counts as "coming back"
 * even when the session never signed in again. Web sessions are long-lived:
 * a player who comes back on the same laptop a week later has not signed in
 * since, and the question would otherwise wait for a sign-in that never
 * happens.
 */
export const FIRST_MATCH_FEEDBACK_RETURN_MS = 24 * 60 * 60 * 1000;

export interface FirstMatchFeedbackFacts {
  workspaceKind: WorkspaceKind;
  /** `users.first_report_seen_at` (`Viewer.firstReportSeenAt`). */
  firstReportSeenAt: string | null;
  /** The auth user's `last_sign_in_at` (`Viewer.lastSignInAt`). */
  lastSignInAt: string | null;
  /** `users.first_match_feedback_done_at` (`Viewer.firstMatchFeedbackDoneAt`). */
  doneAt: string | null;
  /** The moment being decided, `Date.now()`. */
  now: number;
}

/**
 * Whether the shell asks the first-match feedback question on this visit: a
 * personal workspace, a first report already read, nothing settled yet, and
 * the player has come back — a sign-in newer than the first reading, or a
 * day gone by since it. A fact that cannot be read answers "no": a question
 * that waits for the next visit is harmless, one pushed at someone who
 * already answered is not.
 */
export function firstMatchFeedbackDue({
  workspaceKind,
  firstReportSeenAt,
  lastSignInAt,
  doneAt,
  now,
}: FirstMatchFeedbackFacts): boolean {
  if (workspaceKind !== "personal") return false;
  if (doneAt !== null) return false;
  if (firstReportSeenAt === null) return false;
  const seen = Date.parse(firstReportSeenAt);
  if (!Number.isFinite(seen) || seen > now) return false;
  const signedIn = lastSignInAt === null ? NaN : Date.parse(lastSignInAt);
  const signedInSince = Number.isFinite(signedIn) && signedIn > seen;
  const returned = now - seen >= FIRST_MATCH_FEEDBACK_RETURN_MS;
  return signedInSince || returned;
}

// ── The route's body ────────────────────────────────────────────────────────

/** What `POST /api/feedback/first-match` takes. */
export interface FirstMatchFeedbackRequest {
  rating: FirstMatchFeedbackRating;
  /** Trimmed; null when nothing was written. */
  note: string | null;
}

const REQUEST_KEYS = new Set(["rating", "note"]);

/** Whether a value is a point on the scale — the route and the alert mail both check it. */
export function isFirstMatchFeedbackRating(
  value: unknown,
): value is FirstMatchFeedbackRating {
  return (
    typeof value === "number" &&
    (FIRST_MATCH_FEEDBACK_RATINGS as readonly number[]).includes(value)
  );
}

/**
 * The route's body, or the sentence that refuses it. Strict like Ask's
 * readers: an unknown key, a rating off the scale or an over-long note is
 * refused rather than trimmed into shape. The note is trimmed, and an empty
 * one is null, as the database would store it.
 */
export function readFirstMatchFeedbackRequest(
  value: unknown,
):
  | { ok: true; value: FirstMatchFeedbackRequest }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "The request must be a JSON object." };
  }
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).find((key) => !REQUEST_KEYS.has(key));
  if (unknown) return { ok: false, error: `Unknown field "${unknown}".` };

  if (!isFirstMatchFeedbackRating(body.rating)) {
    return {
      ok: false,
      error: `rating must be a whole number from 1 to ${FIRST_MATCH_FEEDBACK_RATINGS.length}.`,
    };
  }
  const rawNote = body.note ?? null;
  if (rawNote !== null && typeof rawNote !== "string") {
    return { ok: false, error: "note must be text or null." };
  }
  const note = rawNote === null ? null : rawNote.trim();
  if (note !== null && note.length > MAX_FIRST_MATCH_FEEDBACK_NOTE) {
    return {
      ok: false,
      error: `note must be at most ${MAX_FIRST_MATCH_FEEDBACK_NOTE} characters.`,
    };
  }
  return { ok: true, value: { rating: body.rating, note: note || null } };
}
