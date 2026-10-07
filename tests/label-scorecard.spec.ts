import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelMarks,
  type LabelMarkTier,
} from "@/lib/services/labels/marks";
import {
  AFTER_POINT_ENDED,
  buildScorecard,
  deleteReasonGroup,
  openingMarks,
  pointChange,
  seededScorePoints,
  shotChangedFromSeed,
} from "@/lib/services/labels/scorecard";
import type {
  LabelPoint,
  LabelShot,
  LabelShotSeedValues,
} from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";

// The frame: x metres from the centre line, y from the near baseline; the
// net at 11.885, the far baseline at 23.77.
const IN = { landing_x: 1, landing_y: 20 };
const LONG = { landing_x: 1, landing_y: 25 };
const NETTED = { landing_x: 1, landing_y: 9 };

function seedOf(over: Partial<LabelShotSeedValues> = {}): LabelShotSeedValues {
  return {
    hitter: "p1",
    stroke: "forehand",
    result: "in",
    spin: null,
    contact_x: 1,
    contact_y: 1,
    ...IN,
    video_time: 10,
    ...over,
  };
}

let eventId = 100;
/** A vendor stroke at its seed; `now` is what the labeller made of it. */
function shot(
  id: string,
  seed: Partial<LabelShotSeedValues> = {},
  now: Partial<LabelShot> = {},
): LabelShot {
  const values = seedOf(seed);
  return labelShot(id, "p", {
    eventId: (eventId += 1),
    hitter: values.hitter,
    stroke: values.stroke,
    result: values.result,
    spin: values.spin,
    contactX: values.contact_x,
    contactY: values.contact_y,
    landingX: values.landing_x,
    landingY: values.landing_y,
    videoTime: values.video_time,
    seed: values,
    ...now,
  });
}

/** A vendor point at its seed; `now` is what the labeller made of it. */
function point(
  id: string,
  index: number,
  shots: LabelShot[] = [],
  now: Partial<LabelPoint> = {},
): LabelPoint {
  return labelPoint(id, index, {
    vendorRallyIds: [index + 1],
    serveSide: null,
    winner: "p1",
    ending: "winner",
    endedBy: "p1",
    seed: {
      set_number: 1,
      game_number: 1,
      server: "p1",
      serve_side: null,
      winner: "p1",
      ending: "winner",
      ended_by: "p1",
    },
    shots,
    ...now,
  });
}

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
  tier: LabelMarkTier = LABEL_MARK_META[code].tier,
): LabelMark {
  return {
    code,
    tier,
    scope: LABEL_MARK_META[code].scope,
    params,
  } as LabelMark;
}

const DISPUTED = mark("winner_disputed", {
  scoreWinner: "p1",
  lastStrokeWinner: "p2",
});
const marksOf = (
  points: Record<string, LabelMark[]>,
  shots: Record<string, LabelMark[]> = {},
): LabelMarks => ({ points, shots, suggestions: [], serveSides: {} });

test.describe("what the labeller changed on a point", () => {
  test("nothing: a point and its strokes at their seed", () => {
    expect(pointChange(point("a", 0, [shot("s1")]))).toEqual({
      winner: false,
      ending: false,
      anything: false,
    });
  });

  test("the winner, the ending and ended-by are read seed against now", () => {
    expect(pointChange(point("a", 0, [], { winner: "p2" }))).toEqual({
      winner: true,
      ending: false,
      anything: true,
    });
    expect(pointChange(point("a", 0, [], { ending: "error" }))).toEqual({
      winner: false,
      ending: true,
      anything: true,
    });
    expect(pointChange(point("a", 0, [], { endedBy: "p2" })).ending).toBe(true);
    // A let is an ending change; the stale status of the row says nothing.
    expect(
      pointChange(point("a", 0, [], { ending: "let_replayed" })).ending,
    ).toBe(true);
    expect(pointChange(point("a", 0, [], { status: "edited" })).anything).toBe(
      false,
    );
    // Another seeded field: anything, but neither winner nor ending.
    expect(pointChange(point("a", 0, [], { server: "p2" }))).toEqual({
      winner: false,
      ending: false,
      anything: true,
    });
  });

  test("a stroke edited, added, deleted or restored changes the point", () => {
    const edited = shot("s1", {}, { result: "out" });
    const added = shot(
      "s2",
      {},
      { status: "added", seed: null, eventId: null },
    );
    const deleted = shot("s3", {}, { status: "deleted" });
    const restored = shot(
      "s4",
      {},
      { siteRemoval: "hit_after_fault", siteRemovalRestoredAt: "2026-10-05" },
    );
    const ghost = shot("s5", {}, { siteRemoval: "hit_after_fault" });
    for (const changed of [edited, added, deleted, restored]) {
      expect(shotChangedFromSeed(changed)).toBe(true);
      expect(pointChange(point("a", 0, [shot("s0"), changed]))).toEqual({
        winner: false,
        ending: false,
        anything: true,
      });
    }
    // A ghost left as the site removed it is no change of the labeller's,
    // and a position within the save's tolerance is the same label.
    expect(shotChangedFromSeed(ghost)).toBe(false);
    expect(shotChangedFromSeed(shot("s6", {}, { contactX: 1.004 }))).toBe(
      false,
    );
  });

  test("a deleted point is a change, with no winner or ending left to compare", () => {
    expect(
      pointChange(point("a", 0, [], { status: "deleted", winner: "p2" })),
    ).toEqual({ winner: false, ending: false, anything: true });
  });

  test("a point with no seed falls back to its status", () => {
    const added = point("a", 0, [], { status: "added", seed: null });
    expect(pointChange(added)).toEqual({
      winner: false,
      ending: false,
      anything: true,
    });
    expect(
      pointChange(point("a", 0, [], { seed: null, winner: "p2" })).anything,
    ).toBe(false);
  });
});

