import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  parseMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchFilmEntry } from "@/lib/match-video/film-entry";
import {
  askShowCountSql,
  askShowMeasureFilters,
  askShowPlanOf,
  askShowPointsSql,
  askShowPredicate,
  readAskShowRequest,
  readAskShowResponse,
  showAnswerPoints,
  type AskShowDeps,
  type AskShowFilm,
  type AskShowGameRow,
  type AskShowResponse,
  type AskShowSavedAnswer,
} from "@/lib/services/ask/show";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import { MUTATION_BODY_MAX_BYTES } from "@/lib/services/match-video/http";
import { createLoader } from "./fixtures/vm-modules";

/**
 * "Show me" (roadmap 6.1): `show.ts` offline, then `POST /api/ask/show`
 * through `createLoader` with only its edges faked — the session, `.rpc()`
 * and `.from()` on the cookie client, the service-role client's `.rpc()`
 * (anything else read off it throws), the two film loaders and the site
 * URL. Everything between them is the real code: `http.ts`'s origin check
 * and bounded read, `createAskDatabase()`, `show.ts`, the SQL guard.
 *
 * What is pinned: that the action re-runs ONLY the saved scope — the SQL it
 * sends names `ask.points`, never the answer's own `sql` — through the
 * service-role client with the SESSION user as the viewer; that the saved
 * answer and the point rows are read through the user's client and nothing
 * else is; every refusal's status and code; and the shape of both answers.
 */

const ROUTE = "src/app/api/ask/show/route.ts";
const URL_ = "http://localhost/api/ask/show";

const USER_ID = "11111111-0000-4000-8000-000000000001";
const ANSWER_ID = "00000000-0000-4000-8000-0000000000a1";
const PROGRAM_ID = "eeeeeeee-0000-4000-8000-000000000005";
const MATCH_A = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";
const MATCH_B = "8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d";
const SCOPE_SQL = `select match_id from ask.matches where match_id = '${MATCH_A}'`;
const ANSWER_SQL =
  "select count(*) filter (where i_won) as won from ask.points where match_id in (select match_id from scope)";

const MATCH_ROW_A = {
  match_id: MATCH_A,
  opponent_name: "Anna Lee",
  played_on: "2026-09-14",
  i_won: true,
  score_text: "6-4 6-3",
  player_name: "Mara Sokolov",
};
const MATCH_ROW_B = {
  match_id: MATCH_B,
  opponent_name: "Bea Ortiz",
  played_on: "2026-08-02",
  i_won: false,
  score_text: "3-6 4-6",
  player_name: "Mara Sokolov",
};

const READY: Extract<AskShowFilm, { state: "ready" }> = {
  state: "ready",
  source: "attachment",
  playback: {
    url: "https://blob.example/film.mp4?sig=x",
    expiresAt: "2026-10-15T12:30:00.000Z",
    offsetSeconds: -4.5,
    durationSeconds: 5400,
  },
};

/* ── show.ts ──────────────────────────────────────────────────────────────── */

test.describe("the request", () => {
  test("is `{ answerId }` and nothing else", () => {
    expect(readAskShowRequest({ answerId: ANSWER_ID })).toEqual({
      ok: true,
      value: { answerId: ANSWER_ID },
    });
    for (const body of [
      null,
      [],
      {},
      { answerId: "not-a-uuid" },
      { answerId: ANSWER_ID, userId: USER_ID },
      { answerId: 4 },
    ]) {
      expect(readAskShowRequest(body).ok).toBe(false);
    }
  });
});

test.describe("the saved answer's plan", () => {
  test("reads scope, sql and the figures' columns; a mock or a planless answer reads as none", () => {
    expect(
      askShowPlanOf({
        scopeSql: ` ${SCOPE_SQL} `,
        sql: ANSWER_SQL,
        figures: [
          {
            label: "Second serves won",
            value: "41%",
            column: "second_serve_won_pct",
          },
          { label: "Points", value: "88" },
          { label: "x", value: "y", column: "" },
        ],
      }),
    ).toEqual({
      scopeSql: SCOPE_SQL,
      sql: ANSWER_SQL,
      mock: false,
      figureColumns: ["second_serve_won_pct"],
      rowMeasures: [],
    });
    // No figures saved: the block's rows name the measure.
    expect(
      askShowPlanOf({
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        figures: [],
        visual: {
          kind: "table",
          columns: ["Selected matches", "All matches"],
          rows: [
            { label: "Second-serve points won", cells: ["41.2%", "49.2%"] },
            { label: "Not a measure", cells: ["1", "2"] },
          ],
        },
      })?.rowMeasures,
    ).toEqual(["second_serve_points_won"]);
    expect(
      askShowPlanOf({ scopeSql: SCOPE_SQL, sql: ANSWER_SQL, mock: true })?.mock,
    ).toBe(true);
    expect(askShowPlanOf({ scopeSql: SCOPE_SQL })).toBeNull();
    expect(askShowPlanOf({ headline: "Well." })).toBeNull();
    expect(askShowPlanOf("text")).toBeNull();
  });
});

