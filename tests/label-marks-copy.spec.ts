import { expect, test } from "@playwright/test";

import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import {
  HINT_ACTION_LABEL,
  hintLabel,
  MARK_LABEL,
  markHover,
  onPointsDetail,
  removeAfterLabel,
  toCheckLabel,
} from "@/lib/services/labels/marks-copy";
import {
  hoverLine,
  markState,
  markStates,
  markSummary,
  pointChanged,
  pointRowMarkList,
  rollupMarks,
  stateHoverParts,
  type MarkListPoint,
  type MarkStatePoint,
  type MarkStateShot,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";

const names = { p1: "Ace", p2: "Goodman" };

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, tier: meta.tier, scope: meta.scope, params } as LabelMark;
}

/** One mark of every code, with the params the board's sample row implies. */
const SAMPLES: { [C in LabelMarkCode]: LabelMarkParams[C] } = {
  winner_disputed: { scoreWinner: "p2", lastStrokeWinner: "p1" },
  winner_to_error_by_bounce: { loser: "p1" },
  ending_suspect_line: {},
  second_serve_called_out: {},
  same_player_consecutive: { hitter: "p1" },
  reserve_after_in: {},
  service_court_repeat: { side: "deuce" },
  score_side_mismatch: { score: "0-15", expected: "ad", actual: "deuce" },
  tiebreak_score_off_six_all: {},
  result_type_unknown: {},
  serve_fault: {},
  shot_after_point_end: { shotId: "s-3", after: ["s-4"] },
  ending_stale: { ending: "error", endedBy: "p2", winner: "p1" },
  second_serve_as_first: { shotId: "s-2" },
  last_landing_missing: {},
  last_shot_unresolved: {},
  serve_after_serve_in: { shotId: "s-2" },
  pick_winner: {},
  net_hit_contradicts_height: {},
  phantom_strokes_dropped: { eventIds: [41], hitter: "p2" },
  winner_guessed: {},
  score_frozen: {},
  segment_proposal_differs: {
    proposedGame: 4,
    proposedServer: "p2",
    mergedWith: null,
  },
  out_ball_rally_continued: { nextHitter: "p1" },
  geometry_discarded: {},
};

const CODES = Object.keys(LABEL_MARK_META) as LabelMarkCode[];
const sample = <C extends LabelMarkCode>(code: C) => mark(code, SAMPLES[code]);

const shot = (over: Partial<MarkStateShot> = {}): MarkStateShot => ({
  status: "kept",
  siteRemovalRestoredAt: null,
  ...over,
});

const point = (over: Partial<MarkStatePoint> = {}): MarkStatePoint => ({
  id: "point-1",
  status: "unchanged",
  checkedAt: null,
  dismissed: [],
  shots: [shot(), shot(), shot()],
  ...over,
});

const CHECKED_AT = "2026-10-05T12:00:00.000Z";
const SENTENCE = "Backhand error by Ace";

