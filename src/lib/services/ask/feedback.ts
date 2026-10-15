/**
 * A thumbs up or down on one Ask answer (`ask_feedback`,
 * `20261014203258_ask_feedback.sql`). Shared by the route that writes it, the
 * loader that reads it back and the answer's control, so the reasons and the
 * note's limit are written once. Imports nothing server-only.
 */

import { isUuid } from "@/lib/admin/validation";

export type AskFeedbackRating = "up" | "down";

/** The reasons a thumbs down may carry — the table's check lists the same four. */
export const ASK_FEEDBACK_REASONS = [
  "wrong_numbers",
  "misread",
  "not_useful",
  "other",
] as const;

export type AskFeedbackReason = (typeof ASK_FEEDBACK_REASONS)[number];

export const ASK_FEEDBACK_REASON_LABELS: Record<AskFeedbackReason, string> = {
  wrong_numbers: "Wrong numbers",
  misread: "Misread my question",
  not_useful: "Not useful",
  other: "Something else",
};

/** The table's check on `note`. */
export const MAX_ASK_FEEDBACK_NOTE = 500;

export interface AskFeedback {
  rating: AskFeedbackRating;
  /** Empty on a thumbs up. */
  reasons: AskFeedbackReason[];
  /** A thumbs down's note; null when there is none. */
  note: string | null;
}

/** What `POST /api/ask/feedback` takes. `rating: null` takes the thumb back. */
export interface AskFeedbackRequest {
  answerId: string;
  rating: AskFeedbackRating | null;
  reasons: AskFeedbackReason[];
  note: string | null;
}

const KEYS = new Set(["answerId", "rating", "reasons", "note"]);

function isReason(value: unknown): value is AskFeedbackReason {
  return (ASK_FEEDBACK_REASONS as readonly unknown[]).includes(value);
}

/**
 * The route's body, or the sentence that refuses it. Strict like the rest of
 * Ask's routes: an unknown key, a reason off the list or an over-long note is
 * refused rather than trimmed. A thumbs up drops reasons and note, as the
 * database would.
 */
export function readAskFeedbackRequest(
  value: unknown,
): { ok: true; value: AskFeedbackRequest } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "The request must be a JSON object." };
  }
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).find((key) => !KEYS.has(key));
  if (unknown) return { ok: false, error: `Unknown field "${unknown}".` };

  if (typeof body.answerId !== "string" || !isUuid(body.answerId)) {
    return { ok: false, error: "answerId must be an answer's id." };
  }
  const rating = body.rating ?? null;
  if (rating !== null && rating !== "up" && rating !== "down") {
    return { ok: false, error: 'rating must be "up", "down" or null.' };
  }
  const rawReasons = body.reasons ?? [];
  if (!Array.isArray(rawReasons) || !rawReasons.every(isReason)) {
    return { ok: false, error: "reasons must come from the list." };
  }
  const rawNote = body.note ?? null;
  if (rawNote !== null && typeof rawNote !== "string") {
    return { ok: false, error: "note must be text." };
  }
  const note = rawNote?.trim() || null;
  if (note && note.length > MAX_ASK_FEEDBACK_NOTE) {
    return {
      ok: false,
      error: `A note is at most ${MAX_ASK_FEEDBACK_NOTE} characters.`,
    };
  }

  const down = rating === "down";
  return {
    ok: true,
    value: {
      answerId: body.answerId,
      rating,
      reasons: down ? [...new Set(rawReasons)] : [],
      note: down ? note : null,
    },
  };
}

/** A saved `ask_feedback` row as the page shows it, or null when it does not read whole. */
export function readAskFeedbackRow(row: unknown): AskFeedback | null {
  if (typeof row !== "object" || row === null) return null;
  const { rating, reasons, note } = row as Record<string, unknown>;
  if (rating !== "up" && rating !== "down") return null;
  return {
    rating,
    reasons: Array.isArray(reasons) ? reasons.filter(isReason) : [],
    note: typeof note === "string" && note !== "" ? note : null,
  };
}

/**
 * PostgREST's PGRST200: a `select` asked to embed a related table the schema
 * cache has no relationship for ("Could not find a relationship between …").
 * A conversation read checks it to fall back to reading without the thumbs.
 */
export function isMissingEmbed(
  error: { code?: string | null } | null | undefined,
): boolean {
  return error?.code === "PGRST200";
}