test.describe("the per-code table", () => {
  test("each mark is counted once, against its own point's changes", () => {
    const a = point("a", 0, [shot("a1")], { winner: "p2" });
    const b = point("b", 1, [shot("b1")], { ending: "error" });
    const c = point("c", 2, [shot("c1", {}, { status: "deleted" })]);
    const d = point("d", 3, [shot("d1")]);
    const card = buildScorecard(
      [a, b, c, d],
      marksOf({
        a: [DISPUTED, mark("serve_fault", {})],
        b: [DISPUTED],
        c: [DISPUTED],
        d: [DISPUTED, mark("winner_guessed", {})],
      }),
    );
    expect(
      card.rows.map((r) => [
        r.code,
        r.label,
        r.tier,
        r.marks,
        r.winnerChanged,
        r.endingChanged,
        r.anythingChanged,
      ]),
    ).toEqual([
      ["winner_disputed", "Check the ending", "count", 4, 1, 1, 3],
      ["serve_fault", "Serve fault?", "hint", 1, 1, 0, 1],
      ["winner_guessed", "Winner guessed", "hidden", 1, 0, 0, 0],
    ]);
    expect(card.points).toEqual({ live: 4, added: 0, deleted: 0, changed: 3 });
  });

  test("a stroke's mark is measured against the point the stroke is in; a tier is a row", () => {
    const a = point("a", 0, [shot("a1"), shot("a2")], { winner: "p2" });
    const netHit = (tier: LabelMarkTier) =>
      mark("net_hit_contradicts_height", {}, tier);
    const card = buildScorecard(
      [a],
      marksOf({}, { a1: [netHit("hidden")], a2: [netHit("hint")] }),
    );
    expect(
      card.rows.map((r) => [r.code, r.tier, r.marks, r.winnerChanged]),
    ).toEqual([
      ["net_hit_contradicts_height", "hint", 1, 1],
      ["net_hit_contradicts_height", "hidden", 1, 1],
    ]);
  });

  test("rows read count, then hint, then hidden; a mark whose row is gone is not counted", () => {
    const a = point("a", 0, [shot("a1")]);
    const card = buildScorecard(
      [a],
      marksOf(
        {
          a: [
            mark("score_frozen", {}),
            mark("ending_suspect_line", {}),
            mark("pick_winner", {}),
          ],
          gone: [DISPUTED],
        },
        { "no-such-shot": [mark("geometry_discarded", {})] },
      ),
    );
    expect(card.rows.map((r) => r.code)).toEqual([
      "pick_winner",
      "ending_suspect_line",
      "score_frozen",
    ]);
  });

  test("added and deleted points are counted in the summary, and a deleted point's marks as changed", () => {
    const a = point("a", 0, [], { status: "deleted" });
    const b = point("b", 1, [], { status: "added", seed: null, winner: null });
    const c = point("c", 2);
    const card = buildScorecard([a, b, c], marksOf({ a: [DISPUTED] }));
    expect(card.points).toEqual({ live: 2, added: 1, deleted: 1, changed: 2 });
    expect(card.rows[0]).toMatchObject({
      marks: 1,
      winnerChanged: 0,
      anythingChanged: 1,
    });
  });
});

