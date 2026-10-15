import { isUuid } from "@/lib/admin/validation";
import { gameNumbersInSet } from "@/lib/data/game-in-set";
import {
  filtersEqual,
  serializeMatchFilters,
  type MatchFilters,
  type RallyLengthBand,
  type ScoreType,
  type ServeType,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  matchFilmPointsHref,
  MAX_POINT_SET,
} from "@/lib/match-video/point-set";
import type { AskDatabase } from "@/lib/services/ask/ask";
import {
  isRecord,
  numberOrNull,
  stringOrNull,
  type AskSourceMatch,
} from "@/lib/services/ask/events";
import {
  figureMatchFilters,
  measureForLabel,
  watchHref,
} from "@/lib/services/ask/figure-video";
import { askMeasure } from "@/lib/services/ask/measures";
import type { AskScope } from "@/lib/services/ask/scope";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import type {
  AskShowFilm,
  AskShowPoint,
  AskShowResponse,
} from "@/lib/services/ask/show-response";

/**
 * "Show me" (roadmap 6.1): the points behind a saved answer, as the film can
 * play them. A FIXED action, never a model-written one — the model wrote the
 * answer's scope once, when it planned the question, and this re-runs only
 * that scope:
 *
 *   with scope as (<the saved scope_sql>)
 *   select p.match_id, count(*) … from ask.points p
 *   where p.match_id in (select match_id from scope) [and <the measure>]
 *
 * never the answer's aggregate `sql`. The measure is the answer's HEADLINE
 * figure — its first figure that names a measure, or, when it saved no
 * figures, its block's first row that does — and narrows when
 * `figure-video.ts` knows the Video tab's filter for it (second serves,
 * break points, long rallies), translated here into the same predicate over
 * `ask.points` / `ask.point_plays`; the link carries `?f=` as well, so the
 * tab's own filter — the authoritative one — makes the same cut over
 * whatever the server admitted. A headline with no filter narrows nothing,
 * and the response says so (`filters: null`) rather than passing every point
 * of the match off as the answer's.
 *
 * One match in scope answers the points themselves (number, set, game,
 * score, result, won) and a link that opens the film on the first with the
 * rest queued (`?pn=`, `point-set.ts`); several answer one row per match,
 * each with its count and its own film link. `video_time` is read through
 * the signed-in client from `public.points`, never from the `ask` views,
 * which keep it from the model on purpose.
 *
 * Pure: the database, the three reads and the film state are handed in
 * (`AskShowDeps`), so `tests/ask-show.spec.ts` runs it with none of them
 * real. Every string that reaches `ask_run_query` passes `checkAskSql` first,
 * as `ask.ts` does for a plan read back from a saved answer — a saved answer
 * is its owner's to write.
 */

/* ── The request ──────────────────────────────────────────────────────────── */

export interface AskShowRequest {
  /** The saved assistant message (`ask_messages.id`) the client got from `done`. */
  answerId: string;
}

const BODY_KEYS: ReadonlySet<string> = new Set(["answerId"]);

/** `{ answerId }` and nothing else; an unknown key is refused by name. */
export function readAskShowRequest(
  value: unknown,
): { ok: true; value: AskShowRequest } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: "body_type" };
  for (const key of Object.keys(value)) {
    if (!BODY_KEYS.has(key))
      return { ok: false, reason: `unexpected_field:${key}` };
  }
  if (typeof value.answerId !== "string" || !isUuid(value.answerId)) {
    return { ok: false, reason: "answer_id_type" };
  }
  return { ok: true, value: { answerId: value.answerId } };
}

/* ── The saved answer ─────────────────────────────────────────────────────── */

/** What of a saved answer this action reads, plus whose conversation it is. */
export interface AskShowSavedAnswer {
  scopeSql: string;
  sql: string;
  /** Mock mode saved a sample plan: nothing real to re-run. */
  mock: boolean;
  /** The result columns the figures were cited from (`AskFigureEvent.column`). */
  figureColumns: string[];
  /**
   * The measure the visual block's FIRST row names (`measureForLabel`), or
   * none: the headline's measure when the answer saved no figures, as a
   * table comparing this match with the rest does.
   */
  rowMeasures?: string[];
  /** The conversation's program, or null for a personal one. */
  programId: string | null;
}

/**
 * The plan of a saved answer's `content` (the jsonb `ask_save_exchange_ids`
 * stored), as `previousPlanFromMessages` reads it: `scopeSql` and `sql`
 * both present, and not a mock. Null otherwise.
 */
export function askShowPlanOf(
  content: unknown,
): Pick<
  AskShowSavedAnswer,
  "scopeSql" | "sql" | "mock" | "figureColumns" | "rowMeasures"