test.describe("the measure", () => {
  test("the headline figure decides: the first figure naming a measure, never a later one", () => {
    const secondServes = {
      ...EMPTY_MATCH_FILTERS,
      server: "you" as const,
      serveType: ["second" as const],
    };
    expect(askShowMeasureFilters(["second_serve_won_pct"])).toEqual(
      secondServes,
    );
    // Not-a-measure columns are skipped to reach the headline.
    expect(
      askShowMeasureFilters(["n", "second_serve_won_pct", "first_serves_in"]),
    ).toEqual(secondServes);
    // A headline with no filter shows the whole match; a later figure never stands in.
    expect(
      askShowMeasureFilters(["total_points_won", "second_serves"]),
    ).toBeNull();
    expect(askShowMeasureFilters(["matches", "wins"])).toBeNull();
    expect(askShowMeasureFilters([])).toBeNull();
  });

  test("a `_lost` rate reads as its won twin's points: second serves, not every service point", () => {
    // The live thread: "Second-serve points lost 58.8%" then "Double faults".
    expect(
      askShowMeasureFilters(["second_serve_points_lost_pct", "double_faults"]),
    ).toEqual({ ...EMPTY_MATCH_FILTERS, server: "you", serveType: ["second"] });
  });

  test("a count of points won or lost narrows to those points; a rate does not", () => {
    expect(askShowMeasureFilters(["second_serve_points_won"])).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
      resultOutcome: ["won"],
    });
    expect(askShowMeasureFilters(["second_serve_points_lost"])).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
      resultOutcome: ["lost"],
    });
    // The opponent's points won are the viewer's lost.
    expect(
      askShowMeasureFilters(["opp_first_serve_points_won"])?.resultOutcome,
    ).toEqual(["lost"]);
    expect(
      askShowMeasureFilters(["second_serve_won_pct"])?.resultOutcome,
    ).toEqual([]);
    expect(askShowPredicate(askShowMeasureFilters(["long_rally_won"]))).toBe(
      " and p.i_won = true and exists (select 1 from ask.point_plays pp where pp.match_id = p.match_id and pp.point_number = p.point_number and pp.rally_band in ('long'))",
    );
  });

  test("no figures: the block's first row names the headline, as a rate", () => {
    // "Second-serve points won" reads back as the count key, but a row label
    // cannot tell "7" from "41%": it narrows to second serves, not to wins.
    expect(askShowMeasureFilters([], ["second_serve_points_won"])).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
    });
    // A figure, when there is one, wins over the rows.
    expect(
      askShowMeasureFilters(["first_serve_pct"], ["second_serve_points_won"])
        ?.serveType,
    ).toEqual(["first"]);
  });

  test("the predicate speaks ask.points and, through exists, ask.point_plays", () => {
    expect(askShowPredicate(null)).toBe("");
    expect(askShowPredicate(EMPTY_MATCH_FILTERS)).toBe("");
    expect(
      askShowPredicate({ ...EMPTY_MATCH_FILTERS, server: "opponent" }),
    ).toBe(" and p.i_served = false");
    expect(
      askShowPredicate({
        ...EMPTY_MATCH_FILTERS,
        server: "you",
        scoreType: ["breakpoint"],
        serveType: ["second"],
        serveZone: ["Wide", "T"],
        resultRallyLength: ["long"],
      }),
    ).toBe(
      " and p.i_served = true and (p.is_break_point = true) and exists (select 1 from ask.point_plays pp where pp.match_id = p.match_id and pp.point_number = p.point_number and pp.serve_type in ('Second Serve') and pp.serve_zone in ('Wide', 'T') and pp.rally_band in ('long'))",
    );
    expect(
      askShowPredicate({
        ...EMPTY_MATCH_FILTERS,
        server: "opponent",
        returnZone: ["Down the Line"],
      }),
    ).toContain("pp.return_zone in ('Down the Line')");
  });

  test("both queries pass the SQL guard, with and without a predicate", () => {
    const predicate = askShowPredicate({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      scoreType: ["breakpoint", "setPoint"],
      serveType: ["second"],
    });
    for (const sql of [
      askShowCountSql(""),
      askShowCountSql(predicate),
      askShowPointsSql(MATCH_A, ""),
      askShowPointsSql(MATCH_A, predicate),
    ]) {
      expect(checkAskSql({ scopeSql: SCOPE_SQL, sql })).toEqual({ ok: true });
      expect(sql).toContain("from ask.points p");
      expect(sql).toContain("(select match_id from scope)");
    }
    expect(askShowPointsSql(MATCH_A, "")).toContain("limit 200");
    expect(() => askShowPointsSql("x'; drop table points; --", "")).toThrow();
  });
});

