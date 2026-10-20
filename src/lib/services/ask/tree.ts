import {
  MATCH_FILTER_OPTIONS,
  type MatchFilters,
  type RallyLengthBand,
  serializeMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskRow } from "@/lib/services/ask/answer-render";
import type {
  AskPattern,
  AskPatternCourt,
  AskPatternDirection,
  AskPatternPlayer,
  AskPatternReturnZone,
  AskPatternServeZone,
  AskPatternStroke,
} from "@/lib/services/ask/pattern";
import { patternMatchFilters } from "@/lib/services/ask/pattern-video";

/**
 * The play tree's own line, and what it lets a branch open.
 *
 * A `tree` block (`events.ts`) is written by the server alone — the serve +1
 * breakdown (`serve-plus-one.ts`) and the losing plays (`plays.ts`) — in the
 * renderer's block syntax (`answer-render.ts`):
 *
 *   CHART: tree | <caption>
 *   COLUMNS: <level> | <level>                 the steps of every branch
 *   SERIES: <count> | [<part> |] <share>       what the numbers are
 *   WATCH: <context…>                          optional: what a branch's
 *                                              Video link needs to know
 *   ROW: <step> | <step> | {{rN.count}} | [{{rN.part}} |] {{rN.share}}
 *
 * `WATCH:` is the one line no model is offered: it names the request the
 * rows answer — whose +1, after the serve or the return, first or second
 * serves — which the rows themselves do not carry. With it, the renderer
 * turns each branch's row (`zone`, `stroke`, `direction`, `court`) into the
 * pattern the Video filter would select (`pattern-video.ts`), so a click on
 * a branch opens exactly the points the answer counted, as a pattern
 * answer's source row does. The serialised filter rides on the branch
 * (`watch`); the client adds the one source match's id (`figure-video.ts`,
 * `watchHref`).
 *
 * Imports no value from `answer-render.ts` or `pattern.ts` — the renderer
 * imports this module, and `pattern.ts` imports the renderer — so the
 * closed lists a row's values are checked against are the Video filter's
 * own (`MATCH_FILTER_OPTIONS`), which the pattern's lists mirror. The
 * writers spell the line with their own separator around
 * `treeWatchFields()`.
 */

/** What a `WATCH:` line starts with. Server-written only, never in the model's catalogue. */
export const ASK_VISUAL_WATCH_PREFIX = "WATCH:";

/** The request a tree's rows answer, as the `WATCH:` line carries it. */
export type AskTreeWatch =
  | {
      kind: "plus-one";
      /** The server's +1 (shot 3) or the returner's (shot 4). */
      phase: "serve" | "return";
      /** Whose +1: the viewer's side, or the opponent's. */
      subject: AskPatternPlayer;
      /** Only points on a first or a second serve; null for both. */
      serveType: "first" | "second" | null;
    }
  | {
      kind: "plays";
      /** Whose shots. */
      subject: AskPatternPlayer;
      /**
       * Only the points the subject won — the winning plays' tree, whose
       * branches count points won, not every point the shot was hit in.
       */
      won?: true;
      /**
       * Only rallies of this Video filter band — when the answer counted
       * exactly that band's rallies (`plays.ts`, `rallyFilterBand`).
       */
      rally?: RallyLengthBand;
    };

const PLAYERS: readonly AskPatternPlayer[] = ["mine", "opponent"];

/** The `WATCH:` line's fields for a request, in the order `parseTreeWatch` reads them. */
export function treeWatchFields(watch: AskTreeWatch): string[] {
  if (watch.kind === "plays") {
    return [
      "plays",
      watch.subject,
      ...(watch.won ? ["won"] : []),
      ...(watch.rally ? [watch.rally] : []),
    ];
  }
  return ["plus-one", watch.phase, watch.subject, watch.serveType ?? "any"];
}

/** The request a `WATCH:` line's fields name, or null for anything else. */
export function parseTreeWatch(fields: readonly string[]): AskTreeWatch | null {
  const [kind, ...rest] = fields.map((field) => field.trim());
  if (kind === "plays") {
    // `plays | <subject> [| won] [| <rally band>]`, in that order.
    const [subject, ...more] = rest;
    const won = more[0] === "won";
    const tail = won ? more.slice(1) : more;
    const rally =
      tail.length === 1 ? oneOf<RallyLengthBand>(tail[0], BANDS) : null;
    if (
      !PLAYERS.includes(subject as AskPatternPlayer) ||
      tail.length > 1 ||
      (tail.length === 1 && rally === null)
    ) {
      return null;
    }
    return {
      kind: "plays",
      subject: subject as AskPatternPlayer,
      ...(won ? { won: true as const } : {}),
      ...(rally ? { rally } : {}),
    };
  }
  if (kind === "plus-one") {
    const [phase, subject, serveType] = rest;
    if (
      rest.length !== 3 ||
      (phase !== "serve" && phase !== "return") ||
      !PLAYERS.includes(subject as AskPatternPlayer) ||
      (serveType !== "first" && serveType !== "second" && serveType !== "any")
    ) {
      return null;
    }
    return {
      kind: "plus-one",
      phase,
      subject: subject as AskPatternPlayer,
      serveType: serveType === "any" ? null : serveType,
    };
  }
  return null;
}

