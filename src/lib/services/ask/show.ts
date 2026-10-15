import { isUuid } from "@/lib/admin/validation";
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
import { figureMatchFilters, watchHref } from "@/lib/services/ask/figure-video";
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
 * never the answer's aggregate `sql`. The measure is the answer's own figure
 * column when `figure-video.ts` knows the Video tab's filter for it (second
 * serves, break points, long rallies), translated here into the same
 * predicate over `ask.points` / `ask.point_plays`; the link carries `?f=` as
 * well, so the tab's own filter — the authoritative one — makes the same cut
 * over whatever the server admitted. Two figures with different presets name
 * no one cut, and narrow nothing.
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
  "scopeSql" | "sql" | "mock" | "figureColumns"
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
  return { scopeSql, sql, mock: content.mock === true, figureColumns };
}

/* ── The measure ──────────────────────────────────────────────────────────── */

/**
 * The one Video-tab cut the answer's figures name, or null: no figure with a
 * known preset, or two figures with different presets (which would make the
 * action show one figure's points under another figure's number).
 */
export function askShowMeasureFilters(
  columns: readonly string[],
): MatchFilters | null {
  let chosen: MatchFilters | null = null;
  for (const column of columns) {
    const filters = figureMatchFilters(column);
    if (!filters) continue;
    if (chosen === null) chosen = filters;
    else if (!filtersEqual(chosen, filters)) return null;
  }
  return chosen;
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
 * are translated — Serve › Player, Type and Zone, Return › Zone, Score type
 * and Rally length; the tab's own `?f=` applies the whole preset again.
 */
export function askShowPredicate(filters: MatchFilters | null): string {
  if (!filters) return "";
  const where: string[] = [];
  const plays: string[] = [];
  if (filters.server === "you") where.push("p.i_served = true");
  else if (filters.server === "opponent") where.push("p.i_served = false");
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
  const filters = askShowMeasureFilters(saved.figureColumns);
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
  let film: AskShowFilm;
  try {
    [rows, film] = await Promise.all([
      deps.readPoints(matchId, numbers),
      deps.readFilm(matchId),
    ]);
  } catch (error) {
    return refuse(
      "read_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
  const detail = new Map(rows.map((row) => [row.pointNumber, row]));

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
          gameNumber: row?.gameNumber ?? null,
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
      film,
    },
  };
}