/** Fake deps: the two queries answered from `counts` and `points`, the reads from the rest. */
function fakeDeps(world: {
  saved?: AskShowSavedAnswer | null;
  counts?: { match_id: string; points: number }[];
  matches?: Record<string, unknown>[];
  listed?: {
    point_number: number;
    i_won: boolean | null;
    i_served: boolean | null;
  }[];
  rows?: Record<string, unknown>[];
  games?: AskShowGameRow[];
  film?: AskShowFilm;
  pointsFail?: boolean;
}) {
  const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
  const reads: string[] = [];
  const deps: AskShowDeps = {
    db: {
      async rpc(fn, args) {
        calls.push({ fn, args });
        const sql = String(args?.sql ?? "");
        const rows = sql.includes("count(*)")
          ? (world.counts ?? [{ match_id: MATCH_A, points: 2 }])
          : (world.listed ?? [
              { point_number: 3, i_won: true, i_served: true },
              { point_number: 7, i_won: false, i_served: true },
            ]);
        return {
          data: { matches: world.matches ?? [MATCH_ROW_A], rows },
          error: null,
        };
      },
    },
    async readAnswer(id) {
      reads.push(`answer:${id}`);
      return world.saved === undefined
        ? {
            scopeSql: SCOPE_SQL,
            sql: ANSWER_SQL,
            mock: false,
            figureColumns: [],
            programId: null,
          }
        : world.saved;
    },
    async readPoints(matchId, numbers) {
      reads.push(`points:${matchId}:${numbers.join(",")}`);
      if (world.pointsFail) throw new Error("rls said no");
      return (
        world.rows?.map((row) => ({
          pointNumber: row.pointNumber as number,
          setNumber: (row.setNumber as number | null) ?? null,
          gameNumber: (row.gameNumber as number | null) ?? null,
          pointScore: (row.pointScore as string | null) ?? null,
          gameScore: (row.gameScore as string | null) ?? null,
          resultType: (row.resultType as string | null) ?? null,
          videoTime: (row.videoTime as number | null) ?? null,
          duration: (row.duration as number | null) ?? null,
        })) ?? [
          {
            pointNumber: 3,
            setNumber: 1,
            gameNumber: 1,
            pointScore: "30-15",
            gameScore: "0-0",
            resultType: "Ace",
            videoTime: 12.5,
            duration: 3,
          },
        ]
      );
    },
    async readGames(matchId) {
      reads.push(`games:${matchId}`);
      return (
        world.games ?? [
          { set_number: 1, game_number: 1, game_score: "0-0" },
          { set_number: 1, game_number: 2, game_score: "1-0" },
        ]
      );
    },
    async readFilm(matchId) {
      reads.push(`film:${matchId}`);
      return world.film ?? READY;
    },
  };
  return { deps, calls, reads };
}

