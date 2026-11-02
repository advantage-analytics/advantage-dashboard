import { expect, test } from "@playwright/test";

import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import {
  dataFlagsLabel,
  HINT_ACTION_LABEL,
  staleEndingAction,
  hintLabel,
  MARK_LABEL,
  markHover,
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
  markTone,
  reviewChip,
  reviewFlag,
  stateHoverParts,
  type MarkListPoint,
  type MarkStatePoint,
  type MarkStateShot,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";
import { labelPoint } from "./fixtures/label-session";

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
  last_call_overruled: { vendorCall: "net", eventId: 7 },
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
  ending_contradicts_winner: {
    ending: "ace",
    endedBy: "p1",
    winner: "p2",
    server: "p1",
  },
  second_serve_as_first: { shotId: "s-2" },
  last_landing_missing: {},
  last_shot_unresolved: {},
  first_serve_fault_alone: {},
  serve_in_landing_out: { shotId: "s-1", landing: "out" },
  serve_after_serve_in: { shotId: "s-2" },
  placement_missing: { shotId: "s-1", stroke: "serve" },
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
      shot_after_point_end: "Did the point end here?",
      ending_stale: "Different ending?",
      ending_contradicts_winner: "Ending and winner disagree",
      second_serve_as_first: "Second serve?",
      last_landing_missing: "No landing on the last shot",
      last_shot_unresolved: "Ending can’t be read",
      first_serve_fault_alone: "Fault, no second serve",
      serve_in_landing_out: "Serve in, landing outside the box",
      serve_after_serve_in: "Serve after a serve in play",
      placement_missing: "No placement",
      pick_winner: "Pick the winner",
      last_call_overruled: "Was the last ball in?",
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
    expect(toCheckLabel(1)).toBe("1 point to review");
    expect(toCheckLabel(332)).toBe("332 points to review");
    expect(dataFlagsLabel(1)).toBe(
      "1 data point: wrong data that rarely moves the score",
    );
    expect(dataFlagsLabel(39)).toBe(
      "39 data points: wrong data that rarely moves the score",
    );
  });

  test("hover lines are the board's, with the players' names", () => {
    expect(markHover(sample("winner_disputed"), names)).toBe(
      "The score says Goodman won, but the vendor’s last shot says Ace did. The ending is wrong more often than the winner.",
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
      "The vendor’s tracking had the ball before this winner landing out. The point may be an error by Ace instead.",
    );
    expect(markHover(sample("service_court_repeat"), names)).toBe(
      "Served from the deuce side two points running. A point may be missing, or this one was replayed.",
    );
    expect(markHover(sample("score_side_mismatch"), names)).toBe(
      "At 0–15 the serve should come from the ad side. This one came from the deuce side.",
    );
    expect(markHover(sample("ending_stale"), names)).toBe(
      "The shots add up to an error by Goodman, not the ending this point has. Check the clip: change it, or leave it if the shots are what's wrong.",
    );
    expect(
      markHover(
        mark("ending_stale", { ending: "ace", endedBy: null, winner: null }),
        names,
      ),
    ).toBe(
      "The shots add up to an ace, not the ending this point has. Check the clip: change it, or leave it if the shots are what's wrong.",
    );
    expect(markHover(sample("second_serve_as_first"), names)).toBe(
      "Follows a faulted serve, so it is the second serve.",
    );
    expect(markHover(sample("shot_after_point_end"), names)).toBe(
      "This shot reads as out, yet one more stroke follows it. If the point ended here, answer yes to mark it out and remove that stroke, or split it into its own point. If the call is wrong, fix the landing or dismiss this.",
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
    expect(hintLabel(sample("ending_stale"))).toBe("Different ending?");
    // With the players' names it is the question itself.
    expect(hintLabel(sample("ending_stale"), names)).toMatch(/\?$/);
    expect(hintLabel(sample("shot_after_point_end"))).toBe(
      "Did the point end here? 1 shot follows",
    );
    expect(
      hintLabel(
        mark("shot_after_point_end", { shotId: "s-1", after: ["a", "b", "c"] }),
      ),
    ).toBe("Did the point end here? 3 shots follow");
    expect(staleEndingAction("ace")).toBe("Make it an ace");
    expect(staleEndingAction("double_fault")).toBe("Make it a double fault");
    expect(HINT_ACTION_LABEL).toEqual({
      second_serve_as_first: "Make it a second serve",
      shot_after_point_end: "Split here",
      serve_after_serve_in: "Split here",
    });
    expect(removeAfterLabel(1)).toBe("Yes, remove 1");
    expect(removeAfterLabel(3)).toBe("Yes, remove 3");
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
    expect(markState(missing, point({ status: "edited" }))).toBe("settled");
    // With them, an edit elsewhere on the point answers nothing about a gap
    // still open: the mark stays open until the point is checked, when the
    // general reading applies (`checked` for an edited point).
    expect(markState(missing, point({ status: "edited" }), slots)).toBe("open");
    expect(
      markState(
        missing,
        point({ status: "edited", checkedAt: CHECKED_AT }),
        slots,
      ),
    ).toBe("checked");
    // One slot answered while the other is open: still open — the second
    // gap is as unanswered as it was.
    expect(
      markState(
        missing,
        point({
          shots: [shot(), shot({ status: "added", afterEventId: 7 }), shot()],
        }),
        slots,
      ),
    ).toBe("open");
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
    expect(markStates([missing], p, slots)).toEqual(["open"]);
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
  /** A point with no strokes, so nothing is read live off its rows. */
  const row = (over: Partial<LabelPoint> = {}): LabelPoint =>
    labelPoint("point-1", 0, over);
  const chipOf = (pointMarks: LabelMark[], p: LabelPoint = row()) => {
    const flag = reviewFlag(
      p,
      {
        points: { [p.id]: pointMarks },
        shots: {},
        suggestions: [],
        serveSides: {},
      },
      [p],
    );
    if (!flag) return null;
    const chip = reviewChip(flag);
    if (!chip) return "demoted";
    const { open, ...drawn } = chip;
    return { ...drawn, open: open.map((item) => item.id) };
  };

  test("no marks, nothing to show", () => {
    expect(chipOf([])).toBeNull();
  });

  test("one open item is its question", () => {
    expect(chipOf([sample("winner_disputed")])).toEqual({
      text: "How did the last ball end?",
      count: 1,
      state: "open",
      tone: "score",
      open: [4],
    });
    // Item 4 is put as the vendor called the last ball.
    expect(chipOf([sample("last_call_overruled")])).toMatchObject({
      text: "Was the last ball in the net?",
    });
    // An item-6-only point reads the item, not its member's label.
    expect(chipOf([sample("tiebreak_score_off_six_all")])).toMatchObject({
      text: "Game & serve order",
      count: 1,
    });
  });

  test("several marks on one question are that question, counted once", () => {
    expect(
      chipOf([
        sample("winner_disputed"),
        sample("ending_suspect_line"),
        sample("result_type_unknown"),
      ]),
    ).toEqual({
      text: "How did the last ball end?",
      count: 1,
      state: "open",
      tone: "score",
      open: [4],
    });
  });

  test("two open items read as a count", () => {
    expect(chipOf([sample("winner_disputed"), sample("pick_winner")])).toEqual({
      text: "Review · 2",
      count: 2,
      state: "open",
      tone: "score",
      open: [4, 5],
    });
  });

  test("a settled flag loses its words", () => {
    const marks = [sample("winner_disputed")];
    expect(chipOf(marks, row({ status: "edited" }))).toMatchObject({
      text: null,
      count: 1,
      state: "settled",
      tone: "score",
    });
    expect(
      chipOf(marks, row({ status: "edited", checkedAt: CHECKED_AT })),
    ).toMatchObject({ text: null, state: "checked" });
    expect(chipOf(marks, row({ checkedAt: CHECKED_AT }))).toMatchObject({
      text: null,
      state: "checked-as-is",
    });
  });

  test("the chip is as open as its most open item", () => {
    // Item 6 dismissed, item 4 still open: the open one keeps its words.
    expect(
      chipOf(
        [sample("service_court_repeat"), sample("winner_disputed")],
        row({ dismissed: ["missing_point"] }),
      ),
    ).toEqual({
      text: "How did the last ball end?",
      count: 2,
      state: "open",
      tone: "score",
      open: [4],
    });
    // Dismissed outranks checked as is.
    expect(
      chipOf(
        [sample("service_court_repeat"), sample("winner_disputed")],
        row({ dismissed: ["missing_point"], checkedAt: CHECKED_AT }),
      ),
    ).toMatchObject({ text: null, count: 2, state: "dismissed" });
  });

  test("a demoted flag draws no chip; a grey one that is not stays grey", () => {
    expect(chipOf([sample("ending_suspect_line")])).toBe("demoted");
    expect(chipOf([sample("last_landing_missing")])).toMatchObject({
      text: "How did the last ball end?",
      state: "open",
      tone: "data",
    });
  });

  test("grey for the data, amber for the score: a missing shot is the score's only at the rally's end", () => {
    const missing = sample("same_player_consecutive");
    const shots = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => ({
      id,
      status: "kept",
    }));
    const slot = (afterShotId: string) => [
      {
        kind: "missing_shot" as const,
        key: "missing_shot:1" as const,
        pointId: "p",
        afterShotId,
        hitter: "p1" as const,
        videoTime: null,
      },
    ];
    const p = { id: "p", shots };
    // Mid-rally: three strokes or more after the gap.
    expect(markTone(missing, p, slot("s2"))).toBe("data");
    // Among the last three: who hit the last ball is in question.
    expect(markTone(missing, p, slot("s4"))).toBe("score");
    expect(markTone(missing, p, slot("s5"))).toBe("score");
    // Its place unknown: data. Every other counted mark: the score.
    expect(markTone(missing, p)).toBe("data");
    expect(markTone(sample("winner_disputed"), p)).toBe("score");
    // One open data item is a grey chip; beside an open score item, amber.
    expect(chipOf([missing])).toMatchObject({ tone: "data" });
    expect(chipOf([missing, sample("winner_disputed")])).toMatchObject({
      tone: "score",
    });
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
          sample("result_type_unknown"),
          sample("ending_suspect_line"),
          sample("result_type_unknown"),
        ],
        { s1: [sample("net_hit_contradicts_height")] },
      ),
    );
    expect(codes(list.hints)).toEqual([
      "result_type_unknown",
      "ending_suspect_line",
      "net_hit_contradicts_height",
    ]);
  });
});
