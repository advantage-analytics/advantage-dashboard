import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * T14 — the match report for a practice session (canvas board 5), offline.
 *
 * The real rail scoreboard, facts line and Statistics view render through
 * `fixtures/vm-modules`; the providers they read are stubbed with the `Match`
 * the real loader builds. That `Match` comes from `loadMatchDetail` itself,
 * run against a fake Supabase client, so the fixture is the loader's own
 * answer — `isPractice` and `opponentIsTeammate` included — not a hand-made
 * object that could disagree with it.
 *
 * Two fixtures: a practice set between two players of one program (the
 * teammate in seat two, T5's shape), and an ordinary tournament match.
 */

const ROOT = process.cwd();
const DETAIL = "src/components/dashboard/matches/match-detail/";

const PROGRAM = "prog-1";
const SUBJECT = "pp-revelli"; // program_players id, seat one
const TEAMMATE = "pp-stepanov"; // program_players id, seat two

type Row = Record<string, unknown>;

const BASE_ROW: Row = {
  id: "m-1",
  program_id: PROGRAM,
  created_by: SUBJECT,
  player1_id: SUBJECT,
  player2_id: null,
  player1_name: "Mia Revelli",
  player2_name: "Ana Stepanov",
  tournament_name: null,
  round: null,
  date: "2026-11-02T00:00:00+00:00",
  score: { player1: [6, 6], player2: [4, 3] },
  result: null,
  match_type: "Practice",
  opponent_player_id: null,
  court_type: "Hard",
  event_entry_id: null,
  verified: false,
  verified_at: null,
  errors_judged_at: null,
  duration: 3_600_000,
  source_provider: "swingvision",
  player_hand: null,
  player_backhand: null,
  opponent_hand: null,
  opponent_backhand: null,
  key_moments: null,
  insights: null,
  program: null,
  opponent_program: null,
};

const PRACTICE_TEAMMATE: Row = {
  ...BASE_ROW,
  player2_id: TEAMMATE,
  opponent_player_id: TEAMMATE,
};

const TOURNAMENT: Row = {
  ...BASE_ROW,
  id: "m-2",
  match_type: "Tournament",
  tournament_name: "Fall Invitational",
  player2_name: "Jo Rival",
  // A rival named from their own program: their id is NOT on this roster.
  opponent_player_id: "pp-rival-elsewhere",
};

/**
 * A chainable stand-in for the Supabase query builder: every filter returns
 * the builder, and awaiting it (or `.single()` / `.maybeSingle()`) answers
 * from `tables`, narrowed by the `eq`/`in` filters on `id` and `program_id`.
 */
function fakeSupabase(row: Row, roster: { id: string; program_id: string }[]) {
  const tables: Record<string, Row[]> = {
    matches: [row],
    program_players: roster,
    users: [],
    program_event_entries: [],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col: string, value: unknown) => {
        rows = rows.filter((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[col]));
        return builder;
      },
      single: async () =>
        rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116" } },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from,
    rpc: async () => ({ data: [], error: null }),
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }),
    },
  };
}

const serverLoader = createLoader({
  stubs: {
    "@/lib/supabase/server": { createClient: async () => null },
    "@/lib/supabase/admin": { createAdminClient: () => null },
    "@/lib/data/match-stats-server": {
      getMatchStatisticsFromSupabase: async () => null,
      getMatchKpiHistory: async () => null,
    },
    "@/lib/data/match-points-server": {
      getMatchPointsFromSupabase: async () => [],
    },
    "@/lib/data/player-identity-server": {
      getMyPlayerIds: async () => [],
      isMe: () => false,
    },
    "@/lib/data/teams-server": { PROGRAM_CRESTS_BUCKET: "crests" },
  },
});