// The Video filter's own lists, which the pattern's mirror. A rally
// direction the filter does not offer (the middle) is no link.
const STROKES = MATCH_FILTER_OPTIONS.customStroke.map((option) => option.value);
const DIRECTIONS = MATCH_FILTER_OPTIONS.customDirection.map(
  (option) => option.value,
);
const SERVE_ZONES = MATCH_FILTER_OPTIONS.serveZone.map(
  (option) => option.value,
);
const RETURN_ZONES = MATCH_FILTER_OPTIONS.returnZone.map(
  (option) => option.value,
);
const COURTS: readonly AskPatternCourt[] = ["Deuce", "Ad"];
const BANDS = MATCH_FILTER_OPTIONS.resultRallyLength.map(
  (option) => option.value,
);

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly string[],
): T | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T)
    : null;
}

const other = (player: AskPatternPlayer): AskPatternPlayer =>
  player === "mine" ? "opponent" : "mine";

/**
 * The pattern a branch's row is, under `watch`, or null when a value in the
 * row is outside the filter's own lists — then there is no link rather than
 * one that selects different points.
 *
 * - A serve +1 branch: the subject served to `zone`, then hit `stroke` in
 *   `direction` as the server's +1 (shot 3), on `court` when the row names
 *   one.
 * - A return +1 branch: the other side served, the subject's return went to
 *   `zone`, then the subject hit `stroke` in `direction` as the returner's
 *   +1 (shot 4).
 * - A plays branch: the subject hit `stroke` in `direction`, anywhere in the
 *   point — and, for the winning plays (`won`), won it, in a rally of the
 *   watch's band when it names one (`treeBranchFilters`). The winning plays
 *   count only the shot that ended the point or drew the miss, which the
 *   filter cannot say, so their film holds every point won with the shot in
 *   the rally; the answer's copy says so.
 */
export function treeBranchPattern(
  watch: AskTreeWatch,
  row: AskRow,
): AskPattern | null {
  const stroke = oneOf<AskPatternStroke>(row.stroke, STROKES);
  const direction = oneOf<AskPatternDirection>(row.direction, DIRECTIONS);
  if (stroke === null || direction === null) return null;
  if (watch.kind === "plays") {
    return {
      serve: null,
      returnShot: null,
      plusOne: null,
      shots: [
        {
          player: watch.subject,
          strokes: [stroke],
          directions: [direction],
          within: null,
        },
      ],
    };
  }
  const court =
    row.court === null || row.court === undefined
      ? undefined
      : oneOf<AskPatternCourt>(row.court, COURTS);
  if (court === null) return null;
  const plusOne = {
    after: watch.phase,
    strokes: [stroke],
    directions: [direction],
  };
  if (watch.phase === "serve") {
    const zone = oneOf<AskPatternServeZone>(row.zone, SERVE_ZONES);
    if (zone === null) return null;
    return {
      ...(court ? { court } : {}),
      serve: { server: watch.subject, zones: [zone], type: watch.serveType },
      returnShot: null,
      plusOne,
      shots: [],
    };
  }
  const zone = oneOf<AskPatternReturnZone>(row.zone, RETURN_ZONES);
  if (zone === null) return null;
  return {
    ...(court ? { court } : {}),
    serve: { server: other(watch.subject), zones: [], type: watch.serveType },
    returnShot: { strokes: [], zones: [zone] },
    plusOne,
    shots: [],
  };
}

/** The branch's points as the Video tab's filters, or null when the filter cannot say it. */
export function treeBranchFilters(
  watch: AskTreeWatch,
  row: AskRow,
): MatchFilters | null {
  const pattern = treeBranchPattern(watch, row);
  const filters = pattern ? patternMatchFilters(pattern) : null;
  if (filters === null || watch.kind !== "plays") return filters;
  return {
    ...filters,
    // Won or lost is the viewer's side's (`MatchFilters.resultOutcome`): the
    // opponent's points won are the viewer's points lost.
    ...(watch.won
      ? { resultOutcome: [watch.subject === "mine" ? "won" : "lost"] }
      : {}),
    ...(watch.rally ? { resultRallyLength: [watch.rally] } : {}),
  };
}

/** The filter as the URL carries it (`?f=`), or null: what a tree branch's `watch` holds. */
export function treeBranchWatch(
  watch: AskTreeWatch,
  row: AskRow,
): string | null {
  const filters = treeBranchFilters(watch, row);
  if (filters === null) return null;
  const f = serializeMatchFilters(filters);
  return f === "" ? null : f;
}
