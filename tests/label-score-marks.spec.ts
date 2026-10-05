import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LabelMarks } from "@/lib/services/labels/marks";
import { markSummary } from "@/lib/services/labels/marks-state";
import {
  liveScoreMarks,
  withLiveScoreMarks,
  type ScoreMarkPoint,
} from "@/lib/services/labels/score-marks";
import type {
  LabelEnding,
  LabelServeSide,
  LabelSession,
  LabelSide,
} from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The two marks that follow the LABELLED score (`score-marks.ts`): "Wrong
 * side for the score" and "Same side twice", read off the console's rows and
 * the vendor's serve sides on every render — present while the labelled
 * score disagrees with the serve, gone when it agrees.
 */

let n = 0;
function point(
  id: string,
  fields: Partial<ScoreMarkPoint> = {},
): ScoreMarkPoint {
  return {
    id,
    pointIndex: n++,
    status: "unchanged",
    setNumber: 1,
    gameNumber: 1,
    server: "p1",
    winner: "p1",
    ending: "winner",
    gameType: "game",
    ...fields,
  };
}

/** A game of `winners`, each point served from `sides[i]`. */
function game(
  winners: readonly (LabelSide | null)[],
  sides: readonly (LabelServeSide | null)[],
  fields: Partial<ScoreMarkPoint> = {},
): { points: ScoreMarkPoint[]; serveSides: Record<string, LabelServeSide> } {
  n = 0;
  const points = winners.map((winner, i) =>
    point(`p${i + 1}`, { winner, ...fields }),
  );
  const serveSides: Record<string, LabelServeSide> = {};
  sides.forEach((side, i) => {
    if (side) serveSides[`p${i + 1}`] = side;
  });
  return { points, serveSides };
}

const codes = (marks: ReturnType<typeof liveScoreMarks>, id: string) =>
  (marks.points[id] ?? []).map((m) => m.code);

test.describe("Wrong side for the score", () => {
  test("even points played want the deuce side, odd the ad side; a side that agrees raises nothing", () => {
    const { points, serveSides } = game(
      ["p1", "p2", "p1", "p1"],
      ["deuce", "ad", "deuce", "ad"],
    );
    const marks = liveScoreMarks(points, true, serveSides);
    expect(marks.points).toEqual({});
    expect(marks.suggestions).toEqual([]);
  });

  test("a serve from the wrong side for the labelled score is flagged, with that score", () => {
    const { points, serveSides } = game(
      ["p1", "p2", "p1"],
      ["deuce", "deuce", "ad"],
    );
    const marks = liveScoreMarks(points, true, serveSides);
    // Point 2 at 15–0 should be from the ad side; it came from the deuce.
    expect(codes(marks, "p2")).toEqual([
      "score_side_mismatch",
      "service_court_repeat",
    ]);
    expect(marks.points.p2[0]).toEqual({
      code: "score_side_mismatch",
      kind: "flag",
      scope: "point",
      params: { score: "15–0", expected: "ad", actual: "deuce" },
    });
    // Point 3 at 15–15 (two played) wants the deuce side: wrong again.
    expect(codes(marks, "p3")).toEqual(["score_side_mismatch"]);
    expect(marks.points.p3[0].params).toEqual({
      score: "15–15",
      expected: "deuce",
      actual: "ad",
    });
    expect(codes(marks, "p1")).toEqual([]);
  });

  test("the score is the labelled one: change a winner and the flag follows", () => {
    // Point 2 served from the deuce side after point 1: wrong while point 1
    // counts…
    const wrong = game(["p1", "p1"], ["deuce", "deuce"]);
    expect(
      codes(liveScoreMarks(wrong.points, true, wrong.serveSides), "p2"),
    ).toEqual(["score_side_mismatch", "service_court_repeat"]);
    // …right once point 1 is a let: the score stands, and so does the side.
    const replayed = game(["p1", "p1"], ["deuce", "deuce"]);
    replayed.points[0].ending = "let_replayed";
    expect(
      liveScoreMarks(replayed.points, true, replayed.serveSides).points,
    ).toEqual({});
  });

  test("40–40 under no-ad: the receiver picks the side, so no expectation and no repeat", () => {
    const { points, serveSides } = game(
      ["p1", "p2", "p1", "p2", "p1", "p2", "p1"],
      ["deuce", "ad", "deuce", "ad", "deuce", "ad", "ad"],
    );
    // Ad scoring: the deciding point at 40–40 (six played) wants the deuce side.
    expect(codes(liveScoreMarks(points, true, serveSides), "p7")).toEqual([
      "score_side_mismatch",
      "service_court_repeat",
    ]);
    // No-ad: the receiver chose; nothing is said about it.
    expect(liveScoreMarks(points, false, serveSides).points).toEqual({});
  });

  test("a tiebreak alternates by the same parity over the raw count", () => {
    const { points, serveSides } = game(
      ["p1", "p1", "p2", "p2"],
      ["deuce", "ad", "deuce", "deuce"],
      { gameType: "tiebreak" },
    );
    const marks = liveScoreMarks(points, true, serveSides);
    expect(codes(marks, "p4")).toEqual([
      "score_side_mismatch",
      "service_court_repeat",
    ]);
    expect(marks.points.p4[0].params).toEqual({
      score: "2–1",
      expected: "ad",
      actual: "deuce",
    });
    expect(codes(marks, "p3")).toEqual([]);
  });

  test("past a game's end nothing is expected: the overflow slot owns those rows", () => {
    const { points, serveSides } = game(
      ["p1", "p1", "p1", "p1", "p2", "p2"],
      ["deuce", "ad", "deuce", "ad", "ad", "ad"],
    );
    expect(liveScoreMarks(points, true, serveSides).points).toEqual({});
  });
});