test.describe("mark copy", () => {
  test("every code has a label and a non-empty hover", () => {
    expect(Object.keys(MARK_LABEL).sort()).toEqual([...CODES].sort());
    for (const code of CODES) {
      expect(MARK_LABEL[code].length).toBeGreaterThan(0);
      const hover = markHover(sample(code), names);
      expect(hover.length).toBeGreaterThan(0);
      expect(hover).not.toContain("undefined");
      expect(hover).not.toContain("null");
    }
  });

  test("the labels are the board's", () => {
    expect(MARK_LABEL).toEqual({
      winner_disputed: "Check the ending",
      winner_to_error_by_bounce: "Winner or error?",
      ending_suspect_line: "Close to the line",
      second_serve_called_out: "Double fault?",
      same_player_consecutive: "Missing shot?",
      reserve_after_in: "Serve replayed",
      service_court_repeat: "Same side twice",
      score_side_mismatch: "Wrong side for the score",
      tiebreak_score_off_six_all: "Tiebreak score, not 6–6",
      result_type_unknown: "Ending unknown",
      net_hit_contradicts_height: "Net or out?",
      serve_fault: "Serve fault?",
      shot_after_point_end: "Point ended here",
      ending_stale: "Ending looks stale",
      second_serve_as_first: "Second serve?",
      last_landing_missing: "No landing on the last shot",
      last_shot_unresolved: "Ending can’t be read",
      serve_after_serve_in: "Serve after a serve in play",
      pick_winner: "Pick the winner",
      phantom_strokes_dropped: "1 shot removed",
      out_ball_rally_continued: "Out call ignored",
      winner_guessed: "Winner guessed",
      score_frozen: "Score not read",
      segment_proposal_differs: "Game cut differs",
      geometry_discarded: "No position",
    });
  });

  test("the header has one total's words", () => {
    expect(toCheckLabel(0)).toBe("Nothing left to check");
    expect(toCheckLabel(1)).toBe("1 flag to check");
    expect(toCheckLabel(41)).toBe("41 flags to check");
    expect(onPointsDetail(0)).toBeUndefined();
    expect(onPointsDetail(1)).toBe("On 1 point");
    expect(onPointsDetail(30)).toBe("On 30 points");
  });

  test("hover lines are the board's, with the players' names", () => {
    expect(markHover(sample("winner_disputed"), names)).toBe(
      "The score says Goodman won, but the last shot says Ace did. The ending is wrong more often than the winner.",
    );
    expect(markHover(sample("same_player_consecutive"), names)).toBe(
      "Ace hit twice in a row. A shot in between was probably missed.",
    );
    expect(markHover(sample("phantom_strokes_dropped"), names)).toBe(
      "Goodman swung at a serve that had already faulted. That swing isn’t part of the point, so it was removed.",
    );
    expect(markHover(sample("out_ball_rally_continued"), names)).toBe(
      "The vendor called this ball out, but Ace played the next shot, so it’s stored as in.",
    );
    expect(markHover(sample("serve_fault"), names)).toBe(
      "The first serve was called out and only one or two shots followed, with no second serve. It may be a fault the returner hit anyway.",
    );
    expect(markHover(sample("winner_to_error_by_bounce"), names)).toBe(
      "The ball before this winner landed out. The point may be an error by Ace instead.",
    );
    expect(markHover(sample("service_court_repeat"), names)).toBe(
      "Served from the deuce side two points running. A point may be missing, or this one was replayed.",
    );
    expect(markHover(sample("score_side_mismatch"), names)).toBe(
      "At 0–15 the serve should come from the ad side. This one came from the deuce side.",
    );
    expect(markHover(sample("ending_stale"), names)).toBe(
      "The strokes say an error by Goodman.",
    );
    expect(
      markHover(
        mark("ending_stale", { ending: "ace", endedBy: null, winner: null }),
        names,
      ),
    ).toBe("The strokes say an ace.");
    expect(markHover(sample("second_serve_as_first"), names)).toBe(
      "Follows a faulted serve, so it is the second serve.",
    );
    expect(markHover(sample("shot_after_point_end"), names)).toBe(
      "The ball was out, so what follows was hit after the point ended — or a second point in the same rally.",
    );
    expect(markHover(sample("last_landing_missing"), names)).toBe(
      "Place the last bounce to settle Out, Net or In.",
    );
    expect(markHover(sample("last_shot_unresolved"), names)).toBe(
      "The last shot has no landing and no result, so the point’s ending is unknown.",
    );
    expect(markHover(sample("serve_after_serve_in"), names)).toBe(
      "A let that was played, or two points in one rally.",
    );
  });

  test("a hint's words on the line: the label, and for “Point ended here” the count after it", () => {
    expect(hintLabel(sample("ending_stale"))).toBe("Ending looks stale");
    expect(hintLabel(sample("shot_after_point_end"))).toBe(
      "Point ended here · 1 shot after it",
    );
    expect(
      hintLabel(
        mark("shot_after_point_end", { shotId: "s-1", after: ["a", "b", "c"] }),
      ),
    ).toBe("Point ended here · 3 shots after it");
    expect(HINT_ACTION_LABEL).toEqual({
      ending_stale: "Use it",
      second_serve_as_first: "Make it a second serve",
      shot_after_point_end: "Split here",
      serve_after_serve_in: "Split here",
    });
    expect(removeAfterLabel(1)).toBe("Remove 1");
    expect(removeAfterLabel(3)).toBe("Remove 3");
  });

  test("a mark the derivation could not fill still reads as a sentence", () => {
    for (const hover of [
      markHover(mark("service_court_repeat", { side: null }), names),
      markHover(
        mark("score_side_mismatch", {
          score: null,
          expected: null,
          actual: null,
        }),
        names,
      ),
      markHover(mark("out_ball_rally_continued", { nextHitter: null }), names),
      markHover(
        mark("phantom_strokes_dropped", { eventIds: [1, 2], hitter: "p2" }),
        names,
      ),
    ]) {
      expect(hover.length).toBeGreaterThan(0);
      expect(hover).not.toContain("null");
      expect(hover).not.toContain("undefined");
    }
  });
});