> | null {
  if (!isRecord(content)) return null;
  const scopeSql =
    typeof content.scopeSql === "string" ? content.scopeSql.trim() : "";
  const sql = typeof content.sql === "string" ? content.sql.trim() : "";
  if (scopeSql === "" || sql === "") return null;
  const figureColumns = Array.isArray(content.figures)
    ? content.figures.flatMap((figure) =>
        isRecord(figure) &&
        typeof figure.column === "string" &&
        figure.column !== ""
          ? [figure.column]
          : [],
      )
    : [];
  const rows =
    isRecord(content.visual) && Array.isArray(content.visual.rows)
      ? content.visual.rows
      : [];
  // The FIRST row only: it is the headline's. `measureForLabel` knows only
  // measures with a Video preset, so a first row it cannot read ("Total
  // points won", "Winners", a match) leaves none — the whole match, honestly
  // labelled — rather than letting a later row stand in for the headline.
  const first = rows[0];
  const firstColumn =
    isRecord(first) && typeof first.label === "string"
      ? measureForLabel(first.label)
      : null;
  const rowMeasures = firstColumn ? [firstColumn] : [];
  return {
    scopeSql,
    sql,
    mock: content.mock === true,
    figureColumns,
    rowMeasures,
  };
}

/* ── The measure ──────────────────────────────────────────────────────────── */

/**
 * A column as a measure this file can cut on. The planner writes `_lost`
 * columns the dictionary does not carry ("second_serve_points_lost_pct"):
 * they count the same points as their `_won` twin, so they read as it.
 */
function showMeasure(column: string): {
  column: string;
  lost: boolean;
  rate: boolean;
} | null {
  const lost = column.includes("_lost");
  const rate = column.endsWith("_pct");
  const won = column.replace(/_lost/g, "_won");
  for (const candidate of rate ? [won, won.slice(0, -4)] : [won]) {
    if (askMeasure(candidate)) return { column: candidate, lost, rate };
  }
  return null;
}

/** A count of points won ("second_serve_points_won", "long_rally_won") — not games, not a rate. */
const POINTS_WON_KEY = /_points_won$|_rally_won$/;

/** Counts of points won on a preset that already names whose break point it was. */
const BREAK_POINTS_WON: ReadonlySet<string> = new Set([
  "break_points_saved",
  "break_points_converted",
]);

/**
 * Measures whose Video preset holds more points than the figure counts: an
 * ace count opens every serve, a service-games figure every service point,
 * "first serves in" every first serve. The list is still the right film to
 * watch, but not the counted points, so it is not headed as the answer's.
 * Set points carry no side in the preset, so saved and converted cannot be
 * narrowed to the viewer's either.
 */
const BROADER_THAN_COUNTED: ReadonlySet<string> = new Set([
  "aces",
  "double_faults",
  "service_winners",
  "service_games",
  "service_games_won",
  "service_games_won_pct",
  "return_games",
  "return_games_won",
  "return_games_won_pct",
  "first_serves_in",
  "second_serves_in",
  "first_returns_in",
  "second_returns_in",
  "return_contact_inside",
  "return_contact_middle",
  "return_contact_deep",
  "set_points_saved",
  "set_points_converted",
]);

/** The headline's cut, and whether the points it selects are the points it counts. */
export interface AskShowMeasure {
  filters: MatchFilters;
  /** False when the cut is broader than the figure ("Aces: 6" over every serve). */
  counted: boolean;
}

/**
 * The Video-tab cut for the answer's headline figure, or null when it has
 * none. The headline is the first figure column that names a measure; with
 * no such figure, the block's first row. Later figures never stand in for
 * it: a headline with no filter ("Total points won") shows the whole match,
 * honestly labelled, rather than a secondary figure's points under the
 * headline's number.
 *
 * A figure that counts points won or lost (not a rate, and not read off a
 * row label, which cannot tell "7" from "41%") narrows to those points as
 * well: "Second-serve points lost: 10" lists the ten, "Break points saved"
 * the ones saved. A rate lists the points it is a share of, each marked won
 * or lost. A count the cut cannot narrow to (`BROADER_THAN_COUNTED`) still
 * cuts, with `counted: false`.
 */