test.describe("a winner changed with no count mark", () => {
  test("lists the point, the two winners and the quieter marks it did carry", () => {
    const marked = point("a", 0, [], { winner: "p2" });
    const hinted = point("b", 1, [shot("b1")], { winner: "p2" });
    const bare = point("c", 2, [], { winner: null });
    const untouched = point("d", 3);
    const card = buildScorecard(
      [marked, hinted, bare, untouched],
      marksOf(
        {
          a: [DISPUTED],
          b: [mark("ending_suspect_line", {}), mark("winner_guessed", {})],
          d: [mark("serve_fault", {})],
        },
        { b1: [mark("out_ball_rally_continued", { nextHitter: null })] },
      ),
    );
    expect(card.unmarkedWinnerChanges).toEqual([
      {
        number: 2,
        from: "p1",
        to: "p2",
        otherCodes: [
          "ending_suspect_line",
          "winner_guessed",
          "out_ball_rally_continued",
        ],
      },
      { number: 3, from: "p1", to: null, otherCodes: [] },
    ]);
  });
});

test.describe("last strokes seeded In whose coordinates say Out or Net", () => {
  test("only the last seeded stroke with a result, only seeded In, only with all four coordinates", () => {
    const moved = point("a", 0, [
      shot("a1", { video_time: 1, ...LONG }),
      shot("a2", { video_time: 2, ...LONG }, { result: "out" }),
    ]);
    const kept = point("b", 1, [shot("b1", { ...NETTED })]);
    const deleted = point("c", 2, [
      shot("c1", { ...LONG }, { status: "deleted" }),
    ]);
    // Not listed: coordinates agree; seeded Out already; a coordinate
    // missing; and a mid-rally stroke, whatever its coordinates say.
    const agrees = point("d", 3, [shot("d1")]);
    const seededOut = point("e", 4, [shot("e1", { result: "out", ...LONG })]);
    const unmeasured = point("f", 5, [
      shot("f1", { ...LONG, landing_y: null }),
    ]);
    const midRally = point("g", 6, [
      shot("g1", { video_time: 1, ...LONG }),
      shot("g2", { video_time: 2 }),
    ]);
    // A stroke the derivation gave no result is skipped for the one before.
    const phantomLast = point("h", 7, [
      shot("h1", { video_time: 1, ...NETTED }, { result: "net" }),
      shot("h2", { video_time: 2, result: null }),
    ]);
    const card = buildScorecard(
      [
        moved,
        kept,
        deleted,
        agrees,
        seededOut,
        unmeasured,
        midRally,
        phantomLast,
      ],
      marksOf({}),
    );
    expect(card.seededInLastStrokes).toEqual([
      { number: 1, byCoordinates: "out", labelled: "out" },
      { number: 2, byCoordinates: "net", labelled: "in" },
      { number: 3, byCoordinates: "out", labelled: "deleted" },
      { number: 8, byCoordinates: "net", labelled: "net" },
    ]);
  });

  test("the order is the SEEDED one: a stroke the labeller re-timed is still where it was seeded", () => {
    const retimed = point("a", 0, [
      // Seeded last (t=2), since moved to the front by the labeller.
      shot("a2", { video_time: 2, ...LONG }, { videoTime: 0.5 }),
      shot("a1", { video_time: 1 }),
    ]);
    expect(buildScorecard([retimed], marksOf({})).seededInLastStrokes).toEqual([
      { number: 1, byCoordinates: "out", labelled: "in" },
    ]);
  });
});

