import {
  EMPTY_MATCH_FILTERS,
  type MatchFilters,
  serializeMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskPattern, AskPatternShot } from "@/lib/services/ask/pattern";

/**
 * A pattern answer's "Watch these points": the match's Video view with its
 * filters set to the same pattern, so the points it lists are the points the
 * answer counted.
 *
 * The pattern's fields ARE the filter's sections (`pattern.ts`'s header), so
 * this is a field-for-field copy:
 *
 *   court                     → Serve › Side (the point's court)
 *   serve.server/zones/type   → Serve › Player / Zone / Type
 *   returnShot.strokes/zones  → Return › Type / Zone
 *   shots[0]                  → Custom › Hit by / Stroke / Direction / Hit
 *   shots[1]                  → Then   › the same
 *   plusOne (with no shots)   → Custom › the +1's hitter, Hit 3 (the
 *                               server's) or Hit 4 (the returner's)
 *
 * "mine" is the filter's "you": both are the viewer's side of the match (the
 * page's `useMatchSides()`, Ask's `ask.my_side()`). "Within N shots" is Hit
 * 1…N. Middle is a rally direction Ask can count but the Custom filter does
 * not offer, so a pattern naming it gets no link rather than one that shows
 * more points than the answer counted.
 */

/** The Video view's tab, as `match-report-context.tsx` names it. */
const VIDEO_TAB = "film";

function hits(within: number | null): number[] {
  if (within === null) return [];
  return Array.from({ length: within }, (_, index) => index + 1);
}

function shotFields(shot: AskPatternShot) {
  if (shot.directions.includes("Middle")) return null;
  return {
    player:
      shot.player === null ? null : shot.player === "mine" ? "you" : "opponent",
    strokes: shot.strokes,
    directions: shot.directions.filter(
      (direction): direction is Exclude<typeof direction, "Middle"> =>
        direction !== "Middle",
    ),
    hits: hits(shot.within),
  } as const;
}

/** The pattern as the Video view's filters, or null when the filter cannot say it. */
export function patternMatchFilters(pattern: AskPattern): MatchFilters | null {
  // A +1 is the Custom shot when it is the only shot the pattern names. Beside
  // other shots it would need a third step the filter does not have.
  const plus = pattern.plusOne;
  if (plus && pattern.shots.length > 0) return null;
  const server = pattern.serve?.server ?? null;
  const shots: AskPatternShot[] = plus
    ? [
        {
          player:
            server === null
              ? null
              : plus.after === "serve"
                ? server
                : server === "mine"
                  ? "opponent"
                  : "mine",
          strokes: plus.strokes,
          directions: plus.directions,
          within: null,
        },
      ]
    : pattern.shots;
  const [first, second] = shots;
  const plusHit = plus ? [plus.after === "serve" ? 3 : 4] : null;
  const one = first ? shotFields(first) : undefined;
  const two = second ? shotFields(second) : undefined;
  if (one === null || two === null) return null;
  return {
    ...EMPTY_MATCH_FILTERS,
    court:
      pattern.court === "Deuce"
        ? "deuce"
        : pattern.court === "Ad"
          ? "ad"
          : null,
    server:
      pattern.serve?.server === "mine"
        ? "you"
        : pattern.serve?.server === "opponent"
          ? "opponent"
          : null,
    serveZone: pattern.serve?.zones ?? [],
    serveType: pattern.serve?.type ? [pattern.serve.type] : [],
    returnType: pattern.returnShot?.strokes ?? [],
    returnZone: pattern.returnShot?.zones ?? [],
    customPlayer: one?.player ?? null,
    customStroke: one?.strokes ?? [],
    customDirection: one?.directions ?? [],
    customRallyShot: plusHit ?? one?.hits ?? [],
    thenPlayer: two?.player ?? null,
    thenStroke: two?.strokes ?? [],
    thenDirection: two?.directions ?? [],
    thenRallyShot: two?.hits ?? [],
  };
}

/** The link, or null when the pattern has a part the filter cannot express. */
export function patternVideoHref(
  matchId: string,
  pattern: AskPattern,
): string | null {
  const filters = patternMatchFilters(pattern);
  if (filters === null) return null;
  const f = serializeMatchFilters(filters);
  const query = new URLSearchParams({ tab: VIDEO_TAB });
  if (f !== "") query.set("f", f);
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query.toString()}`;
}