export function askShowMeasure(
  figureColumns: readonly string[],
  rowMeasures: readonly string[] = [],
): AskShowMeasure | null {
  const pick = (columns: readonly string[]) => {
    for (const column of columns) {
      const measure = showMeasure(column);
      if (measure) return measure;
    }
    return null;
  };
  const fromFigure = pick(figureColumns);
  const headline = fromFigure ?? pick(rowMeasures);
  if (!headline) return null;
  const filters = figureMatchFilters(headline.column);
  const resolved = askMeasure(headline.column);
  if (!filters || !resolved) return null;
  const counted = !BROADER_THAN_COUNTED.has(resolved.key);
  const narrows =
    fromFigure !== null &&
    !headline.rate &&
    (POINTS_WON_KEY.test(resolved.key) || BREAK_POINTS_WON.has(resolved.key));
  if (!narrows) return { filters, counted };
  // From the viewer's side: the opponent's points won are the viewer's lost.
  const won = headline.lost === (resolved.qualifier === "opponent");
  return {
    filters: { ...filters, resultOutcome: [won ? "won" : "lost"] },
    counted: true,
  };
}

/** {@link askShowMeasure}'s cut alone. */
export function askShowMeasureFilters(
  figureColumns: readonly string[],
  rowMeasures: readonly string[] = [],
): MatchFilters | null {
  return askShowMeasure(figureColumns, rowMeasures)?.filters ?? null;
}

const SERVE_TYPE: Record<ServeType, string> = {
  first: "First Serve",
  second: "Second Serve",
};
const RALLY_BAND: Record<RallyLengthBand, string> = {
  short: "short",
  medium: "medium",
  long: "long",
};
const SCORE_FLAG: Record<ScoreType, string> = {
  pressure: "p.is_pressure_point",
  breakpoint: "p.is_break_point",
  setPoint: "p.is_set_point",
  matchPoint: "p.is_match_point",
};

/** A SQL string literal. The values are this file's own closed vocabularies. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function inList(values: readonly string[]): string {
  return values.map(literal).join(", ");
}

/**
 * The preset as a predicate over `ask.points p` (and, through `exists`,
 * `ask.point_plays pp`), ready to append to a `where`: `""` when the preset
 * says nothing these views can test. Only the keys `figure-video.ts` writes
 * are translated — Serve › Player, Type and Zone, Return › Zone, Score type,
 * Result › Outcome and Rally length; the tab's own `?f=` applies the whole preset again.
 */
export function askShowPredicate(filters: MatchFilters | null): string {
  if (!filters) return "";
  const where: string[] = [];
  const plays: string[] = [];
  if (filters.server === "you") where.push("p.i_served = true");
  else if (filters.server === "opponent") where.push("p.i_served = false");
  if (filters.resultOutcome.length === 1) {
    where.push(`p.i_won = ${filters.resultOutcome[0] === "won"}`);
  }
  if (filters.scoreType.length > 0) {
    where.push(
      `(${filters.scoreType.map((type) => `${SCORE_FLAG[type]} = true`).join(" or ")})`,
    );
  }
  if (filters.serveType.length > 0) {
    plays.push(
      `pp.serve_type in (${inList(filters.serveType.map((type) => SERVE_TYPE[type]))})`,
    );
  }
  if (filters.serveZone.length > 0) {
    plays.push(`pp.serve_zone in (${inList(filters.serveZone)})`);
  }
  if (filters.returnZone.length > 0) {
    plays.push(`pp.return_zone in (${inList(filters.returnZone)})`);
  }
  if (filters.resultRallyLength.length > 0) {
    plays.push(
      `pp.rally_band in (${inList(filters.resultRallyLength.map((band) => RALLY_BAND[band]))})`,
    );
  }
  if (plays.length > 0) {
    where.push(
      `exists (select 1 from ask.point_plays pp where pp.match_id = p.match_id and pp.point_number = p.point_number and ${plays.join(" and ")})`,
    );
  }
  return where.length === 0 ? "" : ` and ${where.join(" and ")}`;
}

/** One row per match in scope with a point under the predicate, most points first. */
export function askShowCountSql(predicate: string): string {
  return `select p.match_id, count(*) as points from ask.points p where p.match_id in (select match_id from scope)${predicate} group by p.match_id order by points desc, p.match_id`;
}

/**
 * The points of ONE match in scope, in match order. `matchId` is a uuid the
 * database itself answered (never the body's), checked again here before it
 * is written into SQL. The limit is `ask.exec_query`'s own cap, restated so
 * the query says what it returns.
 */
export function askShowPointsSql(matchId: string, predicate: string): string {
  if (!isUuid(matchId)) throw new Error("askShowPointsSql: not a match id");
  return `select p.point_number, p.i_won, p.i_served from ask.points p where p.match_id in (select match_id from scope) and p.match_id = ${literal(matchId)}${predicate} order by p.point_number limit ${MAX_POINT_SET}`;
}