test.describe("strokes the labeller deleted", () => {
  test("the two dead-ball reasons are one; each is counted with whether it followed an out or net by seeded coordinates", () => {
    expect(deleteReasonGroup("dead_ball_after_fault")).toBe(AFTER_POINT_ENDED);
    expect(deleteReasonGroup("dead_ball_after_point")).toBe(AFTER_POINT_ENDED);
    expect(deleteReasonGroup("duplicate")).toBe("duplicate");
    expect(deleteReasonGroup(null)).toBe("no reason");

    const gone = (id: string, time: number, reason: string | null) =>
      shot(
        id,
        { video_time: time },
        { status: "deleted", deleteReason: reason },
      );
    const a = point("a", 0, [
      shot("a1", { video_time: 1, ...LONG }),
      gone("a2", 2, "dead_ball_after_point"),
      // Directly after a2, whose coordinates are in: not "after out or net".
      gone("a3", 3, "dead_ball_after_fault"),
    ]);
    const b = point("b", 1, [
      shot("b1", { video_time: 1, ...NETTED }),
      gone("b2", 2, "duplicate"),
      shot("b3", { video_time: 3 }),
      gone("b4", 4, "not_a_stroke"),
      gone("b5", 5, null),
    ]);
    // A first stroke has nothing before it; a stroke the labeller added and
    // then deleted was never the vendor's, and is not listed.
    const c = point("c", 2, [
      gone("c1", 1, "dead_ball_after_point"),
      shot("c2", {}, { status: "deleted", seed: null, eventId: null }),
    ]);
    const card = buildScorecard([a, b, c], marksOf({}));
    expect(card.deletedShots).toEqual([
      { reason: AFTER_POINT_ENDED, deleted: 3, afterOutOrNet: 1 },
      { reason: "duplicate", deleted: 1, afterOutOrNet: 1 },
      { reason: "not_a_stroke", deleted: 1, afterOutOrNet: 0 },
      { reason: "no reason", deleted: 1, afterOutOrNet: 0 },
    ]);
  });

  test("a stroke the site removed is not a hand deletion until the labeller deletes it", () => {
    const ghost = shot(
      "a2",
      { video_time: 2 },
      { siteRemoval: "hit_after_fault" },
    );
    const a = point("a", 0, [shot("a1", { video_time: 1 }), ghost]);
    expect(buildScorecard([a], marksOf({})).deletedShots).toEqual([]);
    const b = point("b", 0, [
      shot("b1", { video_time: 1 }),
      { ...ghost, status: "deleted", deleteReason: "other" },
    ]);
    expect(buildScorecard([b], marksOf({})).deletedShots).toEqual([
      { reason: "other", deleted: 1, afterOutOrNet: 0 },
    ]);
  });
});

test.describe("the marks as the session opened", () => {
  test("the score marks are read off the SEEDED score, not the corrected one", () => {
    // Seeded: p1 won both. The labeller made point 1 a let, added a point
    // and deleted one — none of which is how the session opened.
    const a = point("a", 0, [], { ending: "let_replayed", status: "edited" });
    const added = point("x", 1, [], { status: "added", seed: null });
    const b = point("b", 2, [], { winner: "p2" });
    const c = point("c", 3, [], { status: "deleted" });
    expect(seededScorePoints([a, added, b, c])).toEqual([
      {
        id: "a",
        pointIndex: 0,
        status: "unchanged",
        setNumber: 1,
        gameNumber: 1,
        server: "p1",
        winner: "p1",
        ending: "winner",
        gameType: "game",
      },
      expect.objectContaining({ id: "b", pointIndex: 1, winner: "p1" }),
      expect.objectContaining({ id: "c", pointIndex: 2, status: "unchanged" }),
    ]);

    // Served deuce, deuce, ad: at the seeded 15–0 the second should come
    // from the ad side — "Wrong side for the score" on b, and b repeats a.
    const file: LabelMarks = {
      points: { a: [DISPUTED] },
      shots: {},
      suggestions: [],
      serveSides: { a: "deuce", b: "deuce", c: "ad" },
    };
    const opened = openingMarks(file, [a, added, b, c], true);
    expect(opened.points.a).toEqual([DISPUTED]);
    expect(opened.points.b.map((m) => [m.code, m.tier])).toEqual([
      ["score_side_mismatch", "count"],
      ["service_court_repeat", "count"],
    ]);
    // Once per game: c, wrong too at the seeded 30–0, follows from b.
    expect(opened.points.c).toBeUndefined();
    // And they are scored like any other mark.
    const card = buildScorecard([a, added, b, c], opened);
    expect(
      card.rows.map((r) => [
        r.code,
        r.marks,
        r.winnerChanged,
        r.anythingChanged,
      ]),
    ).toEqual([
      ["winner_disputed", 1, 0, 1],
      ["score_side_mismatch", 1, 1, 1],
      ["service_court_repeat", 1, 1, 1],
    ]);
    // b's winner changed under a count mark: not an unmarked change.
    expect(card.unmarkedWinnerChanges).toEqual([]);
  });
});

test.describe("the script is a thin, read-only shell", () => {
  const source = readFileSync("scripts/label-scorecard.ts", "utf8");

  test("it only SELECTs: no write, no rpc, no storage write", () => {
    expect(source).not.toMatch(
      /\.(insert|update|upsert|delete|rpc|upload|remove|move|copy)\(/,
    );
    for (const table of source.matchAll(/\.from\("([a-z_]+)"\)/g)) {
      expect([
        "label_sessions",
        "label_points",
        "label_shots",
        "matches",
      ]).toContain(table[1]);
    }
  });
});