test.describe("Same side twice", () => {
  test("two consecutive points of a game from one side: the second is flagged and a point is suggested between them", () => {
    n = 0;
    const points = [
      point("a", { pointIndex: 4 }),
      point("b", { pointIndex: 5, winner: "p2" }),
    ];
    const marks = liveScoreMarks(points, true, { a: "ad", b: "ad" });
    // The first, at 0–0, is on the wrong side for the score; the second is
    // on the right side for the score (one played) and repeats the first.
    expect(codes(marks, "a")).toEqual(["score_side_mismatch"]);
    expect(codes(marks, "b")).toEqual(["service_court_repeat"]);
    expect(marks.points.b[0]).toEqual({
      code: "service_court_repeat",
      kind: "flag",
      scope: "point",
      params: { side: "ad" },
    });
    // The rail's numbers (`pointIndex + 1`), and the slot's two ids.
    expect(marks.suggestions).toEqual([
      {
        kind: "missing_point",
        key: "missing_point",
        pointId: "b",
        beforePointId: "a",
        side: "ad",
        pointNumbers: [5, 6],
      },
    ]);
  });

  test("an added point has no side: it raises nothing and breaks the repeat — how Add point answers it", () => {
    n = 0;
    const points = [
      point("a"),
      point("new", { status: "added", winner: null, ending: null }),
      point("b", { winner: "p2" }),
    ];
    const marks = liveScoreMarks(points, true, { a: "deuce", b: "deuce" });
    expect(codes(marks, "new")).toEqual([]);
    // No repeat and no slot; the score has not moved yet (the new point has
    // no winner), so the second serve is still on the wrong side for it.
    expect(codes(marks, "b")).toEqual(["score_side_mismatch"]);
    expect(marks.suggestions).toEqual([]);
    // Give the new point its winner and the score agrees too.
    points[1].winner = "p2";
    points[1].ending = "winner";
    expect(
      liveScoreMarks(points, true, { a: "deuce", b: "deuce" }).points,
    ).toEqual({});
  });

  test("a let explains a repeat; a not-a-point row is neither a point nor a break", () => {
    n = 0;
    const let_ = [
      point("a", { ending: "let_replayed" as LabelEnding }),
      point("b"),
    ];
    expect(
      liveScoreMarks(let_, true, { a: "deuce", b: "deuce" }).points,
    ).toEqual({});

    n = 0;
    const warmup = [
      point("a"),
      point("x", { ending: "not_a_point", winner: null }),
      point("b", { winner: "p2" }),
    ];
    const sides = { a: "ad", x: "ad", b: "ad" } as const;
    expect(codes(liveScoreMarks(warmup, true, sides), "b")).toEqual([
      "service_court_repeat",
    ]);
    expect(codes(liveScoreMarks(warmup, true, sides), "x")).toEqual([]);
  });

  test("a tombstone is skipped; a point moved into another game is read with that game", () => {
    n = 0;
    const points = [
      point("a"),
      point("gone", { status: "deleted" }),
      point("b", { winner: "p2" }),
      point("c", { gameNumber: 2, winner: "p2" }),
    ];
    const marks = liveScoreMarks(points, true, {
      a: "deuce",
      gone: "deuce",
      b: "deuce",
      c: "deuce",
    });
    expect(codes(marks, "gone")).toEqual([]);
    expect(codes(marks, "b")).toEqual([
      "score_side_mismatch",
      "service_court_repeat",
    ]);
    // Game 2's first point: the deuce side, as a game opens.
    expect(codes(marks, "c")).toEqual([]);
  });
});