/* ── The answer ───────────────────────────────────────────────────────────── */

// The wire shape lives beside its client reader (`show-response.ts`).
export type {
  AskShowFilm,
  AskShowPoint,
  AskShowResponse,
} from "@/lib/services/ask/show-response";
export { readAskShowResponse } from "@/lib/services/ask/show-response";

export type AskShowRefusal =
  "not_found" | "no_plan" | "no_points" | "query_failed" | "read_failed";

export type AskShowOutcome =
  | { ok: true; value: AskShowResponse }
  | { ok: false; code: AskShowRefusal; message: string };

/** The `public.points` columns the action reads for one match. */
export interface AskShowPointRow {
  pointNumber: number;
  setNumber: number | null;
  gameNumber: number | null;
  pointScore: string | null;
  gameScore: string | null;
  resultType: string | null;
  videoTime: number | null;
  duration: number | null;
}

/** One `public.points` row of a match, as `gameNumbersInSet()` reads it. */
export interface AskShowGameRow {
  set_number: number;
  game_number: number;
  game_score: string | null;
}

export interface AskShowDeps {
  /** `createAskDatabase()`'s: the two query functions ride the service role, pinned to the viewer. */
  db: AskDatabase;
  /** The saved answer through the signed-in client; null when it is not the viewer's, or not an answer. */
  readAnswer(answerId: string): Promise<AskShowSavedAnswer | null>;
  /** `public.points` through the signed-in client, for the numbers asked. */
  readPoints(
    matchId: string,
    pointNumbers: readonly number[],
  ): Promise<AskShowPointRow[]>;
  /**
   * Every point of the match, in point order, through the signed-in client.
   * `points.game_number` runs on across the match, and renumbering it per set
   * needs every game, not only the points the answer picked.
   */
  readGames(matchId: string): Promise<AskShowGameRow[]>;
  /** Whether the match has film, as the Video tab would find it. */
  readFilm(matchId: string): Promise<AskShowFilm>;
}

const POINTS_UNREADABLE = "The points could not be read. Try again.";

/** The sentences the route sends with each refusal. */
export const ASK_SHOW_MESSAGES: Record<AskShowRefusal, string> = {
  not_found: "That answer was not found.",
  no_plan: "This answer can't be shown on film.",
  no_points: "No points match this answer.",
  query_failed: POINTS_UNREADABLE,
  read_failed: POINTS_UNREADABLE,
};

/** One `ask.matches` row as the client's `AskSourceMatch` (as `ask.ts` reads it). */
function sourceMatchOf(value: unknown, team: boolean): AskSourceMatch | null {
  if (!isRecord(value) || typeof value.match_id !== "string") return null;
  return {
    matchId: value.match_id,
    opponentName: stringOrNull(value.opponent_name),
    playedOn: stringOrNull(value.played_on),
    iWon: typeof value.i_won === "boolean" ? value.i_won : null,
    scoreText: stringOrNull(value.score_text),
    playerName: team ? stringOrNull(value.player_name) : null,
  };
}

function scopeOf(programId: string | null): AskScope {
  return programId
    ? { kind: "team", programId, programName: "" }
    : { kind: "personal" };
}

async function runShowQuery(
  db: AskDatabase,
  scope: AskScope,
  scopeSql: string,
  sql: string,
): Promise<
  | { ok: true; matches: AskSourceMatch[]; rows: Record<string, unknown>[] }
  | { ok: false; message: string }
> {
  const checked = checkAskSql({ scopeSql, sql });
  if (!checked.ok) {
    return {
      ok: false,
      message: `refused by the SQL check: ${checked.reason}`,
    };
  }
  const team = scope.kind === "team";
  const { data, error } = team
    ? await db.rpc("ask_run_team_query", {
        p_program_id: scope.programId,
        scope_sql: scopeSql,
        sql,
      })
    : await db.rpc("ask_run_query", { scope_sql: scopeSql, sql });
  if (error) return { ok: false, message: error.message };
  if (
    !isRecord(data) ||
    !Array.isArray(data.matches) ||
    !Array.isArray(data.rows)
  ) {
    return {
      ok: false,
      message: "ask_run_query() answered an unexpected shape.",
    };
  }
  return {
    ok: true,
    matches: data.matches.flatMap((row) => sourceMatchOf(row, team) ?? []),
    rows: data.rows.flatMap((row) => (isRecord(row) ? [row] : [])),
  };
}

/** A match no `ask.matches` row described (it should not happen): the id alone. */
function bareMatch(matchId: string): AskSourceMatch {
  return {
    matchId,
    opponentName: null,
    playedOn: null,
    iWon: null,
    scoreText: null,
    playerName: null,
  };
}

