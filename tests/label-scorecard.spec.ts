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
  openingMarkRows,
  openingMarks,
  pointChange,
  renderScorecard,
  seededScorePoints,
  shotChangedFromSeed,
  vendorStrokeFacts,
  type VendorStrokeFacts,
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
      ["winner_guessed", "Winner guessed", "count", 1, 0, 0, 0],
      ["serve_fault", "Serve fault?", "hidden", 1, 1, 0, 1],
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

test.describe("a change with no count mark", () => {
  test("lists the point, each field that changed, the stroke counts and the quieter marks it did carry", () => {
    const marked = point("a", 0, [], { winner: "p2" });
    const hinted = point("b", 1, [shot("b1")], { winner: "p2" });
    const bare = point("c", 2, [], { winner: null });
    const untouched = point("d", 3);
    const card = buildScorecard(
      [marked, hinted, bare, untouched],
      marksOf(
        {
          a: [DISPUTED],
          b: [mark("ending_suspect_line", {}), mark("score_frozen", {})],
          d: [mark("serve_fault", {})],
        },
        { b1: [mark("out_ball_rally_continued", { nextHitter: null })] },
      ),
    );
    const none = {
      ending: null,
      endedBy: null,
      server: null,
      game: null,
      shots: { edited: 0, deleted: 0, added: 0 },
    };
    expect(card.unmarkedChanges).toEqual([
      {
        number: 2,
        winner: { from: "p1", to: "p2" },
        ...none,
        hints: ["ending_suspect_line"],
        hidden: ["score_frozen", "out_ball_rally_continued"],
      },
      {
        number: 3,
        winner: { from: "p1", to: null },
        ...none,
        hints: [],
        hidden: [],
      },
    ]);
  });

  test("every field counts: ending, ended by, server, the game, and a stroke edited, deleted or added", () => {
    const ending = point("a", 0, [], { ending: "error", endedBy: "p2" });
    const server = point("b", 1, [], { server: "p2" });
    const game = point("c", 2, [], { gameNumber: 2 });
    const strokes = point("d", 3, [
      shot("d1", {}, { result: "out" }),
      shot("d2", {}, { status: "deleted" }),
      shot("d3", {}, { status: "added", seed: null, eventId: null }),
      shot("d4"),
    ]);
    // Not listed: a change under a count mark; a point the labeller added
    // (no seed); a deleted point; a serve side, which is no field of the
    // list; and an untouched point.
    const chipped = point("e", 4, [], { winner: "p2" });
    const added = point("f", 5, [], { status: "added", seed: null });
    const gone = point("g", 6, [], { status: "deleted", winner: "p2" });
    const side = point("h", 7, [], { serveSide: "ad" });
    const same = point("i", 8);
    const card = buildScorecard(
      [ending, server, game, strokes, chipped, added, gone, side, same],
      marksOf({ e: [DISPUTED], g: [mark("serve_fault", {})] }),
    );
    expect(
      card.unmarkedChanges.map((row) => [
        row.number,
        row.ending,
        row.endedBy,
        row.server,
        row.game,
        row.shots,
      ]),
    ).toEqual([
      [
        1,
        { from: "winner", to: "error" },
        { from: "p1", to: "p2" },
        null,
        null,
        { edited: 0, deleted: 0, added: 0 },
      ],
      [
        2,
        null,
        null,
        { from: "p1", to: "p2" },
        null,
        { edited: 0, deleted: 0, added: 0 },
      ],
      [
        3,
        null,
        null,
        null,
        { from: "1·1", to: "1·2" },
        { edited: 0, deleted: 0, added: 0 },
      ],
      [4, null, null, null, null, { edited: 1, deleted: 1, added: 1 }],
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
    // b's winner changed under a count mark, and a's let is a count mark's
    // point too: neither is an unmarked change.
    expect(card.unmarkedChanges).toEqual([]);
  });
});

/** A vendor stroke's facts: an ordinary in ball unless `over` says otherwise. */
function facts(over: Partial<VendorStrokeFacts> = {}): VendorStrokeFacts {
  return {
    in: true,
    netHit: false,
    bounce: { x: 1, y: 8 },
    bouncePlaceholder: false,
    isServe: false,
    ...over,
  };
}
const vendorOf = (entries: Record<string, VendorStrokeFacts>) =>
  new Map(Object.entries(entries));

test.describe("the vendor's stroke, read", () => {
  test("booleans, the placeholder, the enclosure and the stroke type", () => {
    expect(
      vendorStrokeFacts({
        in: false,
        net_hit: true,
        bounce_x_m: 1.5,
        bounce_y_m: -3,
        stroke_type: "Serve",
      }),
    ).toEqual({
      in: false,
      netHit: true,
      bounce: { x: 1.5, y: -3 },
      bouncePlaceholder: false,
      isServe: true,
    });
    // The -9999 placeholder (as the float too) is no bounce; a bounce outside
    // the enclosure is none either, but is no placeholder.
    expect(
      vendorStrokeFacts({ bounce_x_m: -9999, bounce_y_m: -9999.0 }),
    ).toMatchObject({ bounce: null, bouncePlaceholder: true });
    expect(
      vendorStrokeFacts({ bounce_x_m: 2, bounce_y_m: 371.7 }),
    ).toMatchObject({ bounce: null, bouncePlaceholder: false });
    expect(vendorStrokeFacts({ stroke_type: "groundstroke" })).toMatchObject({
      in: null,
      netHit: null,
      isServe: false,
    });
    expect(vendorStrokeFacts(null)).toBeNull();
    expect(vendorStrokeFacts("stroke")).toBeNull();
  });
});

test.describe("games", () => {
  const won = (
    id: string,
    index: number,
    winner: "p1" | "p2",
    game: number,
    now: Partial<LabelPoint> = {},
  ) => point(id, index, [], { winner, gameNumber: game, ...now });

  test("a game that ends undecided and a game with points past its deciding one, by the session's scoring", () => {
    // Game 1: p1 wins four straight, then one more point sits in it.
    // Game 2: 30–40 to the receiver, and the rows stop.
    const rows = [
      won("a", 0, "p1", 1),
      won("b", 1, "p1", 1),
      won("c", 2, "p1", 1),
      won("d", 3, "p1", 1),
      won("e", 4, "p2", 1),
      won("f", 5, "p1", 2, { server: "p2" }),
      won("g", 6, "p1", 2, { server: "p2" }),
      won("h", 7, "p2", 2, { server: "p2" }),
      won("i", 8, "p1", 2, { server: "p2" }),
      won("j", 9, "p2", 2, { server: "p2" }),
    ];
    const card = buildScorecard(rows, marksOf({}), { adScoring: false });
    expect(card.games).toEqual({
      undecided: [
        {
          set: 1,
          gameInSet: 2,
          gameNumber: 2,
          from: 6,
          to: 10,
          score: "30–40",
          server: "p2",
        },
      ],
      overflow: [
        {
          set: 1,
          gameInSet: 1,
          gameNumber: 1,
          from: 5,
          to: 5,
          score: "Game–15",
          server: "p1",
        },
      ],
    });
  });

  test("with ad scoring, 40–40 and Ad are undecided; without it, the point at 40–40 decides", () => {
    const deuce = ["p1", "p1", "p2", "p2", "p1", "p2", "p1", "p2"] as const;
    const rows = deuce.map((winner, i) => won(`p${i}`, i, winner, 1));
    const ad = buildScorecard(rows, marksOf({}), { adScoring: true });
    expect(ad.games.undecided.map((g) => g.score)).toEqual(["40–40"]);
    expect(ad.games.overflow).toEqual([]);
    const noAd = buildScorecard(rows, marksOf({}), { adScoring: false });
    expect(noAd.games.undecided).toEqual([]);
    // Decided on the seventh point (p1 at 40–40); the eighth is past it, and
    // still counted, as on the scoreboard.
    expect(noAd.games.overflow).toEqual([
      expect.objectContaining({ from: 8, to: 8, score: "Game–40" }),
    ]);
  });

  test("a tiebreak, a deleted point, a let and a point with no game are not read", () => {
    const rows = [
      won("a", 0, "p1", 1, { gameType: "tiebreak" }),
      won("b", 1, "p1", 2, { status: "deleted" }),
      won("c", 2, "p1", 2, { ending: "let_replayed" }),
      won("d", 3, "p1", 2),
      point("e", 4, [], { gameNumber: null, winner: "p1" }),
    ];
    const card = buildScorecard(rows, marksOf({}), { adScoring: false });
    expect(card.games.undecided).toEqual([
      expect.objectContaining({ gameInSet: 2, from: 3, to: 4, score: "15–0" }),
    ]);
    expect(card.games.overflow).toEqual([]);
  });
});

test.describe("winner flips by direction", () => {
  test("each direction once, most points first; a point with no seed or deleted is not a flip", () => {
    const rows = [
      point("a", 0, [], { winner: "p2" }),
      point("b", 1, [], { winner: "p2" }),
      point("c", 2, [], { winner: "p1", seed: null, status: "added" }),
      point("d", 3, [], { winner: null }),
      point("e", 4, [], { winner: "p2", status: "deleted" }),
      point("f", 5),
    ];
    expect(buildScorecard(rows, marksOf({})).winnerFlips).toEqual([
      { from: "p1", to: "p2", points: 2 },
      { from: "p1", to: null, points: 1 },
    ]);
  });
});

test.describe("last-stroke result changes", () => {
  test("the last live stroke's result against its seed, grouped, with the vendor's own out call", () => {
    const rows = [
      // The last live stroke: a deleted stroke and a ghost after it do not count.
      point("a", 0, [
        shot("a1", { video_time: 1 }, { result: "out" }),
        shot("a2", { video_time: 2 }, { status: "deleted" }),
        shot("a3", { video_time: 3 }, { siteRemoval: "hit_after_fault" }),
      ]),
      point("b", 1, [shot("b1", {}, { result: "out" })]),
      point("c", 2, [shot("c1", {}, { result: "net" })]),
      point("d", 3, [shot("d1", { result: "out" }, { result: "in" })]),
      // Unchanged, no seed (added), deleted point: none is a change.
      point("e", 4, [shot("e1")]),
      point("f", 5, [
        shot("f1", {}, { status: "added", seed: null, result: "out" }),
      ]),
      point("g", 6, [shot("g1", {}, { result: "out" })], {
        status: "deleted",
      }),
    ];
    const card = buildScorecard(rows, marksOf({}), {
      vendor: vendorOf({
        a1: facts({ in: false }),
        b1: facts({ in: true }),
        c1: facts({ in: false }),
        d1: facts({ in: false }),
      }),
    });
    expect(card.lastResultChanges).toEqual([
      { from: "in", to: "out", points: 2, vendorOut: 1 },
      { from: "in", to: "net", points: 1, vendorOut: 1 },
      { from: "out", to: "in", points: 1, vendorOut: 1 },
    ]);
  });

  test("with the marks off a ghost is a row, and the last one", () => {
    const rows = [
      point("a", 0, [
        shot("a1", { video_time: 1 }, { result: "out" }),
        shot(
          "a2",
          { video_time: 2, result: null },
          { siteRemoval: "hit_after_fault", result: "net" },
        ),
      ]),
    ];
    expect(
      buildScorecard(rows, marksOf({}), { ghosts: false }).lastResultChanges,
    ).toEqual([{ from: null, to: "net", points: 1, vendorOut: 0 }]);
  });
});

test.describe("last landings", () => {
  test("where the seed's landing went and what the labeller did with it", () => {
    const noLanding = { landing_x: null, landing_y: null };
    const rows = [
      // Vendor bounce, placed by the labeller.
      point("a", 0, [shot("a1", noLanding, { landingX: 1, landingY: 20 })]),
      // Placeholder and net hit at once, left empty on a net.
      point("b", 1, [
        shot("b1", noLanding, {
          result: "net",
          landingX: null,
          landingY: null,
        }),
      ]),
      // Added by the labeller, left empty and in.
      point("c", 2, [
        shot("c1", noLanding, {
          status: "added",
          seed: null,
          landingX: null,
          landingY: null,
        }),
      ]),
      // No result at all.
      point("d", 3, [
        shot("d1", noLanding, { result: null, landingX: null, landingY: null }),
      ]),
      // Seeded with a landing: not counted, whatever happened since.
      point("e", 4, [shot("e1", {}, { landingX: null, landingY: null })]),
    ];
    const card = buildScorecard(rows, marksOf({}), {
      vendor: vendorOf({
        a1: facts(),
        b1: facts({ bounce: null, bouncePlaceholder: true, netHit: true }),
        d1: facts({ bounce: null }),
      }),
    });
    expect(card.lastLandings).toEqual({
      points: 4,
      vendorBounce: 1,
      vendorPlaceholder: 1,
      netHits: 1,
      added: 1,
      placed: 1,
      remaining: { in: 1, outOrNet: 1, noResult: 1 },
    });
  });
});

test.describe("out-call tails", () => {
  const out = facts({ in: false });
  test("one or two vendor strokes after the vendor's last non-serve out call, on checked points; whether the labeller removed them", () => {
    const checked = { checkedAt: "2026-10-07T10:00:00Z" };
    const rows = [
      // Out call, then one stroke the labeller deleted: removed.
      point(
        "a",
        0,
        [
          shot("a1", { video_time: 1 }),
          shot("a2", { video_time: 2 }),
          shot("a3", { video_time: 3 }, { status: "deleted" }),
        ],
        checked,
      ),
      // Out call, then a ghost and a kept stroke: partly.
      point(
        "b",
        1,
        [
          shot("b1", { video_time: 1 }),
          shot("b2", { video_time: 2 }, { siteRemoval: "hit_after_fault" }),
          shot("b3", { video_time: 3 }),
        ],
        checked,
      ),
      // Out call, then one kept stroke: kept. The order is the SEEDED one.
      point(
        "c",
        2,
        [
          shot("c2", { video_time: 2 }, { videoTime: 0.5 }),
          shot("c1", { video_time: 1 }),
        ],
        checked,
      ),
      // A serve's out call is not an out call; three strokes after is no
      // tail; an out call on the last stroke has no tail; unchecked points
      // are not read.
      point(
        "d",
        3,
        [shot("d1", { video_time: 1 }), shot("d2", { video_time: 2 })],
        checked,
      ),
      point(
        "e",
        4,
        [1, 2, 3, 4].map((t) => shot(`e${t}`, { video_time: t })),
        checked,
      ),
      point(
        "f",
        5,
        [shot("f1", { video_time: 1 }), shot("f2", { video_time: 2 })],
        checked,
      ),
      point("g", 6, [
        shot("g1", { video_time: 1 }),
        shot("g2", { video_time: 2 }),
      ]),
    ];
    const card = buildScorecard(rows, marksOf({}), {
      vendor: vendorOf({
        a2: out,
        b1: out,
        c1: out,
        d1: facts({ in: false, isServe: true }),
        e1: out,
        f2: out,
        g1: out,
      }),
    });
    expect(card.outCallTails).toEqual([
      { number: 1, tail: 1, outcome: "removed" },
      { number: 2, tail: 2, outcome: "partly" },
      { number: 3, tail: 1, outcome: "kept" },
    ]);
  });
});

test.describe("serves", () => {
  test("three or more serves in the live rows or the vendor's, and a serve after a serve called in", () => {
    const serve = (id: string, t: number, now: Partial<LabelShot> = {}) =>
      shot(id, { stroke: "first_serve", video_time: t }, now);
    const rows = [
      // Three live serves, each a fault but the last.
      point("a", 0, [
        serve("a1", 1, { result: "out" }),
        serve("a2", 2, { result: "net" }),
        serve("a3", 3),
      ]),
      // Three by the vendor's word, one of them deleted since and one the
      // labeller made a forehand.
      point("b", 1, [
        serve("b1", 1, { result: "out" }),
        serve("b2", 2, { status: "deleted" }),
        shot(
          "b3",
          { stroke: "first_serve", video_time: 3 },
          { stroke: "forehand" },
        ),
      ]),
      // A serve after a serve the labeller called in.
      point("c", 2, [
        serve("c1", 1, { result: "in" }),
        serve("c2", 2, { result: "in" }),
      ]),
      // A fault then a second serve: the usual pair, nothing to say. A
      // deleted stroke between them is not in the live rows.
      point("d", 3, [
        serve("d1", 1, { result: "out" }),
        shot("d2", { video_time: 2 }, { status: "deleted" }),
        serve("d3", 3),
      ]),
    ];
    const card = buildScorecard(rows, marksOf({}), {
      vendor: vendorOf({
        b1: facts({ isServe: true }),
        b2: facts({ isServe: true }),
        b3: facts({ isServe: true }),
      }),
    });
    expect(card.serves).toEqual({ threeOrMore: [1, 2], serveAfterIn: [3] });
  });
});

test.describe("the markdown", () => {
  test("names the players and heads every section", () => {
    const rows = [
      point("a", 0, [shot("a1", {}, { result: "out" })], { winner: "p2" }),
      point("b", 1, [shot("b1")]),
    ];
    const text = renderScorecard(
      buildScorecard(rows, marksOf({}), { adScoring: false }),
      { title: "Scorecard", names: { p1: "Lee", p2: "Vargas" } },
    );
    for (const heading of [
      "## Marks, against what the labeller changed",
      "## Changed with no `count` mark on the point",
      "## Last strokes seeded In whose coordinates say Out or Net",
      "## Strokes the labeller deleted",
      "## Games",
      "## Winner flips by direction",
      "## Last-stroke result changes",
      "## Last landings",
      "## Out-call tails",
      "## Serves",
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain(
      "| 1 | winner Lee→Vargas; shot: 1 edited | none | none |",
    );
    expect(text).toContain("| Lee | Vargas | 1 |");
    expect(text).toContain("| in | out | 1 | 0 (0%) |");
    expect(text).toContain("| 1 | 1 | 1 | 1–2 | 15–15 | Lee |");
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

test.describe("a combine, measured as one point", () => {
  // Rallies 1 + 2 were one point: the labeller combined them into "a" (both
  // rallies, the winner flipped) and "b" is the tombstone, with no shots.
  const combined = () => {
    const a = point("a", 0, [shot("a1")], {
      vendorRallyIds: [1, 2],
      winner: "p2",
      status: "edited",
    });
    const b = point("b", 1, [], { vendorRallyIds: [2], status: "deleted" });
    return { a, b };
  };

  test("the opening rows put each seeded point back on its own rally, and an added one on none", () => {
    const { a, b } = combined();
    const added = point("c", 2, [], { vendorRallyIds: [2], seed: null });
    expect(
      openingMarkRows([a, b, added]).map((p) => [p.id, p.vendorRallyIds]),
    ).toEqual([
      ["a", [1]],
      ["b", [2]],
      ["c", []],
    ]);
  });

  test("a mark on the tombstone counts the kept point's changes, and the kept point is not an unmarked change", () => {
    const { a, b } = combined();
    const card = buildScorecard(
      [a, b],
      marksOf({ b: [mark("service_court_repeat", { side: "deuce" })] }),
    );
    expect(
      card.rows.map((r) => [
        r.code,
        r.marks,
        r.winnerChanged,
        r.anythingChanged,
      ]),
    ).toEqual([["service_court_repeat", 1, 1, 1]]);
    expect(card.unmarkedChanges).toEqual([]);
    // The flip is the kept point's alone, not counted twice.
    expect(card.winnerFlips.reduce((n, f) => n + f.points, 0)).toBe(1);
  });
});