test.describe("a flag's life", () => {
  const flag = sample("winner_disputed");

  test("open, settled, checked, checked as is — on one point", () => {
    expect(markState(flag, point())).toBe("open");
    expect(markState(flag, point({ status: "edited" }))).toBe("settled");
    expect(
      markState(flag, point({ status: "edited", checkedAt: CHECKED_AT })),
    ).toBe("checked");
    expect(markState(flag, point({ checkedAt: CHECKED_AT }))).toBe(
      "checked-as-is",
    );
  });

  test("a change to any shot of the point settles its flags", () => {
    for (const status of ["edited", "added", "deleted"] as const) {
      expect(
        markState(flag, point({ shots: [shot(), shot({ status })] })),
      ).toBe("settled");
    }
    expect(
      markState(
        flag,
        point({ shots: [shot({ siteRemovalRestoredAt: CHECKED_AT })] }),
      ),
    ).toBe("settled");
    expect(pointChanged(point({ status: "added" }))).toBe(true);
    expect(pointChanged(point())).toBe(false);
  });

  test("dismissed follows the suggestion key tied to the mark", () => {
    const sameSide = sample("service_court_repeat");

    expect(
      markState(sameSide, point({ dismissed: ["missing_shot:812"] })),
    ).toBe("open");
    expect(markState(sameSide, point({ dismissed: ["missing_point"] }))).toBe(
      "dismissed",
    );
    // Another mark on the same point is untouched by the dismissal.
    expect(markState(flag, point({ dismissed: ["missing_point"] }))).toBe(
      "open",
    );
    expect(markState(flag, point({ dismissed: ["missing_shot:812"] }))).toBe(
      "open",
    );
    // Dismissed stays dismissed once the point is checked.
    expect(
      markState(
        sameSide,
        point({ dismissed: ["missing_point"], checkedAt: CHECKED_AT }),
      ),
    ).toBe("dismissed");
  });

  test("a missing point settles 'Same side twice' once a point is added between the two", () => {
    const sameSide = sample("service_court_repeat");
    const suggestion: LabelSuggestion = {
      kind: "missing_point",
      key: "missing_point",
      pointId: "point-1",
      beforePointId: "point-0",
      side: "ad",
      pointNumbers: [1, 2],
    };
    const rows = (between: MarkStatePoint["status"] | null) => [
      { id: "point-0", status: "unchanged" as const },
      ...(between ? [{ id: "point-new", status: between }] : []),
      { id: "point-1", status: "unchanged" as const },
    ];
    // Without the rows the add cannot be seen; with them, the flag is settled
    // though the flagged point itself is untouched.
    expect(markState(sameSide, point(), [suggestion])).toBe("open");
    expect(markState(sameSide, point(), [suggestion], rows(null))).toBe("open");
    expect(markState(sameSide, point(), [suggestion], rows("added"))).toBe(
      "settled",
    );
    expect(
      markState(
        sameSide,
        point({ checkedAt: CHECKED_AT }),
        [suggestion],
        rows("added"),
      ),
    ).toBe("checked");
    // Deleting the added point opens the question again; a vendor point
    // between the two was always there and answers nothing.
    expect(markState(sameSide, point(), [suggestion], rows("deleted"))).toBe(
      "open",
    );
    expect(markState(sameSide, point(), [suggestion], rows("unchanged"))).toBe(
      "open",
    );
    // Answered outranks dismissed, and another flag on the point is untouched.
    expect(
      markState(
        sameSide,
        point({ dismissed: ["missing_point"] }),
        [suggestion],
        rows("added"),
      ),
    ).toBe("settled");
    expect(markState(flag, point(), [suggestion], rows("added"))).toBe("open");
    expect(
      markStates([sameSide, flag], point(), [suggestion], rows("added")),
    ).toEqual(["settled", "open"]);
  });

  test("'Missing shot?' is counted, and its slot answers it: added settles, every one dismissed dismisses", () => {
    const missing = sample("same_player_consecutive");
    expect(LABEL_MARK_META.same_player_consecutive.tier).toBe("count");
    const slot = (afterEventId: number): LabelSuggestion => ({
      kind: "missing_shot",
      key: `missing_shot:${afterEventId}`,
      pointId: "point-1",
      afterShotId: `s-${afterEventId}`,
      hitter: "p2",
      videoTime: null,
    });
    const slots = [slot(7), slot(9)];
    expect(markState(missing, point(), slots)).toBe("open");
    // Dismissing one slot of two leaves the question open; both, dismissed.
    expect(
      markState(missing, point({ dismissed: ["missing_shot:7"] }), slots),
    ).toBe("open");
    expect(
      markState(
        missing,
        point({ dismissed: ["missing_shot:7", "missing_shot:9"] }),
        slots,
      ),
    ).toBe("dismissed");
    expect(
      markState(
        missing,
        point({
          dismissed: ["missing_shot:7", "missing_shot:9"],
          checkedAt: CHECKED_AT,
        }),
        slots,
      ),
    ).toBe("dismissed");
    // "Add shot" on a slot settles it, and outranks a dismissal.
    const added = point({
      dismissed: ["missing_shot:7", "missing_shot:9"],
      shots: [shot(), shot({ status: "added", afterEventId: 7 }), shot()],
    });
    expect(markState(missing, added, slots)).toBe("settled");
    expect(markState(missing, { ...added, checkedAt: CHECKED_AT }, slots)).toBe(
      "checked",
    );
    // Without the session's suggestions a dismissal cannot be seen, and any
    // change to the point settles it as it does every mark.
    expect(markState(missing, point({ dismissed: ["missing_shot:7"] }))).toBe(
      "open",
    );
    expect(markState(missing, point({ status: "edited" }), slots)).toBe(
      "settled",
    );
    // Another mark on the point is untouched by the slots.
    expect(
      markState(
        flag,
        point({ dismissed: ["missing_shot:7", "missing_shot:9"] }),
        slots,
      ),
    ).toBe("open");
    // Counted by the header, and not once dismissed.
    const p = {
      ...point({ dismissed: [] }),
      shots: [
        {
          id: "s1",
          status: "kept",
          siteRemoval: null,
          siteRemovalRestoredAt: null,
        },
      ],
    } as unknown as LabelPoint;
    const marks = {
      points: { "point-1": [missing] },
      shots: {},
      suggestions: slots,
      serveSides: {},
    };
    expect(markSummary([p], marks)).toEqual({ open: 1, openPoints: 1 });
    expect(
      markSummary(
        [{ ...p, dismissed: ["missing_shot:7", "missing_shot:9"] }],
        marks,
      ),
    ).toEqual({ open: 0, openPoints: 0 });
    expect(rollupMarks([missing], markStates([missing], p, slots))).toEqual({
      text: "Missing shot?",
      count: 1,
      state: "open",
    });
  });

  const stateHover = (...args: Parameters<typeof stateHoverParts>) =>
    hoverLine(stateHoverParts(...args));

  test("the state hovers are the board's", () => {
    expect(stateHover(flag, "settled", names, SENTENCE)).toBe(
      "Check the ending · settled. You changed the ending to Backhand error by Ace.",
    );
    expect(stateHover(flag, "checked", names, SENTENCE)).toBe(
      "Check the ending · settled. You changed the ending to Backhand error by Ace.",
    );
    expect(stateHover(flag, "checked-as-is", names, SENTENCE)).toBe(
      "Check the ending · checked as is. You confirmed the point without changing it.",
    );
    expect(
      stateHover(sample("service_court_repeat"), "dismissed", names, SENTENCE),
    ).toBe("Same side twice · dismissed.");
  });

  test("a 'Same side twice' settled by adding the point says so", () => {
    const sameSide = sample("service_court_repeat");
    for (const state of ["settled", "checked"] as const) {
      expect(stateHover(sameSide, state, names, SENTENCE, true)).toBe(
        "Same side twice · settled. You added the missing point.",
      );
      // Settled by a let instead: the ordinary line, the ending did change.
      expect(stateHover(sameSide, state, names, "Let, replayed", false)).toBe(
        "Same side twice · settled. You changed the ending to Let, replayed.",
      );
    }
    // The line belongs to that one flag; another settled flag keeps its own.
    expect(stateHover(flag, "settled", names, SENTENCE, true)).toBe(
      "Check the ending · settled. You changed the ending to Backhand error by Ace.",
    );
    expect(stateHover(sameSide, "dismissed", names, SENTENCE, true)).toBe(
      "Same side twice · dismissed.",
    );
  });

  test("an open mark is named by its label, over its own line", () => {
    expect(stateHoverParts(flag, "open", names, SENTENCE)).toEqual({
      name: "Check the ending",
      detail: markHover(flag, names),
    });
    expect(stateHoverParts(flag, "settled", names, SENTENCE)).toEqual({
      name: "Check the ending · settled",
      detail: "You changed the ending to Backhand error by Ace.",
    });
  });
});

