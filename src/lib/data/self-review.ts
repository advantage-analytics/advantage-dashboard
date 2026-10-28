/**
 * Self review (docs/plans/advantage-review.md, step 2): a player — or a
 * team's owner or a coach — fixes who won a point and how it ended, on the
 * match's Video tab. The rows live in the label console's tables as a
 * `kind = 'self'` session, one per match, and saving patches `points` in
 * place through `self_review_save` (migration `20261028025013_self_review`).
 *
 * This file is the client-safe half: the vocabulary, the reading of a
 * `points.result_type` into it and back (a mirror of the SQL's
 * `self_review_reading` / `self_review_result_type`, so the form can preview
 * what a save will write), and the "Edited by" line. The database composes
 * the stored value itself; nothing the client sends becomes `result_type`
 * verbatim.
 */

export type Side = "p1" | "p2";
export type FixEnding =
  "winner" | "error" | "ace" | "double_fault" | "service_winner";
export type ErrorKind = "forced" | "unforced";
export type LastStroke = "forehand" | "backhand" | "volley" | "overhead";

/** Who won a point and how it ended, in the label vocabulary. */
export interface PointReading {
  winner: Side;
  /** Null when the reading named no ending (`result_type` null). */
  ending: FixEnding | null;
  /** Only on an `error`. */
  errorKind: ErrorKind | null;
  /** The stroke the ending names; only on a `winner` or `error`. */
  lastStroke: LastStroke | null;
}

/** A point a self review changed, with the reading it replaced. */
export interface PointEdit {
  pointId: string;
  current: PointReading;
  original: PointReading;
  editedBy: string | null;
}

export interface SelfReviewEditor {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  /** Their role on the match's team; null on a personal match. */
  role: string | null;
}

export interface SelfReviewState {
  /** May this viewer fix points (`can_fix_match_points`)? */
  canFix: boolean;
  edits: PointEdit[];
  editors: SelfReviewEditor[];
}

/** One point's change as the save sends it. */
export type PointFix =
  { pointId: string; reset: true } | ({ pointId: string } & PointReading);

export const NO_SELF_REVIEW: SelfReviewState = {
  canFix: false,
  edits: [],
  editors: [],
};

/**
 * The derivation flags a reviewer is asked about (Self-review and Verified
 * canvas, "F1 · Which flags a reviewer sees"): right often enough to be worth
 * their time, and answerable from the video. Every other flag stays in the
 * admin console. Order is the question's weight: these lead the list.
 */
export const REVIEW_FLAGS = [
  "winner_guessed",
  "last_call_contradicts_winner",
  "ending_suspect_line",
  "result_type_unknown",
] as const;

/** The question a flagged point is asked, by flag. */
export const REVIEW_FLAG_QUESTION: Record<
  (typeof REVIEW_FLAGS)[number],
  string
> = {
  winner_guessed: "Who won the point?",
  last_call_contradicts_winner: "Who won the point?",
  ending_suspect_line: "Was that ball in?",
  result_type_unknown: "Was the last ball in?",
};

export function reviewFlagsOf(flags: unknown): string[] {
  if (!Array.isArray(flags)) return [];
  return REVIEW_FLAGS.filter((flag) => flags.includes(flag));
}

const STROKE_OF: Record<string, LastStroke> = {
  forehand: "forehand",
  backhand: "backhand",
  volley: "volley",
  overhead: "overhead",
};

/** `points.result_type` + winner → the label reading. Mirrors the SQL. */
export function readingOf(
  resultType: string | null | undefined,
  wonByPlayer1: boolean,
): PointReading {
  const winner: Side = wonByPlayer1 ? "p1" : "p2";
  const rt = (resultType ?? "").trim();
  if (rt === "Ace") return serve(winner, "ace");
  if (rt === "Double Fault") return serve(winner, "double_fault");
  if (rt === "Service Winner") return serve(winner, "service_winner");
  const stroke = STROKE_OF[rt.split(" ")[0]?.toLowerCase() ?? ""] ?? null;
  if (/winner$/i.test(rt)) {
    return { winner, ending: "winner", errorKind: null, lastStroke: stroke };
  }
  if (/error$/i.test(rt)) {
    return {
      winner,
      ending: "error",
      errorKind: /unforced error$/i.test(rt) ? "unforced" : "forced",
      lastStroke: stroke,
    };
  }
  return { winner, ending: null, errorKind: null, lastStroke: null };
}