const { loadMatchDetail, opponentIsTeammate } = serverLoader.load(
  "src/lib/data/match-detail-server.ts",
) as {
  loadMatchDetail: (
    supabase: unknown,
    matchId: string,
    options: Record<string, unknown>,
  ) => Promise<Record<string, unknown> & { match: Record<string, unknown> }>;
  opponentIsTeammate: (
    row: Row,
    isUserPlayer1: boolean,
    rosterIds: readonly string[],
    opponentPlayerOnRoster?: boolean,
  ) => boolean;
};

const ROSTER = [
  { id: SUBJECT, program_id: PROGRAM },
  { id: TEAMMATE, program_id: PROGRAM },
];

async function load(row: Row, myPlayerIds: string[] = []) {
  const data = await loadMatchDetail(
    fakeSupabase(row, ROSTER),
    String(row.id),
    {
      myPlayerIds: async () => myPlayerIds,
      kpiHistory: false,
    },
  );
  if (!data) throw new Error("fixture did not load");
  return data;
}

// ── The components, with everything they do not draw themselves stubbed ────

/** Modules loaded for real; every other `@/` import is a marker. */
const REAL = new Set([
  "@/lib/utils",
  "@/lib/data/match-utils",
  "@/lib/ui/score-format",
  "@/components/ui/state-pill",
  "@/components/dashboard/matches/new-match-wizard/styles",
  "@/components/dashboard/matches/match-detail/rail-scoreboard",
  "@/components/dashboard/matches/match-detail/format-clock",
  "@/components/dashboard/matches/match-detail/set-scope",
]);

function existsTsx(id: string) {
  return existsSync(resolve(ROOT, "src", `${id.slice(2)}.tsx`));
}

function render(
  file: string,
  exportName: string,
  match: Record<string, unknown>,
) {
  const real = createLoader({
    stubs: {
      "@/components/dashboard/score-line": { TIEBREAK_STYLE: {} },
    },
  });
  const sides = match.isUserPlayer1
    ? {
        you: { isPlayer1: true, name: match.player1Name },
        opp: { isPlayer1: false, name: match.player2Name },
      }
    : {
        you: { isPlayer1: false, name: match.player2Name },
        opp: { isPlayer1: true, name: match.player1Name },
      };
  const reportMatch = {
    ...match,
    player1: { name: match.player1Name },
    player2: { name: match.player2Name },
  };
  const stubs: Record<string, unknown> = {
    "@/components/dashboard/matches/match-data-provider": {
      useMatchData: () => ({
        match: reportMatch,
        points: [{ id: "pt" }, { id: "pt2" }],
        statsResult: null,
      }),
    },
    "@/components/dashboard/matches/match-detail/use-match-sides": {
      useMatchSides: () => ({
        ...sides,
        sets: [
          {
            player1: 6,
            player2: 4,
            player1Tiebreak: null,
            player2Tiebreak: null,
          },
          {
            player1: 6,
            player2: 3,
            player1Tiebreak: null,
            player2Tiebreak: null,
          },
        ],
      }),
    },
    "@/components/dashboard/matches/match-detail/match-report-context": {
      useMatchReport: () => ({
        state: { view: "statistics" },
        meta: {
          statsPublished: true,
          isDerived: false,
          savedViews: [],
          readOnly: false,
        },
      }),
    },
    "@/components/dashboard/matches/match-detail/film-head-context": {
      useFilmHead: () => null,
    },
    "@/components/dashboard/matches/match-detail/match-report": {
      MatchReport: { Insight: marker("Insight") },
    },
    "@/components/dashboard/matches/match-detail/statistics-lob-keys": {
      StatisticsLobKeysProvider: ({
        children,
      }: {
        children: React.ReactNode;
      }) => children,
    },
    "next/image": marker("Image"),
  };
  const loader = createLoader({
    markUnknown: true,
    stubs: new Proxy(stubs, {
      has: (target, id) =>
        id in target ||
        String(id).startsWith("@/") ||
        String(id).startsWith("."),
      get: (target, id) => {
        if (id in target) return target[id as string];
        const name = String(id);
        if (REAL.has(name))
          return real.load(
            `src/${name.slice(2)}${existsTsx(name) ? ".tsx" : ".ts"}`,
          );
        return new Proxy({}, { get: (_, n) => marker(String(n)) });
      },
    }),
  });
  const exports = loader.load(file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName]));
}