test.describe("the row roll-up", () => {
  const rollup = (countMarks: LabelMark[], p: MarkStatePoint) =>
    rollupMarks(countMarks, markStates(countMarks, p));

  test("no marks, nothing to show", () => {
    expect(rollup([], point())).toBeNull();
  });

  test("one mark keeps its words", () => {
    expect(rollup([sample("winner_disputed")], point())).toEqual({
      text: "Check the ending",
      count: 1,
      state: "open",
    });
  });

  test("two marks read as a count", () => {
    expect(
      rollup([sample("winner_disputed"), sample("pick_winner")], point()),
    ).toEqual({ text: "2 to check", count: 2, state: "open" });
  });

  test("a settled mark loses its words and the pencil appears", () => {
    const marks = [sample("winner_disputed")];
    expect(rollup(marks, point({ status: "edited" }))).toEqual({
      text: null,
      count: 1,
      state: "settled",
    });
    expect(
      rollup(marks, point({ status: "edited", checkedAt: CHECKED_AT })),
    ).toEqual({ text: null, count: 1, state: "checked" });
    expect(rollup(marks, point({ checkedAt: CHECKED_AT }))).toEqual({
      text: null,
      count: 1,
      state: "checked-as-is",
    });
  });

  test("the chip is as open as its most open member", () => {
    // One dismissed, one still open: the open one keeps its words.
    expect(
      rollup(
        [sample("service_court_repeat"), sample("winner_disputed")],
        point({ dismissed: ["missing_point"] }),
      ),
    ).toEqual({ text: "Check the ending", count: 2, state: "open" });
    // Dismissed outranks checked as is.
    expect(
      rollup(
        [sample("service_court_repeat"), sample("winner_disputed")],
        point({ dismissed: ["missing_point"], checkedAt: CHECKED_AT }),
      ),
    ).toEqual({ text: null, count: 2, state: "dismissed" });
  });
});