function serve(winner: Side, ending: FixEnding): PointReading {
  return { winner, ending, errorKind: null, lastStroke: null };
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A reading in words, naming who did it: "Forehand winner by Lee", "Ace by
 * Lee", "Double fault by Nakamura", "Backhand unforced error by Nakamura",
 * or "Won by Lee" when no ending was read. An error and a double fault name
 * the player who made them — the point's loser.
 */
export function readingPhrase(
  reading: PointReading,
  names: Record<Side, string>,
): string {
  const winner = names[reading.winner];
  const loser = names[reading.winner === "p1" ? "p2" : "p1"];
  const stroke = reading.lastStroke ? `${cap(reading.lastStroke)} ` : "";
  switch (reading.ending) {
    case "ace":
      return `Ace by ${winner}`;
    case "service_winner":
      return `Service winner by ${winner}`;
    case "double_fault":
      return `Double fault by ${loser}`;
    case "winner":
      return stroke ? `${stroke}winner by ${winner}` : `Winner by ${winner}`;
    case "error": {
      const kind = reading.errorKind ? `${reading.errorKind} ` : "";
      const what = `${stroke}${kind}error`;
      return `${cap(what)} by ${loser}`;
    }
    default:
      return `Won by ${winner}`;
  }
}

/** The label reading → `points.result_type`. Mirrors `self_review_result_type`. */
export function resultTypeOf(reading: PointReading): string | null {
  const stroke = reading.lastStroke ? `${cap(reading.lastStroke)} ` : "";
  switch (reading.ending) {
    case "ace":
      return "Ace";
    case "double_fault":
      return "Double Fault";
    case "service_winner":
      return "Service Winner";
    case "winner":
      return `${stroke}Winner`;
    case "error":
      return `${stroke}${reading.errorKind === "forced" ? "Forced" : "Unforced"} Error`;
    default:
      return null;
  }
}

export function sameReading(a: PointReading, b: PointReading): boolean {
  return (
    a.winner === b.winner &&
    a.ending === b.ending &&
    a.errorKind === b.errorKind &&
    a.lastStroke === b.lastStroke
  );
}

/**
 * Bring a reading in line with what the database accepts: an ace or service
 * winner is the server's point, a double fault the receiver's, and only a
 * winner or an error names a stroke or an error kind.
 */
export function normalizeReading(
  reading: PointReading,
  server: Side,
): PointReading {
  const receiver: Side = server === "p1" ? "p2" : "p1";
  switch (reading.ending) {
    case "ace":
    case "service_winner":
      return { ...reading, winner: server, errorKind: null, lastStroke: null };
    case "double_fault":
      return {
        ...reading,
        winner: receiver,
        errorKind: null,
        lastStroke: null,
      };
    case "winner":
      return { ...reading, errorKind: null };
    case "error":
      return { ...reading, errorKind: reading.errorKind ?? "unforced" };
    default:
      return reading;
  }
}

/**
 * The details line's provenance fact: "Edited by you · 3 points", "Edited by
 * Coach Rivera · 2 points", or both names when two people fixed points. Null
 * when nothing is edited. "Edited", never "verified" (plan › Decisions).
 */
export function editedByLabel(
  state: SelfReviewState,
  viewerId: string | null,
): string | null {
  const count = state.edits.length;
  if (count === 0) return null;
  const ids = [...new Set(state.edits.map((edit) => edit.editedBy))];
  const names = ids.map((id) => editorName(state, id, viewerId));
  // The viewer first, so a shared line reads "you and Coach Rivera".
  names.sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : 0));
  const who =
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Edited by ${who} · ${count === 1 ? "1 point" : `${count} points`}`;
}

/** How one editor is named: "you", "Coach Rivera", or their name. */
export function editorName(
  state: SelfReviewState,
  editorId: string | null,
  viewerId: string | null,
): string {
  if (editorId && editorId === viewerId) return "you";
  const editor = state.editors.find((e) => e.userId === editorId);
  if (!editor) return "someone else";
  const last = editor.lastName?.trim();
  const first = editor.firstName?.trim();
  if ((editor.role === "coach" || editor.role === "owner") && (last || first)) {
    return `Coach ${last || first}`;
  }
  return [first, last].filter(Boolean).join(" ") || "someone else";
}

/** Normalize the RPC's JSON into {@link SelfReviewState}. */
export function selfReviewStateFrom(raw: unknown): SelfReviewState {
  if (!raw || typeof raw !== "object") return NO_SELF_REVIEW;
  const r = raw as {
    can_fix?: unknown;
    edits?: unknown;
    editors?: unknown;
  };
  const edits = Array.isArray(r.edits)
    ? r.edits.flatMap((e): PointEdit[] => {
        if (!e || typeof e !== "object") return [];
        const row = e as Record<string, unknown>;
        const seed = (row.seed ?? {}) as Record<string, unknown>;
        if (typeof row.point_id !== "string") return [];
        return [
          {
            pointId: row.point_id,
            current: readingFromRow(row),
            original: readingFromRow(seed),
            editedBy: typeof row.edited_by === "string" ? row.edited_by : null,
          },
        ];
      })
    : [];
  const editors = Array.isArray(r.editors)
    ? r.editors.flatMap((e): SelfReviewEditor[] => {
        if (!e || typeof e !== "object") return [];
        const row = e as Record<string, unknown>;
        if (typeof row.user_id !== "string") return [];
        return [
          {
            userId: row.user_id,
            firstName: str(row.first_name),
            lastName: str(row.last_name),
            role: str(row.role),
          },
        ];
      })
    : [];
  return { canFix: r.can_fix === true, edits, editors };
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function readingFromRow(row: Record<string, unknown>): PointReading {
  return {
    winner: row.winner === "p2" ? "p2" : "p1",
    ending: (str(row.ending) as FixEnding | null) ?? null,
    errorKind: (str(row.error_kind) as ErrorKind | null) ?? null,
    lastStroke: (str(row.last_stroke) as LastStroke | null) ?? null,
  };
}