test.describe("showAnswerPoints", () => {
  test("one match: the count, then the points — sides from the view, the rest from public.points, a queued link", async () => {
    const { deps, calls, reads } = fakeDeps({});
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(calls.map((call) => call.fn)).toEqual([
      "ask_run_query",
      "ask_run_query",
    ]);
    // Only the saved scope and this file's own SQL ever reach the database.
    for (const call of calls) {
      expect(call.args?.scope_sql).toBe(SCOPE_SQL);
      expect(String(call.args?.sql)).not.toContain("filter (where i_won)");
    }
    expect(String(calls[1].args?.sql)).toContain(`p.match_id = '${MATCH_A}'`);
    expect(reads).toEqual([
      `answer:${ANSWER_ID}`,
      `points:${MATCH_A}:3,7`,
      `games:${MATCH_A}`,
      `film:${MATCH_A}`,
    ]);
    expect(outcome.value).toEqual({
      kind: "match",
      match: {
        matchId: MATCH_A,
        opponentName: "Anna Lee",
        playedOn: "2026-09-14",
        iWon: true,
        scoreText: "6-4 6-3",
        playerName: null,
      },
      href: `/dashboard/matches/${MATCH_A}?tab=film&pn=3%2C7`,
      filters: null,
      points: [
        {
          pointNumber: 3,
          setNumber: 1,
          gameNumber: 1,
          pointScore: "30-15",
          gameScore: "0-0",
          resultType: "Ace",
          iWon: true,
          iServed: true,
          videoTime: 12.5,
          duration: 3,
        },
        // A row `public.points` did not answer keeps its sides and nothing else.
        {
          pointNumber: 7,
          setNumber: null,
          gameNumber: null,
          pointScore: null,
          gameScore: null,
          resultType: null,
          iWon: false,
          iServed: true,
          videoTime: null,
          duration: null,
        },
      ],
      truncated: false,
      film: READY,
    });
  });

  test("games are numbered per set, from every game of the match, tiebreak as one", async () => {
    // A 6-4 first set (games 1–10), then set 2 stored match-cumulatively:
    // its 4th game is game 14, and a tiebreak split across server changes.
    const games: AskShowGameRow[] = [];
    for (let game = 1; game <= 10; game += 1) {
      for (let i = 0; i < 4; i += 1) {
        games.push({ set_number: 1, game_number: game, game_score: "x" });
      }
    }
    for (let game = 11; game <= 22; game += 1) {
      for (let i = 0; i < 4; i += 1) {
        games.push({ set_number: 2, game_number: game, game_score: `${game}` });
      }
    }
    games.push({ set_number: 2, game_number: 23, game_score: "6-6" });
    games.push({ set_number: 2, game_number: 24, game_score: "6-6" });
    games.push({ set_number: 2, game_number: 24, game_score: "6-6" });
    games.push({ set_number: 2, game_number: 25, game_score: "6-6" });
    const { deps } = fakeDeps({
      listed: [
        { point_number: 5, i_won: true, i_served: true },
        { point_number: 54, i_won: false, i_served: false },
        { point_number: 92, i_won: true, i_served: true },
        { point_number: 94, i_won: true, i_served: false },
      ],
      rows: [
        { pointNumber: 5, setNumber: 1, gameNumber: 2 },
        { pointNumber: 54, setNumber: 2, gameNumber: 14 },
        { pointNumber: 92, setNumber: 2, gameNumber: 24 },
        { pointNumber: 94, setNumber: 2, gameNumber: 25 },
      ],
      games,
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== "match") return;
    expect(
      outcome.value.points.map((point) => [
        point.pointNumber,
        point.setNumber,
        point.gameNumber,
      ]),
    ).toEqual([
      [5, 1, 2],
      [54, 2, 4],
      [92, 2, 13],
      [94, 2, 13],
    ]);
  });

  test("a figure's measure narrows the queries and rides the link as `?f=`", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: ["second_serve_won_pct"],
        programId: null,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== "match") return;
    for (const call of calls) {
      expect(String(call.args?.sql)).toContain("p.i_served = true");
      expect(String(call.args?.sql)).toContain(
        "pp.serve_type in ('Second Serve')",
      );
    }
    expect(outcome.value.filters).not.toBeNull();
    expect(parseMatchFilters(outcome.value.filters)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
    });
    expect(outcome.value.href).toContain(`f=${outcome.value.filters}`);
  });

  test("a second-serve answer with no figures: its table row narrows both queries, never the whole match", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: [],
        rowMeasures: ["second_serve_points_won"],
        programId: null,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== "match") return;
    for (const call of calls) {
      expect(String(call.args?.sql)).toContain(
        "pp.serve_type in ('Second Serve')",
      );
      expect(String(call.args?.sql)).not.toContain("p.i_won =");
    }
    expect(parseMatchFilters(outcome.value.filters)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
    });
  });

  test("a points-lost count lists only the lost points, and its link says so", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: ["second_serve_points_lost"],
        programId: null,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== "match") return;
    for (const call of calls) {
      expect(String(call.args?.sql)).toContain("p.i_won = false");
    }
    expect(parseMatchFilters(outcome.value.filters).resultOutcome).toEqual([
      "lost",
    ]);
  });

  test("an answer with no point-level measure: every point, and `filters: null` to say so", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: ["total_points_won"],
        rowMeasures: [],
        programId: null,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== "match") return;
    for (const call of calls) {
      expect(String(call.args?.sql)).not.toContain(" and p.i_");
      expect(String(call.args?.sql)).not.toContain("point_plays");
    }
    expect(outcome.value.filters).toBeNull();
  });

  test("a team conversation runs the team function with its program", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: SCOPE_SQL,
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: [],
        programId: PROGRAM_ID,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome.ok).toBe(true);
    expect(calls.map((call) => call.fn)).toEqual([
      "ask_run_team_query",
      "ask_run_team_query",
    ]);
    expect(calls[0].args?.p_program_id).toBe(PROGRAM_ID);
    if (outcome.ok && outcome.value.kind === "match") {
      expect(outcome.value.match.playerName).toBe("Mara Sokolov");
    }
  });

  test("several matches: one row each with its count and its own film link, after ONE query", async () => {
    const { deps, calls, reads } = fakeDeps({
      counts: [
        { match_id: MATCH_B, points: 9 },
        { match_id: MATCH_A, points: 4 },
      ],
      matches: [MATCH_ROW_A, MATCH_ROW_B],
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(calls).toHaveLength(1);
    expect(reads).toEqual([`answer:${ANSWER_ID}`]);
    expect(outcome).toEqual({
      ok: true,
      value: {
        kind: "matches",
        matches: [
          {
            match: expect.objectContaining({
              matchId: MATCH_B,
              opponentName: "Bea Ortiz",
            }),
            points: 9,
            href: `/dashboard/matches/${MATCH_B}?tab=film`,
          },
          {
            match: expect.objectContaining({ matchId: MATCH_A }),
            points: 4,
            href: `/dashboard/matches/${MATCH_A}?tab=film`,
          },
        ],
      },
    });
  });

  test("truncated when the match holds more points than the list carried", async () => {
    const { deps } = fakeDeps({ counts: [{ match_id: MATCH_A, points: 250 }] });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(
      outcome.ok && outcome.value.kind === "match" && outcome.value.truncated,
    ).toBe(true);
  });

  test("the refusals: not found, no plan, no points, a read that failed", async () => {
    expect(
      await showAnswerPoints(fakeDeps({ saved: null }).deps, ANSWER_ID),
    ).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(
      await showAnswerPoints(
        fakeDeps({
          saved: {
            scopeSql: SCOPE_SQL,
            sql: ANSWER_SQL,
            mock: true,
            figureColumns: [],
            programId: null,
          },
        }).deps,
        ANSWER_ID,
      ),
    ).toMatchObject({ ok: false, code: "no_plan" });
    expect(
      await showAnswerPoints(
        fakeDeps({
          saved: {
            scopeSql: "",
            sql: "",
            mock: false,
            figureColumns: [],
            programId: null,
          },
        }).deps,
        ANSWER_ID,
      ),
    ).toMatchObject({ ok: false, code: "no_plan" });
    expect(
      await showAnswerPoints(fakeDeps({ counts: [] }).deps, ANSWER_ID),
    ).toMatchObject({
      ok: false,
      code: "no_points",
    });
    expect(
      await showAnswerPoints(
        fakeDeps({ counts: [{ match_id: MATCH_A, points: 0 }] }).deps,
        ANSWER_ID,
      ),
    ).toMatchObject({ ok: false, code: "no_points" });
    expect(
      await showAnswerPoints(fakeDeps({ pointsFail: true }).deps, ANSWER_ID),
    ).toMatchObject({
      ok: false,
      code: "read_failed",
    });
  });

  test("a scope the guard refuses never reaches the database", async () => {
    const { deps, calls } = fakeDeps({
      saved: {
        scopeSql: "delete from ask.matches",
        sql: ANSWER_SQL,
        mock: false,
        figureColumns: [],
        programId: null,
      },
    });
    const outcome = await showAnswerPoints(deps, ANSWER_ID);
    expect(outcome).toMatchObject({ ok: false, code: "query_failed" });
    expect(calls).toHaveLength(0);
  });
});