test.describe("the tiers on a point", () => {
  type ListShot = MarkListPoint["shots"][number];
  const listShot = (id: string, over: Partial<ListShot> = {}): ListShot => ({
    id,
    status: "kept",
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    ...over,
  });
  const listPoint = (shots: ListShot[]): MarkListPoint => ({
    id: "point-1",
    shots,
  });
  const marksOf = (
    pointMarks: LabelMark[],
    shots: Record<string, LabelMark[]> = {},
  ) => ({
    points: { "point-1": pointMarks },
    shots,
    suggestions: [],
    serveSides: {},
  });
  const codes = (list: LabelMark[]) => list.map((m) => m.code);
  const COUNT = CODES.filter((c) => LABEL_MARK_META[c].tier === "count");
  const HINT = CODES.filter((c) => LABEL_MARK_META[c].tier === "hint");
  const HIDDEN = CODES.filter((c) => LABEL_MARK_META[c].tier === "hidden");

  test("count marks are the chip's; hints the open point's line; hidden ones neither", () => {
    // Every code of every tier on one point, the shot-scoped ones on its
    // last stroke — the most a point could be handed.
    const p = listPoint([listShot("s1"), listShot("s2")]);
    const onPoint = CODES.filter((c) => LABEL_MARK_META[c].scope === "point");
    const onShot = CODES.filter((c) => LABEL_MARK_META[c].scope === "shot");
    const list = pointRowMarkList(
      p,
      marksOf(onPoint.map(sample), { s2: onShot.map(sample) }),
    );
    expect(codes(list.count).sort()).toEqual([...COUNT].sort());
    expect(codes(list.hints).sort()).toEqual([...HINT].sort());
    for (const hidden of HIDDEN) {
      expect(codes(list.count)).not.toContain(hidden);
      expect(codes(list.hints)).not.toContain(hidden);
    }
  });

  test("a hidden mark is never counted, even when the marks carry it", () => {
    const p = {
      ...point(),
      shots: [listShot("s1")],
    } as unknown as LabelPoint;
    const marks = marksOf(
      HIDDEN.filter(
        (c) => c !== "out_ball_rally_continued" && c !== "geometry_discarded",
      ).map(sample),
      {
        s1: [sample("out_ball_rally_continued"), sample("geometry_discarded")],
      },
    );
    expect(pointRowMarkList(p, marks)).toEqual({ count: [], hints: [] });
    expect(markSummary([p], marks)).toEqual({ open: 0, openPoints: 0 });
  });

  test("hints are not counted, and have no state: the header reads count marks only", () => {
    const p = { ...point(), shots: [listShot("s1")] } as unknown as LabelPoint;
    const marks = marksOf(
      [
        sample("winner_disputed"),
        ...HINT.filter((c) => c !== "net_hit_contradicts_height").map(sample),
      ],
      { s1: [sample("net_hit_contradicts_height")] },
    );
    expect(markSummary([p], marks)).toEqual({ open: 1, openPoints: 1 });
    // Checked, the one counted mark is answered; the hints are still listed.
    const checked = { ...p, checkedAt: CHECKED_AT } as LabelPoint;
    expect(markSummary([checked], marks)).toEqual({ open: 0, openPoints: 0 });
    expect(pointRowMarkList(checked, marks).hints.length).toBe(HINT.length);
    // A deleted point counts nothing.
    const deleted = { ...p, status: "deleted" } as LabelPoint;
    expect(markSummary([deleted], marks)).toEqual({ open: 0, openPoints: 0 });
  });

  test("“Net or out?” joins the line only from the point's last live stroke", () => {
    const netHit = sample("net_hit_contradicts_height");
    const hintsOf = (shots: ListShot[], on: string) =>
      codes(
        pointRowMarkList(listPoint(shots), marksOf([], { [on]: [netHit] }))
          .hints,
      );

    expect(hintsOf([listShot("s1"), listShot("s2")], "s2")).toEqual([
      "net_hit_contradicts_height",
    ]);
    // On a stroke the rally went on from: nothing.
    expect(hintsOf([listShot("s1"), listShot("s2")], "s1")).toEqual([]);
    // The labeller added a stroke after it: it no longer ends the point.
    expect(
      hintsOf([listShot("s1"), listShot("s2", { status: "added" })], "s1"),
    ).toEqual([]);
    // A tombstone and a ghost after it are not live: it is still the last.
    expect(
      hintsOf(
        [
          listShot("s1"),
          listShot("s2", { status: "deleted" }),
          listShot("s3", { siteRemoval: "hit_after_fault" }),
        ],
        "s1",
      ),
    ).toEqual(["net_hit_contradicts_height"]);
    // Deleted itself, it says nothing.
    expect(
      hintsOf([listShot("s1"), listShot("s2", { status: "deleted" })], "s2"),
    ).toEqual([]);
  });

  test("a hint code is listed once, point hints before the stroke's", () => {
    const list = pointRowMarkList(
      listPoint([listShot("s1")]),
      marksOf(
        [
          sample("serve_fault"),
          sample("ending_suspect_line"),
          sample("serve_fault"),
        ],
        { s1: [sample("net_hit_contradicts_height")] },
      ),
    );
    expect(codes(list.hints)).toEqual([
      "serve_fault",
      "ending_suspect_line",
      "net_hit_contradicts_height",
    ]);
  });
});
