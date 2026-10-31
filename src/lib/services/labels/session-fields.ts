/**
 * The session fields the console may write: `label_sessions.final_score`
 * (the match's score as the labeller read it off the video, one `[p1, p2]`
 * games pair per set) and `label_sessions.video_ends_early`, both from the
 * "Score doesn't add up" chip, and `label_sessions.start_score` (where the
 * video starts in the match, `LabelStartScore`) and `label_sessions.ad_scoring`
 * (ad or no-ad, from the overview, for a match uploaded with the wrong one).
 * `matches.score` is read, never written, by any labels code.
 *
 * Pure: the console runs `applyLabelSessionPatch` and
 * `session-fields-session.ts` runs `parseLabelSessionPatch`.
 */

import type { LabelSession, LabelSide, LabelStartScore } from "./session";

/** The columns a session patch may carry, as the table spells them. */
export interface LabelSessionFieldsPatch {
  final_score?: number[][] | null;
  video_ends_early?: boolean | null;
  start_score?: LabelStartScore | null;
  ad_scoring?: boolean;
}

/** The same fields as the console holds them. */
export type LabelSessionFields = Pick<
  LabelSession,
  "finalScore" | "videoEndsEarly" | "startScore" | "adScoring"
>;

const KEYS: ReadonlySet<string> = new Set([
  "final_score",
  "video_ends_early",
  "start_score",
  "ad_scoring",
]);

const START_KEYS = ["sets", "games", "points", "server"] as const;

function isGames(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCountPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isGames(value[0]) &&
    isGames(value[1])
  );
}

function isSide(value: unknown): value is LabelSide {
  return value === "p1" || value === "p2";
}

/**
 * `label_sessions.start_score` as the console reads it: exactly
 * `{ sets: [n, n], games: [n, n], points: [n, n], server: "p1" | "p2" }`,
 * every count a whole number ≥ 0, no other key. Anything else — the column is
 * jsonb and its CHECK only asks for an object — reads as null rather than as
 * a start. The pairs are copied, not aliased.
 */
export function parseLabelStartScore(value: unknown): LabelStartScore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== START_KEYS.length ||
    !START_KEYS.every((key) => keys.includes(key))
  ) {
    return null;
  }
  const { sets, games, points, server } = record;
  if (
    !isCountPair(sets) ||
    !isCountPair(games) ||
    !isCountPair(points) ||
    !isSide(server)
  ) {
    return null;
  }
  return {
    sets: [sets[0], sets[1]],
    games: [games[0], games[1]],
    points: [points[0], points[1]],
    server,
  };
}

export const START_SCORE_ERROR =
  "start_score must be null or { sets: [n, n], games: [n, n], points: [n, n], server: 'p1' | 'p2' }.";

/**
 * Validate a session patch: an object with at least one of the four keys and
 * no other; `final_score` null or an array of `[int ≥ 0, int ≥ 0]` pairs;
 * `video_ends_early` null or a boolean; `start_score` null or a
 * `LabelStartScore` (`parseLabelStartScore`); `ad_scoring` a boolean, since a
 * session that has said which scoring it counts does not go back to not saying.
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
      if (!Array.isArray(value) || !value.every(isCountPair)) {
        return {
          error:
            "final_score must be null or a list of [games, games] pairs, one per set.",
        };
      }
      out.final_score = value.map((pair: number[]) => [pair[0], pair[1]]);
    } else if (key === "start_score") {
      if (value === null) {
        out.start_score = null;
        continue;
      }
      const start = parseLabelStartScore(value);
      if (!start) return { error: START_SCORE_ERROR };
      out.start_score = start;
    } else if (key === "ad_scoring") {
      if (typeof value !== "boolean") {
        return { error: "ad_scoring must be true or false." };
      }
      out.ad_scoring = value;
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
    startScore:
      "start_score" in patch ? (patch.start_score ?? null) : fields.startScore,
    adScoring: patch.ad_scoring ?? fields.adScoring,
  };
}
