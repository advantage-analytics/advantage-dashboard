import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  editedByLabel,
  normalizeReading,
  readingOf,
  resultTypeOf,
  reviewFlagsOf,
  selfReviewStateFrom,
  type SelfReviewState,
} from "../src/lib/data/self-review";
import { statsMoved } from "../src/components/dashboard/matches/match-detail/self-review/self-review-stats";
import type { MatchPoint } from "../src/lib/data/match-points-server";

/**
 * Self review (docs/plans/advantage-review.md, step 2), the pure half: the
 * reading of `points.result_type` into the label vocabulary and back, the
 * rules the database enforces on a fix, the "Edited by" line and the stats a
 * save names. Offline: no database, no browser.
 *
 * The SQL composes the stored value itself (`self_review_result_type`); the
 * round trip here pins the TypeScript mirror the form previews with to every
 * spelling `calculate_match_stats` counts, so the preview can't promise a
 * result type the database would not write.
 */

const SPELLINGS = [
  "Ace",
  "Double Fault",
  "Service Winner",
  "Winner",
  "Forehand Winner",
  "Backhand Winner",
  "Volley Winner",
  "Overhead Winner",
  "Unforced Error",
  "Forehand Unforced Error",
  "Backhand Unforced Error",
  "Forehand Forced Error",
  "Backhand Forced Error",
];

test("every live result_type spelling survives the round trip", () => {
  for (const rt of SPELLINGS) {
    expect(resultTypeOf(readingOf(rt, true)), rt).toBe(rt);
  }
});

test("forced and unforced errors stay apart", () => {
  expect(readingOf("Backhand Forced Error", false)).toEqual({
    winner: "p2",
    ending: "error",
    errorKind: "forced",
    lastStroke: "backhand",
  });
  expect(readingOf("Forehand Unforced Error", true).errorKind).toBe("unforced");
});

test("a point with no ending reads as none", () => {
  expect(readingOf(null, true)).toEqual({
    winner: "p1",
    ending: null,
    errorKind: null,
    lastStroke: null,
  });
  expect(resultTypeOf(readingOf(null, true))).toBeNull();
});

test("an ace is the server's point and a double fault the receiver's", () => {
  const base = readingOf("Forehand Winner", false);
  expect(normalizeReading({ ...base, ending: "ace" }, "p1")).toEqual({
    winner: "p1",
    ending: "ace",
    errorKind: null,
    lastStroke: null,
  });
  expect(
    normalizeReading({ ...base, winner: "p1", ending: "double_fault" }, "p1")
      .winner,
  ).toBe("p2");
});

test("only the player flags lead, in their own order", () => {
  expect(
    reviewFlagsOf([
      "phantom_strokes_dropped",
      "ending_suspect_line",
      "winner_guessed",
    ]),
  ).toEqual(["winner_guessed", "ending_suspect_line"]);
  expect(reviewFlagsOf(null)).toEqual([]);
});

const VIEWER = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222";

function stateWith(editors: string[]): SelfReviewState {
  return selfReviewStateFrom({
    can_fix: true,
    edits: editors.map((id, i) => ({
      point_id: `0000000${i}-0000-4000-8000-000000000000`,
      winner: "p1",
      ending: "winner",
      seed: { winner: "p2", ending: "error", error_kind: "unforced" },
      edited_by: id,
    })),
    editors: [
      { user_id: COACH, first_name: "Ana", last_name: "Rivera", role: "coach" },
    ],
  });
}

test("Edited by names the viewer as you, a coach by surname", () => {
  expect(editedByLabel(stateWith([VIEWER, VIEWER, VIEWER]), VIEWER)).toBe(
    "Edited by you · 3 points",
  );
  expect(editedByLabel(stateWith([COACH]), VIEWER)).toBe(
    "Edited by Coach Rivera · 1 point",
  );
  expect(editedByLabel(stateWith([COACH, VIEWER]), VIEWER)).toBe(
    "Edited by you and Coach Rivera · 2 points",
  );
  expect(editedByLabel(stateWith([]), VIEWER)).toBeNull();
});

test("the copy says edited, never verified", () => {
  const label = editedByLabel(stateWith([VIEWER]), VIEWER) ?? "";
  expect(label).not.toMatch(/verif/i);
});

function point(over: Partial<MatchPoint>): MatchPoint {
  return {
    id: "p",
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Forehand Winner",
    eventType: "",
    description: "",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: null,
    videoTime: 0,
    saved: false,
    savedBy: [],
    ...over,
  };
}

test("a save names the viewer's stats it moves", () => {
  const points = [
    point({ id: "a", pointNumber: 1 }),
    point({
      id: "b",
      pointNumber: 2,
      resultType: "Backhand Unforced Error",
      wonByPlayer1: false,
    }),
  ];
  const stored = (p: MatchPoint) => readingOf(p.resultType, p.wonByPlayer1);
  // The second point was really the viewer's forehand winner.
  const drafts = new Map([
    [
      "b",
      {
        winner: "p1" as const,
        ending: "winner" as const,
        errorKind: null,
        lastStroke: "forehand" as const,
      },
    ],
  ]);
  const { moved, scoreMayNotAddUp } = statsMoved(points, drafts, true, stored);
  expect(moved).toEqual([
    "Points won 1 → 2",
    "Winners 1 → 2",
    "Unforced errors 1 → 0",
  ]);
  // Point b is the game's last point and changed hands.
  expect(scoreMayNotAddUp).toBe(true);
});

test("the opponent's side never counts as the viewer's", () => {
  const points = [point({ id: "a", wonByPlayer1: true })];
  const stored = (p: MatchPoint) => readingOf(p.resultType, p.wonByPlayer1);
  const { moved } = statsMoved(
    points,
    new Map([
      [
        "a",
        {
          winner: "p2" as const,
          ending: "winner" as const,
          errorKind: null,
          lastStroke: "backhand" as const,
        },
      ],
    ]),
    // The viewer is player 2: the flip is a point WON.
    false,
    stored,
  );
  expect(moved).toEqual(["Points won 0 → 1", "Winners 0 → 1"]);
});

const MIGRATION = readFileSync(
  join(__dirname, "../supabase/migrations/20261027120000_self_review.sql"),
  "utf8",
);

test("the save never touches verified", () => {
  const save = MIGRATION.slice(
    MIGRATION.indexOf("function public.self_review_save"),
    MIGRATION.indexOf("-- ── The lock"),
  );
  expect(save).not.toMatch(/verified\s*=/);
  expect(save).not.toMatch(/verify_match/);
});

test("the self-review functions are not executable signed out", () => {
  for (const fn of [
    "can_fix_match_points(uuid)",
    "self_review_state(uuid)",
    "self_review_save(uuid, jsonb)",
  ]) {
    const escaped = fn.replace(/[()]/g, "\\$&");
    expect(MIGRATION).toMatch(
      new RegExp(
        `revoke execute on function public\\.${escaped}\\s+from public, anon;`,
      ),
    );
  }
});