test("the response reads back whole, and a foreign link does not", () => {
  const match: AskShowResponse = {
    kind: "match",
    match: MATCH_ROW_A_AS_SOURCE(),
    href: `/dashboard/matches/${MATCH_A}?tab=film&pn=3`,
    filters: "sp.y",
    points: [
      {
        pointNumber: 3,
        setNumber: 1,
        gameNumber: 1,
        pointScore: "30-15",
        gameScore: "0-0",
        resultType: "Ace",
        iWon: true,
        iServed: true,
        videoTime: 12.5,
        duration: 3,
      },
    ],
    truncated: false,
    film: READY,
  };
  expect(readAskShowResponse(JSON.parse(JSON.stringify(match)))).toEqual(match);
  expect(
    readAskShowResponse({ ...match, href: "https://evil.example/x" }),
  ).toBeNull();
  expect(
    readAskShowResponse({ ...match, film: { state: "sideways" } }),
  ).toBeNull();
  const matches: AskShowResponse = {
    kind: "matches",
    matches: [
      {
        match: MATCH_ROW_A_AS_SOURCE(),
        points: 4,
        href: `/dashboard/matches/${MATCH_A}?tab=film`,
      },
    ],
  };
  expect(readAskShowResponse(JSON.parse(JSON.stringify(matches)))).toEqual(
    matches,
  );
  expect(
    readAskShowResponse({ kind: "matches", matches: [{ points: 4 }] }),
  ).toBeNull();
  expect(readAskShowResponse(null)).toBeNull();
});

function MATCH_ROW_A_AS_SOURCE() {
  return {
    matchId: MATCH_A,
    opponentName: "Anna Lee",
    playedOn: "2026-09-14",
    iWon: true,
    scoreText: "6-4 6-3",
    playerName: null,
  };
}

/* ── The route ────────────────────────────────────────────────────────────── */

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

interface World {
  signedIn: boolean;
  serviceKey: boolean;
  /** The `ask_messages` row (with its conversation embedded), or null. An Error fails the read. */
  message:
    | { role: string; content: unknown; program_id: string | null }
    | null
    | Error;
  /** The `public.points` rows. */
  points: Record<string, unknown>[] | Error;
  video: {
    source: string;
    url: string;
    expiresAt: string;
    startTimeSeconds: number;
    attachment: { durationSeconds: number } | null;
  } | null;
  entry: MatchFilmEntry;
  rpc: Record<string, (args: Record<string, unknown>) => RpcResult>;
}

interface Calls {
  rpc: { fn: string; args: Record<string, unknown>; via: "user" | "service" }[];
  /** Every `.from()` on the user client, with the filters it took. */
  tables: { table: string; filters: string[] }[];
  getUser: number;
  adminBuilt: number;
  loaders: string[];
}

const SAVED_CONTENT = {
  headline: "Your second serve held.",
  figures: [
    {
      label: "Second serves won",
      value: "41%",
      column: "second_serve_won_pct",
    },
  ],
  sql: ANSWER_SQL,
  scopeSql: SCOPE_SQL,
  mock: false,
};

