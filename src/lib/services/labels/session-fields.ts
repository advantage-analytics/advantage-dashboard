/**
 * The two session fields the "Score doesn't add up" chip may write
 * (board 08m, `BANNER`): `label_sessions.final_score` — the match's score as
 * the labeller read it off the video, one `[p1, p2]` games pair per set — and
 * `label_sessions.video_ends_early`. Nothing else: the chip's third answer,
 * "Find the gap", is navigation and writes nothing, and `matches.score` is
 * read, never written, by any labels code.
 *
 * Pure, and importable from the client bundle: the console runs
 * `applyLabelSessionPatch` for its optimistic state and
 * `session-fields-session.ts` runs `parseLabelSessionPatch` before its write.
 */

import type { LabelSession } from "./session";

/** The columns a session patch may carry, as the table spells them. */
export interface LabelSessionFieldsPatch {
  final_score?: number[][] | null;
  video_ends_early?: boolean | null;
}

/** The same two fields as the console holds them. */
export type LabelSessionFields = Pick<
  LabelSession,
  "finalScore" | "videoEndsEarly"
>;

const KEYS: ReadonlySet<string> = new Set(["final_score", "video_ends_early"]);

function isGames(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validate a session patch: an object with at least one of the two keys and
 * no other; `final_score` null or an array of `[int ≥ 0, int ≥ 0]` pairs;
 * `video_ends_early` null or a boolean.
 */
export function parseLabelSessionPatch(
  patch: unknown,
): { ok: true; patch: LabelSessionFieldsPatch } | { error: string } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { error: "The session patch must be an object." };
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) return { error: "Nothing to change." };
  const out: LabelSessionFieldsPatch = {};
  for (const [key, value] of entries) {
    if (!KEYS.has(key)) {
      return { error: `"${key}" is not a field the session takes.` };
    }
    if (key === "final_score") {
      if (value === null) {
        out.final_score = null;
        continue;
      }
      if (
        !Array.isArray(value) ||
        !value.every(
          (pair) =>
            Array.isArray(pair) &&
            pair.length === 2 &&
            isGames(pair[0]) &&
            isGames(pair[1]),
        )
      ) {
        return {
          error:
            "final_score must be null or a list of [games, games] pairs, one per set.",
        };
      }
      out.final_score = value.map((pair: number[]) => [pair[0], pair[1]]);
    } else {
      if (value !== null && typeof value !== "boolean") {
        return { error: "video_ends_early must be true, false or null." };
      }
      out.video_ends_early = value;
    }
  }
  return { ok: true, patch: out };
}

/** The console's session fields after the patch; unchanged keys stay. */
export function applyLabelSessionPatch(
  fields: LabelSessionFields,
  patch: LabelSessionFieldsPatch,
): LabelSessionFields {
  return {
    finalScore:
      "final_score" in patch ? (patch.final_score ?? null) : fields.finalScore,
    videoEndsEarly:
      "video_ends_early" in patch
        ? (patch.video_ends_early ?? null)
        : fields.videoEndsEarly,
  };
}