test.describe("withLiveScoreMarks", () => {
  test("appends to the file's marks and suggestions, and leaves the rest alone", () => {
    n = 0;
    const points = [point("a"), point("b", { winner: "p2" })];
    const file: LabelMarks = {
      points: {
        b: [{ code: "pick_winner", kind: "flag", scope: "point", params: {} }],
      },
      shots: {
        s1: [
          {
            code: "geometry_discarded",
            kind: "fix",
            scope: "shot",
            params: {},
          },
        ],
      },
      suggestions: [
        {
          kind: "missing_shot",
          key: "missing_shot:7",
          pointId: "a",
          afterShotId: "s1",
          hitter: "p2",
          videoTime: 10,
        },
      ],
      serveSides: { a: "ad", b: "ad" },
    };
    const merged = withLiveScoreMarks(file, points, true);
    expect(merged.points.a.map((m) => m.code)).toEqual(["score_side_mismatch"]);
    expect(merged.points.b.map((m) => m.code)).toEqual([
      "pick_winner",
      "service_court_repeat",
    ]);
    expect(merged.shots).toBe(file.shots);
    expect(merged.serveSides).toBe(file.serveSides);
    expect(merged.suggestions.map((s) => s.kind)).toEqual([
      "missing_shot",
      "missing_point",
    ]);
    // The file is not written to.
    expect(file.points.b).toHaveLength(1);
    expect(file.suggestions).toHaveLength(1);
  });
});

// ── In the console ─────────────────────────────────────────────────────────

type ConsoleProps = {
  session: LabelSession;
  video: null;
  marks?: LabelMarks | null;
  initialLayoutMode?: "black";
  initialExpandedPointId?: string | null;
  operations?: Record<string, unknown>;
  onSaveShot?: () => Promise<unknown>;
  onSavePoint?: () => Promise<unknown>;
};

function renderBlack(session: LabelSession, marks: LabelMarks): string {
  const { LabelConsole } = createLoader().load(
    "src/components/admin/labels/label-console.tsx",
  ) as { LabelConsole: React.ComponentType<ConsoleProps> };
  return renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks,
      initialLayoutMode: "black",
      initialExpandedPointId: null,
      operations: {},
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    }),
  );
}

/** The point row's markup, from its tag to the next row of any kind. */
function row(html: string, id: string): string {
  const start = html.indexOf(`data-point-id="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("data-row=", start + 20);
  return html.slice(start, next === -1 ? undefined : next);
}

const EMPTY: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

test.describe("the console reads them live", () => {
  const { P1, P2 } = FIXTURE_POINT_IDS;

  test("the fixture's two counted points from one side: the second flagged, the slot drawn, the header counting it", () => {
    const html = renderBlack(labelSessionFixture(), {
      ...EMPTY,
      serveSides: { [P1]: "deuce", [P2]: "deuce" },
    });
    // Point 2 is checked, so its flags read checked-as-is — present, quiet.
    const p2 = row(html, P2);
    expect(p2).toContain('data-mark-kind="flag"');
    expect(p2).toContain('data-mark-state="checked-as-is"');
    expect(p2).toMatch(/aria-label="[^"]*Same side twice · checked as is/);
    expect(p2).toMatch(
      /aria-label="[^"]*Wrong side for the score · checked as is/,
    );
    expect(row(html, P1)).not.toContain("data-mark-kind");
    // The slot between the two.
    expect(html).toContain('data-row="suggested-point"');
    // The header: nothing OPEN to check (the point is checked), and no fix.
    expect(html).toContain('aria-label="Nothing left to check"');
    const marks: LabelMarks = {
      ...EMPTY,
      serveSides: { [P1]: "deuce", [P2]: "deuce" },
    };
    const points = labelSessionFixture().points;
    expect(
      markSummary(points, withLiveScoreMarks(marks, points, true)),
    ).toEqual({ open: 0, openPoints: 0, fixes: 0, fixPoints: 0 });
  });

  test("unchecked, the same two flags are open and counted; with the sides agreeing, nothing is drawn", () => {
    const session = labelSessionFixture();
    const unchecked = {
      ...session,
      points: session.points.map((p) =>
        p.id === P2 ? { ...p, checkedAt: null } : p,
      ),
    };
    const marks: LabelMarks = {
      ...EMPTY,
      serveSides: { [P1]: "deuce", [P2]: "deuce" },
    };
    const html = renderBlack(unchecked, marks);
    const p2 = row(html, P2);
    expect(p2).toContain('data-mark-state="open"');
    // The open hover reads the LABELLED score — "0–15", server first — not
    // anything the vendor read.
    expect(p2).toMatch(
      /aria-label="[^"]*At 0–15 the serve should come from the ad side\. This one came from the deuce side\./,
    );
    expect(html).toContain('aria-label="2 flags to check"');
    expect(
      markSummary(
        unchecked.points,
        withLiveScoreMarks(marks, unchecked.points, true),
      ),
    ).toEqual({
      open: 2,
      openPoints: 1,
      fixes: 0,
      fixPoints: 0,
    });

    // The ad side for the second point: the labelled score agrees, and the
    // flags are simply not there — not grey, gone.
    const agreed = renderBlack(unchecked, {
      ...EMPTY,
      serveSides: { [P1]: "deuce", [P2]: "ad" },
    });
    expect(agreed).not.toContain("data-mark-kind");
    expect(agreed).not.toContain('data-row="suggested-point"');
    expect(agreed).toContain('aria-label="Nothing left to check"');
  });
});