function world(overrides: Partial<World> = {}): World {
  return {
    signedIn: true,
    serviceKey: true,
    message: { role: "assistant", content: SAVED_CONTENT, program_id: null },
    points: [
      {
        point_number: 3,
        set_number: 1,
        game_number: 1,
        point_score: "30-15",
        game_score: "0-0",
        result_type: "Ace",
        video_time: 12.5,
        duration: 3,
      },
      {
        point_number: 7,
        set_number: 1,
        game_number: 2,
        point_score: "0-15",
        game_score: "1-0",
        result_type: "Double Fault",
        video_time: 80,
        duration: null,
      },
    ],
    video: {
      source: "attachment",
      url: READY.playback.url,
      expiresAt: READY.playback.expiresAt,
      startTimeSeconds: READY.playback.offsetSeconds,
      attachment: { durationSeconds: 5400 },
    },
    entry: {
      attachment: "absent",
      actions: [],
      problem: null,
      quota: null,
      expiredAt: null,
    },
    rpc: {
      ask_run_query: (args) => ({
        data: {
          matches: [MATCH_ROW_A],
          rows: String(args.sql).includes("count(*)")
            ? [{ match_id: MATCH_A, points: 2 }]
            : [
                { point_number: 3, i_won: true, i_served: true },
                { point_number: 7, i_won: false, i_served: true },
              ],
        },
        error: null,
      }),
      ask_run_team_query: (args) => ({
        data: {
          matches: [MATCH_ROW_A],
          rows: String(args.sql).includes("count(*)")
            ? [{ match_id: MATCH_A, points: 1 }]
            : [{ point_number: 3, i_won: true, i_served: false }],
        },
        error: null,
      }),
    },
    ...overrides,
  };
}

function loadRoute(state: World) {
  const calls: Calls = {
    rpc: [],
    tables: [],
    getUser: 0,
    adminBuilt: 0,
    loaders: [],
  };
  const rpcVia =
    (via: "user" | "service") =>
    async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args, via });
      const answer = state.rpc[fn];
      if (!answer) throw new Error(`unexpected rpc ${fn}`);
      return answer(args);
    };

  // A `.from()` chain that records its filters and answers the table's rows.
  function table(name: string) {
    const record = { table: name, filters: [] as string[] };
    calls.tables.push(record);
    const answer = async (): Promise<{ data: unknown; error: unknown }> => {
      if (name === "ask_messages") {
        if (state.message instanceof Error)
          return { data: null, error: state.message };
        return {
          data: state.message
            ? {
                id: ANSWER_ID,
                role: state.message.role,
                content: state.message.content,
                ask_conversations: { program_id: state.message.program_id },
              }
            : null,
          error: null,
        };
      }
      if (name === "points") {
        if (state.points instanceof Error)
          return { data: null, error: state.points };
        return { data: state.points, error: null };
      }
      throw new Error(`unexpected table ${name}`);
    };
    const chain = {
      select: (columns: string) => {
        record.filters.push(`select:${columns}`);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        record.filters.push(`eq:${column}=${String(value)}`);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        record.filters.push(`in:${column}=${values.join(",")}`);
        return chain;
      },
      order: (column: string) => {
        record.filters.push(`order:${column}`);
        return chain;
      },
      maybeSingle: () => answer(),
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => answer().then(resolve, reject),
    };
    return chain;
  }

  const stubs: Record<string, unknown> = {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => {
            calls.getUser += 1;
            return state.signedIn
              ? { data: { user: { id: USER_ID } }, error: null }
              : {
                  data: { user: null },
                  error: { message: "Auth session missing" },
                };
          },
        },
        rpc: rpcVia("user"),
        from: table,
      }),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        if (!state.serviceKey) {
          throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY environment variable is required",
          );
        }
        calls.adminBuilt += 1;
        return new Proxy(
          { rpc: rpcVia("service") },
          {
            get(target, property) {
              if (property === "rpc") return target.rpc;
              throw new Error(
                `the service-role client is for rpc() only, not .${String(property)}`,
              );
            },
          },
        );
      },
    },
    "@/lib/data/match-video-server": {
      getMatchVideo: async (matchId: string) => {
        calls.loaders.push(`getMatchVideo:${matchId}`);
        return state.video;
      },
    },
    "@/lib/data/match-film-entry-server": {
      getMatchFilmEntry: async (matchId: string) => {
        calls.loaders.push(`getMatchFilmEntry:${matchId}`);
        return state.entry;
      },
    },
    "@/lib/site-url": { siteUrl: () => "http://localhost" },
  };

  const route = createLoader({
    stubs,
    globals: {
      URL,
      URLSearchParams,
      Request,
      Response,
      Headers,
      ReadableStream,
      TextEncoder,
      TextDecoder,
    },
  }).load(ROUTE) as {
    POST: (request: Request) => Promise<Response>;
    runtime: unknown;
    dynamic: unknown;
  };
  return { route, calls };
}