/** The loader's `Match`, flattened to what the stubbed providers hand over. */
function reportMatch(data: { match: Record<string, unknown> }) {
  const m = data.match;
  return {
    ...m,
    player1Name: (m.player1 as { name: string }).name,
    player2Name: (m.player2 as { name: string }).name,
  };
}

const TEAMMATE_PILL =
  /Ana Stepanov<\/span><span class="[^"]*text-\[var\(--ink-500\)\][^"]*"[^>]*>Teammate<\/span>/;

// ── The loader ─────────────────────────────────────────────────────────────

test.describe("getMatchDetailData's practice and teammate facts", () => {
  test("a teammate practice: match.isPractice and match.opponentIsTeammate", async () => {
    const data = await load(PRACTICE_TEAMMATE);
    expect(data.match.isPractice).toBe(true);
    expect(data.match.opponentIsTeammate).toBe(true);
    // Coach's view: oriented to the subject in seat one, by `youSeat`.
    expect(data.match.isUserPlayer1).toBe(true);
  });

  test("the teammate opening it: turned to seat two, the opponent (seat one) still a teammate", async () => {
    const data = await load(PRACTICE_TEAMMATE, [TEAMMATE]);
    expect(data.match.isUserPlayer1).toBe(false);
    expect(data.match.opponentIsTeammate).toBe(true);
  });

  test("a tournament against a rival from another program: neither fact", async () => {
    const data = await load(TOURNAMENT);
    expect(data.match.isPractice).toBe(false);
    expect(data.match.opponentIsTeammate).toBe(false);
  });

  test("a teammate seated with no opponent_player_id is still found by seat", async () => {
    const data = await load({ ...PRACTICE_TEAMMATE, opponent_player_id: null });
    expect(data.match.opponentIsTeammate).toBe(true);
  });

  test("opponentIsTeammate: roster by either seat or opponent_player_id; never on a personal match", () => {
    const row = {
      program_id: PROGRAM,
      player1_id: SUBJECT,
      player2_id: null,
      opponent_player_id: null,
    };
    expect(opponentIsTeammate(row, true, [SUBJECT])).toBe(false);
    expect(
      opponentIsTeammate({ ...row, player2_id: TEAMMATE }, true, [
        SUBJECT,
        TEAMMATE,
      ]),
    ).toBe(true);
    // A teammate named only by opponent_player_id, answered by the extra read.
    expect(
      opponentIsTeammate({ ...row, opponent_player_id: "x" }, true, [], true),
    ).toBe(true);
    // A rival's program_players id is not on this roster.
    expect(
      opponentIsTeammate(
        { ...row, opponent_player_id: "x" },
        true,
        [SUBJECT],
        false,
      ),
    ).toBe(false);
    expect(
      opponentIsTeammate(
        { ...row, program_id: null, player2_id: TEAMMATE },
        true,
        [TEAMMATE],
      ),
    ).toBe(false);
  });

  test("page.tsx keeps its still-analysing short-circuit", () => {
    const page = readFileSync(
      resolve(ROOT, "src/app/dashboard/matches/(detail)/[matchId]/page.tsx"),
      "utf8",
    );
    const gate = page.indexOf("if (isAwaitingAnalysis) {");
    expect(gate).toBeGreaterThan(-1);
    expect(page.indexOf("<AnalysisSteps", gate)).toBeGreaterThan(gate);
    expect(page.indexOf("<MatchReportProvider")).toBeGreaterThan(
      page.indexOf("<AnalysisSteps", gate),
    );
  });
});

// ── The report ─────────────────────────────────────────────────────────────

test.describe("practice set against a teammate", () => {
  let match: Record<string, unknown>;
  test.beforeAll(async () => {
    match = reportMatch(await load(PRACTICE_TEAMMATE));
  });

  test("rail: eyebrow 'Practice', status line 'Practice set · {n} points tagged'", () => {
    const html = render(
      DETAIL + "report-scoreboard.tsx",
      "MatchReportScoreboard",
      match,
    );
    expect(html).toMatch(/<span class="text-micro">Practice<\/span>/);
    expect(html).toContain("Practice set · 2 points tagged");
    expect(html).not.toContain(">Final<");
    expect(html).not.toContain("Match complete");
  });

  test("rail: a grey Teammate pill right after the opponent's name", () => {
    const html = render(
      DETAIL + "report-scoreboard.tsx",
      "MatchReportScoreboard",
      match,
    );
    expect(html).toMatch(TEAMMATE_PILL);
    expect(html.match(/>Teammate</g)).toHaveLength(1);
  });

  test("meta line: the event item reads 'Practice'", () => {
    const html = render(DETAIL + "report-facts.tsx", "MatchReportFacts", match);
    expect(html).toMatch(/>Practice<\/span>/);
  });

  test("notice: directly above the insight card, both players named", () => {
    const html = render(
      DETAIL + "statistics-view.tsx",
      "StatisticsView",
      match,
    );
    expect(html).toContain('data-testid="practice-notice"');
    expect(html).toContain(">Practice.</strong>");
    expect(html).toContain(
      "Not in Revelli&#x27;s or Stepanov&#x27;s record or season statistics. Both players see this report; their profiles list it under Practice.",
    );
    // The strip, then the insight card, with nothing between them.
    expect(html).toMatch(
      /data-testid="practice-notice"[\s\S]*?<\/div><span data-component="Insight"><\/span>/,
    );
    expect(html.indexOf("practice-notice")).toBeLessThan(
      html.indexOf('data-component="Insight"'),
    );
  });
});

test.describe("practice set against a non-teammate", () => {
  test("notice names the player alone and drops the second sentence; no pill", async () => {
    const match = reportMatch(
      await load({
        ...BASE_ROW,
        player2_name: "Jo Rival",
        opponent_player_id: "pp-rival-elsewhere",
      }),
    );
    const view = render(
      DETAIL + "statistics-view.tsx",
      "StatisticsView",
      match,
    );
    expect(view).toContain(
      "Not in Revelli&#x27;s record or season statistics.</span>",
    );
    expect(view).not.toContain("Both players see this report");
    const rail = render(
      DETAIL + "report-scoreboard.tsx",
      "MatchReportScoreboard",
      match,
    );
    expect(rail).toContain("Practice set · 2 points tagged");
    expect(rail).not.toContain("Teammate");
  });
});

test.describe("tournament match", () => {
  let match: Record<string, unknown>;
  test.beforeAll(async () => {
    match = reportMatch(await load(TOURNAMENT));
  });

  test("rail: 'Final' and 'Match complete · {n} points tagged', no pill", () => {
    const html = render(
      DETAIL + "report-scoreboard.tsx",
      "MatchReportScoreboard",
      match,
    );
    expect(html).toMatch(/<span class="text-micro">Final<\/span>/);
    expect(html).toContain("Match complete · 2 points tagged");
    expect(html).not.toContain("Practice");
    expect(html).not.toContain("Teammate");
  });

  test("meta line: the event name, not 'Practice'", () => {
    const html = render(DETAIL + "report-facts.tsx", "MatchReportFacts", match);
    expect(html).toContain("Fall Invitational");
    expect(html).not.toContain("Practice");
  });

  test("no practice notice above the insight card", () => {
    const html = render(
      DETAIL + "statistics-view.tsx",
      "StatisticsView",
      match,
    );
    expect(html).not.toContain("practice-notice");
    expect(html).not.toContain("Practice.");
    expect(html).toContain('data-component="Insight"');
  });
});