/**
 * The points behind one saved answer. See the file note for the shape of
 * the answer; the refusals are, in order: `not_found` (not the viewer's, or
 * not an answer), `no_plan` (a mock, or an answer saved without one),
 * `query_failed` (the scope would not run), `no_points` (it ran and admitted
 * nothing), `read_failed` (the point rows could not be read).
 */
export async function showAnswerPoints(
  deps: AskShowDeps,
  answerId: string,
): Promise<AskShowOutcome> {
  const refuse = (code: AskShowRefusal, detail?: string): AskShowOutcome => ({
    ok: false,
    code,
    message: detail ?? ASK_SHOW_MESSAGES[code],
  });

  const saved = await deps.readAnswer(answerId);
  if (!saved) return refuse("not_found");
  if (saved.mock || saved.scopeSql.trim() === "" || saved.sql.trim() === "") {
    return refuse("no_plan");
  }

  const scope = scopeOf(saved.programId);
  const measure = askShowMeasure(saved.figureColumns, saved.rowMeasures);
  const filters = measure?.filters ?? null;
  const predicate = askShowPredicate(filters);
  const serialized = filters ? serializeMatchFilters(filters) || null : null;

  const counted = await runShowQuery(
    deps.db,
    scope,
    saved.scopeSql,
    askShowCountSql(predicate),
  );
  if (!counted.ok) return refuse("query_failed", counted.message);

  const byMatch = new Map(
    counted.matches.map((match) => [match.matchId, match]),
  );
  const counts = counted.rows.flatMap((row) => {
    const matchId = row.match_id;
    const points = numberOrNull(row.points);
    return typeof matchId === "string" &&
      isUuid(matchId) &&
      points &&
      points > 0
      ? [{ matchId, points: Math.trunc(points) }]
      : [];
  });
  if (counts.length === 0) return refuse("no_points");

  if (counts.length > 1) {
    return {
      ok: true,
      value: {
        kind: "matches",
        matches: counts.map(({ matchId, points }) => {
          return {
            match: byMatch.get(matchId) ?? bareMatch(matchId),
            points,
            href: watchHref(matchId, serialized ?? ""),
          };
        }),
      },
    };
  }

  const [{ matchId, points: total }] = counts;
  const listed = await runShowQuery(
    deps.db,
    scope,
    saved.scopeSql,
    askShowPointsSql(matchId, predicate),
  );
  if (!listed.ok) return refuse("query_failed", listed.message);

  const sides = new Map<
    number,
    { iWon: boolean | null; iServed: boolean | null }
  >();
  for (const row of listed.rows) {
    const n = numberOrNull(row.point_number);
    if (n === null || !Number.isInteger(n) || n <= 0) continue;
    sides.set(n, {
      iWon: typeof row.i_won === "boolean" ? row.i_won : null,
      iServed: typeof row.i_served === "boolean" ? row.i_served : null,
    });
  }
  const numbers = [...sides.keys()].sort((a, b) => a - b);
  if (numbers.length === 0) return refuse("no_points");

  let rows: AskShowPointRow[];
  let games: AskShowGameRow[];
  let film: AskShowFilm;
  try {
    [rows, games, film] = await Promise.all([
      deps.readPoints(matchId, numbers),
      deps.readGames(matchId),
      deps.readFilm(matchId),
    ]);
  } catch (error) {
    return refuse(
      "read_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
  const detail = new Map(rows.map((row) => [row.pointNumber, row]));
  // Counted from 1 in each set, as the film room numbers them.
  const gameInSet = gameNumbersInSet(games);

  return {
    ok: true,
    value: {
      kind: "match",
      match: byMatch.get(matchId) ?? bareMatch(matchId),
      href: matchFilmPointsHref(matchId, numbers, serialized),
      filters: serialized,
      points: numbers.map((pointNumber) => {
        const side = sides.get(pointNumber)!;
        const row = detail.get(pointNumber);
        return {
          pointNumber,
          setNumber: row?.setNumber ?? null,
          gameNumber:
            row && row.setNumber !== null && row.gameNumber !== null
              ? gameInSet({
                  set_number: row.setNumber,
                  game_number: row.gameNumber,
                })
              : null,
          pointScore: row?.pointScore ?? null,
          gameScore: row?.gameScore ?? null,
          resultType: row?.resultType ?? null,
          iWon: side.iWon,
          iServed: side.iServed,
          videoTime: row?.videoTime ?? null,
          duration: row?.duration ?? null,
        };
      }),
      truncated: total > numbers.length,
      counted: measure?.counted ?? false,
      film,
    },
  };
}