function post(
  body: unknown,
  headers: Record<string, string | null> = {},
): Request {
  const merged: Record<string, string | null> = {
    origin: "http://localhost",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...headers,
  };
  const sent = new Headers();
  for (const [name, value] of Object.entries(merged)) {
    if (value !== null) sent.set(name, value);
  }
  return new Request(URL_, {
    method: "POST",
    headers: sent,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function refused(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return (await response.json()) as {
    error: string;
    code: string;
    detail?: unknown;
  };
}

test.describe("POST /api/ask/show · the route file", () => {
  test("runs on node, never cached, and exports nothing but the handler", () => {
    const { route } = loadRoute(world());
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(Object.keys(route).sort()).toEqual([
      "POST",
      "dynamic",
      "maxDuration",
      "runtime",
    ]);
  });
});

test.describe("POST /api/ask/show · the ladder", () => {
  test("403 before the session is even asked for", async () => {
    const { route, calls } = loadRoute(world());
    const response = await route.POST(
      post({ answerId: ANSWER_ID }, { origin: null }),
    );
    expect(response.status).toBe(403);
    expect((await refused(response)).code).toBe("cross_origin");
    expect(calls.getUser).toBe(0);
  });

  test("401 with no session, and nothing read", async () => {
    const { route, calls } = loadRoute(world({ signedIn: false }));
    const response = await route.POST(post({ answerId: ANSWER_ID }));
    expect(response.status).toBe(401);
    expect((await refused(response)).code).toBe("unauthenticated");
    expect(calls.tables).toHaveLength(0);
    expect(calls.rpc).toHaveLength(0);
  });

  test("413 and 400 for the body: too big, not an object, an unknown key, not a uuid", async () => {
    const { route } = loadRoute(world());
    const big = await route.POST(
      post({ answerId: "x".repeat(MUTATION_BODY_MAX_BYTES) }),
    );
    expect(big.status).toBe(413);
    for (const body of [
      "[]",
      { answerId: ANSWER_ID, viewer: USER_ID },
      { answerId: "nope" },
    ]) {
      const response = await route.POST(post(body));
      expect(response.status).toBe(400);
      expect((await refused(response)).code).toBe("invalid_request");
    }
  });

  test("500 with no service key, before the answer is read", async () => {
    const { route, calls } = loadRoute(world({ serviceKey: false }));
    const response = await route.POST(post({ answerId: ANSWER_ID }));
    expect(response.status).toBe(500);
    expect((await refused(response)).detail).toBe("service_role_unavailable");
    expect(calls.tables).toHaveLength(0);
  });

  test("404 for an answer that is not the viewer's, or is a question", async () => {
    for (const message of [
      null,
      { role: "user", content: { text: "?" }, program_id: null },
    ]) {
      const { route, calls } = loadRoute(world({ message }));
      const response = await route.POST(post({ answerId: ANSWER_ID }));
      expect(response.status).toBe(404);
      expect((await refused(response)).code).toBe("not_found");
      expect(calls.rpc).toHaveLength(0);
    }
  });

  test("409 no_plan for a mock answer, 409 no_points for a scope that admits nothing", async () => {
    const mock = loadRoute(
      world({
        message: {
          role: "assistant",
          content: { ...SAVED_CONTENT, mock: true },
          program_id: null,
        },
      }),
    );
    const refusedMock = await mock.route.POST(post({ answerId: ANSWER_ID }));
    expect(refusedMock.status).toBe(409);
    expect((await refused(refusedMock)).code).toBe("no_plan");
    expect(mock.calls.rpc).toHaveLength(0);

    const empty = loadRoute(
      world({
        rpc: {
          ask_run_query: () => ({
            data: { matches: [], rows: [] },
            error: null,
          }),
        },
      }),
    );
    const refusedEmpty = await empty.route.POST(post({ answerId: ANSWER_ID }));
    expect(refusedEmpty.status).toBe(409);
    expect((await refused(refusedEmpty)).code).toBe("no_points");
  });

  test("500 when the answer read or the scope fails", async () => {
    const read = loadRoute(world({ message: new Error("boom") }));
    expect((await read.route.POST(post({ answerId: ANSWER_ID }))).status).toBe(
      500,
    );
    const query = loadRoute(
      world({
        rpc: {
          ask_run_query: () => ({
            data: null,
            error: { code: "42601", message: "syntax" },
          }),
        },
      }),
    );
    const response = await query.route.POST(post({ answerId: ANSWER_ID }));
    expect(response.status).toBe(500);
    expect((await refused(response)).code).toBe("internal_error");
  });
});

test.describe("POST /api/ask/show · the answer and the boundary", () => {
  test("one match: the saved scope runs through the service role as the session user, the rest as the user", async () => {
    const { route, calls } = loadRoute(world());
    const response = await route.POST(post({ answerId: ANSWER_ID }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = readAskShowResponse(await response.json());
    expect(body?.kind).toBe("match");
    if (!body || body.kind !== "match") return;

    // The two queries, both on the service client, both pinned to the session user, both the saved scope.
    expect(calls.rpc.map((call) => call.via)).toEqual(["service", "service"]);
    for (const call of calls.rpc) {
      expect(call.fn).toBe("ask_run_query");
      expect(call.args.p_viewer).toBe(USER_ID);
      expect(call.args.scope_sql).toBe(SCOPE_SQL);
      expect(String(call.args.sql)).toContain("from ask.points p");
      expect(String(call.args.sql)).not.toContain("filter (where i_won)");
      // The figure's measure, as a predicate.
      expect(String(call.args.sql)).toContain(
        "pp.serve_type in ('Second Serve')",
      );
    }
    // The answer and the points, through the user's client only.
    expect(calls.tables.map((read) => read.table)).toEqual([
      "ask_messages",
      "points",
      "points",
    ]);
    expect(calls.tables[0].filters).toContain(`eq:user_id=${USER_ID}`);
    expect(calls.tables[0].filters).toContain(`eq:id=${ANSWER_ID}`);
    expect(calls.tables[1].filters).toContain(`eq:match_id=${MATCH_A}`);
    expect(calls.tables[1].filters).toContain("in:point_number=3,7");
    // Every game of the match, in point order, for the per-set numbering.
    expect(calls.tables[2].filters).toContain(`eq:match_id=${MATCH_A}`);
    expect(calls.tables[2].filters).toContain("order:point_number");
    expect(calls.tables[2].filters.some((f) => f.startsWith("in:"))).toBe(
      false,
    );
    expect(calls.loaders).toEqual([`getMatchVideo:${MATCH_A}`]);

    expect(body.match.matchId).toBe(MATCH_A);
    expect(
      body.points.map((point) => [
        point.pointNumber,
        point.pointScore,
        point.resultType,
        point.iWon,
        point.videoTime,
      ]),
    ).toEqual([
      [3, "30-15", "Ace", true, 12.5],
      [7, "0-15", "Double Fault", false, 80],
    ]);
    expect(body.filters).toBe("sv.y_vt.2");
    expect(body.href).toBe(
      `/dashboard/matches/${MATCH_A}?tab=film&f=sv.y_vt.2&pn=3%2C7`,
    );
    expect(body.film).toEqual(READY);
  });

  test("a team conversation: the team function, with its program", async () => {
    const { route, calls } = loadRoute(
      world({
        message: {
          role: "assistant",
          content: SAVED_CONTENT,
          program_id: PROGRAM_ID,
        },
      }),
    );
    const response = await route.POST(post({ answerId: ANSWER_ID }));
    expect(response.status).toBe(200);
    expect(calls.rpc.map((call) => call.fn)).toEqual([
      "ask_run_team_query",
      "ask_run_team_query",
    ]);
    expect(calls.rpc[0].args.p_program_id).toBe(PROGRAM_ID);
    expect(calls.rpc[0].args.p_viewer).toBe(USER_ID);
  });

  test("an expired video answers the expired state, never a broken player", async () => {
    const { route, calls } = loadRoute(
      world({
        video: null,
        entry: {
          attachment: "absent",
          actions: [],
          problem: null,
          quota: null,
          expiredAt: "2026-09-01T00:00:00.000Z",
        },
      }),
    );
    const body = readAskShowResponse(
      await (await route.POST(post({ answerId: ANSWER_ID }))).json(),
    );
    expect(body?.kind === "match" && body.film).toEqual({
      state: "expired",
      expiredAt: "2026-09-01T00:00:00.000Z",
    });
    expect(calls.loaders).toEqual([
      `getMatchVideo:${MATCH_A}`,
      `getMatchFilmEntry:${MATCH_A}`,
    ]);
  });

  test("several matches: the counts after one query, and no point rows read", async () => {
    const { route, calls } = loadRoute(
      world({
        rpc: {
          ask_run_query: () => ({
            data: {
              matches: [MATCH_ROW_A, MATCH_ROW_B],
              rows: [
                { match_id: MATCH_B, points: 9 },
                { match_id: MATCH_A, points: 4 },
              ],
            },
            error: null,
          }),
        },
      }),
    );
    const body = readAskShowResponse(
      await (await route.POST(post({ answerId: ANSWER_ID }))).json(),
    );
    expect(body?.kind).toBe("matches");
    if (!body || body.kind !== "matches") return;
    expect(
      body.matches.map((row) => [row.match.matchId, row.points, row.href]),
    ).toEqual([
      [MATCH_B, 9, `/dashboard/matches/${MATCH_B}?tab=film&f=sv.y_vt.2`],
      [MATCH_A, 4, `/dashboard/matches/${MATCH_A}?tab=film&f=sv.y_vt.2`],
    ]);
    expect(calls.rpc).toHaveLength(1);
    expect(calls.tables.map((read) => read.table)).toEqual(["ask_messages"]);
    expect(calls.loaders).toEqual([]);
  });
});
