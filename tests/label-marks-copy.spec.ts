import { expect, test } from "@playwright/test";

import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import {
  fixLabel,
  MARK_LABEL,
  markHover,
} from "@/lib/services/labels/marks-copy";
import {
  markState,
  markStates,
  pointChanged,
  rollupMarks,
  stateHover,
  type MarkStatePoint,
  type MarkStateShot,
} from "@/lib/services/labels/marks-state";

/**
 * The words of a mark (board 08m, word for word), the life a flag leads —
 * open, settled, checked, checked as is, dismissed — and what the point row
 * rolls its marks up to.
 */

const names = { p1: "Ace", p2: "Goodman" };

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, kind: meta.kind, scope: meta.scope, params } as LabelMark;
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
  pick_winner: {},
  net_hit_contradicts_height: {},
  phantom_strokes_dropped: { eventIds: [41], hitter: "p2" },
  winner_guessed: {},
  score_frozen: {},
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
      pick_winner: "Pick the winner",
      phantom_strokes_dropped: "1 shot removed",
      out_ball_rally_continued: "Out call ignored",
      winner_guessed: "Winner guessed",
      score_frozen: "Score not read",
      geometry_discarded: "No position",
    });
  });

  test("fixLabel counts the shots a fix removed", () => {
    expect(fixLabel(sample("phantom_strokes_dropped"))).toBe("1 shot removed");
    expect(
      fixLabel(
        mark("phantom_strokes_dropped", {
          eventIds: [41, 42, 43],
          hitter: "p2",
        }),
      ),
    ).toBe("3 shots removed");
    expect(fixLabel(sample("winner_guessed"))).toBe("Winner guessed");
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
  });

  test("the names follow the sides, not the sample", () => {
    const other = { p1: "Quan", p2: "Harazaki" };
    expect(markHover(sample("winner_disputed"), other)).toBe(
      "The score says Harazaki won, but the last shot says Quan did. The ending is wrong more often than the winner.",
    );
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

  test("unchecking a point reopens a flag that was not settled", () => {
    expect(markState(flag, point({ checkedAt: CHECKED_AT }))).toBe(
      "checked-as-is",
    );
    expect(markState(flag, point({ checkedAt: null }))).toBe("open");
    // A settled one stays settled.
    expect(markState(flag, point({ status: "edited", checkedAt: null }))).toBe(
      "settled",
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

  test("a shot mark settles when its own shot is edited, deleted or restored", () => {
    const shotFlag = sample("net_hit_contradicts_height");
    const bare = point({ shots: [] });
    expect(markState(shotFlag, bare, shot())).toBe("open");
    expect(markState(shotFlag, bare, shot({ status: "edited" }))).toBe(
      "settled",
    );
    expect(markState(shotFlag, bare, shot({ status: "deleted" }))).toBe(
      "settled",
    );
    expect(
      markState(shotFlag, bare, shot({ siteRemovalRestoredAt: CHECKED_AT })),
    ).toBe("settled");
  });

  test("dismissed follows the suggestion key tied to the flag", () => {
    const missingShot = sample("same_player_consecutive");
    const sameSide = sample("service_court_repeat");

    expect(markState(missingShot, point())).toBe("open");
    expect(
      markState(missingShot, point({ dismissed: ["missing_shot:812"] })),
    ).toBe("dismissed");
    expect(
      markState(sameSide, point({ dismissed: ["missing_shot:812"] })),
    ).toBe("open");
    expect(markState(sameSide, point({ dismissed: ["missing_point"] }))).toBe(
      "dismissed",
    );
    // Another flag on the same point is untouched by the dismissal.
    expect(markState(flag, point({ dismissed: ["missing_point"] }))).toBe(
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

  test("with two missing-shot suggestions the flag waits for both", () => {
    const missingShot = sample("same_player_consecutive");
    const suggestion = (eventId: number): LabelSuggestion => ({
      kind: "missing_shot",
      key: `missing_shot:${eventId}`,
      pointId: "point-1",
      afterShotId: `shot-${eventId}`,
      hitter: "p2",
      videoTime: null,
    });
    const suggestions = [suggestion(812), suggestion(815)];
    expect(
      markState(
        missingShot,
        point({ dismissed: ["missing_shot:812"] }),
        undefined,
        suggestions,
      ),
    ).toBe("open");
    expect(
      markState(
        missingShot,
        point({ dismissed: ["missing_shot:812", "missing_shot:815"] }),
        undefined,
        suggestions,
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
    expect(markState(sameSide, point(), undefined, [suggestion])).toBe("open");
    expect(
      markState(sameSide, point(), undefined, [suggestion], rows(null)),
    ).toBe("open");
    expect(
      markState(sameSide, point(), undefined, [suggestion], rows("added")),
    ).toBe("settled");
    expect(
      markState(
        sameSide,
        point({ checkedAt: CHECKED_AT }),
        undefined,
        [suggestion],
        rows("added"),
      ),
    ).toBe("checked");
    // Deleting the added point opens the question again; a vendor point
    // between the two was always there and answers nothing.
    expect(
      markState(sameSide, point(), undefined, [suggestion], rows("deleted")),
    ).toBe("open");
    expect(
      markState(sameSide, point(), undefined, [suggestion], rows("unchanged")),
    ).toBe("open");
    // Answered outranks dismissed, and another flag on the point is untouched.
    expect(
      markState(
        sameSide,
        point({ dismissed: ["missing_point"] }),
        undefined,
        [suggestion],
        rows("added"),
      ),
    ).toBe("settled");
    expect(
      markState(flag, point(), undefined, [suggestion], rows("added")),
    ).toBe("open");
    expect(
      markStates([sameSide, flag], [], point(), [suggestion], rows("added"))
        .point,
    ).toEqual(["settled", "open"]);
  });

  test("a fix is never open: settled by nature, checked once checked", () => {
    const fix = sample("phantom_strokes_dropped");
    expect(markState(fix, point())).toBe("settled");
    expect(markState(fix, point({ checkedAt: CHECKED_AT }))).toBe("checked");
    expect(
      markState(fix, point({ status: "edited", checkedAt: CHECKED_AT })),
    ).toBe("checked");
  });

  test("the state hovers are the board's", () => {
    expect(stateHover(flag, "open", names, SENTENCE)).toBe(
      markHover(flag, names),
    );
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

  test("a fix's hover still says what the site did", () => {
    const fix = sample("phantom_strokes_dropped");
    for (const state of ["settled", "checked"] as const) {
      expect(stateHover(fix, state, names, SENTENCE)).toBe(
        markHover(fix, names),
      );
    }
  });
});

test.describe("the row roll-up", () => {
  const rollup = (
    pointMarks: LabelMark[],
    shotMarks: LabelMark[],
    p: MarkStatePoint,
  ) => rollupMarks(pointMarks, shotMarks, markStates(pointMarks, shotMarks, p));

  test("no marks, nothing to show", () => {
    expect(rollup([], [], point())).toEqual({
      flag: null,
      fix: null,
      pencil: false,
    });
  });

  test("one flag keeps its words", () => {
    expect(rollup([sample("winner_disputed")], [], point())).toEqual({
      flag: { text: "Check the ending", count: 1, state: "open" },
      fix: null,
      pencil: false,
    });
  });

  test("one fix keeps its words", () => {
    expect(rollup([sample("phantom_strokes_dropped")], [], point())).toEqual({
      flag: null,
      fix: { text: "1 shot removed", count: 1, state: "settled" },
      pencil: false,
    });
  });

  test("two flags read as a count", () => {
    expect(
      rollup(
        [sample("winner_disputed"), sample("ending_suspect_line")],
        [],
        point(),
      ),
    ).toEqual({
      flag: { text: "2 to check", count: 2, state: "open" },
      fix: null,
      pencil: false,
    });
  });

  test("a flag plus a fix: the flag's words, an icon-only fix", () => {
    expect(
      rollup(
        [sample("second_serve_called_out"), sample("winner_guessed")],
        [],
        point(),
      ),
    ).toEqual({
      flag: { text: "Double fault?", count: 1, state: "open" },
      fix: { text: null, count: 1, state: "settled" },
      pencil: false,
    });
  });

  test("three flags with a shot flag among them, and two fixes", () => {
    expect(
      rollup(
        [
          sample("winner_disputed"),
          sample("same_player_consecutive"),
          sample("score_frozen"),
        ],
        [
          sample("net_hit_contradicts_height"),
          sample("out_ball_rally_continued"),
        ],
        point(),
      ),
    ).toEqual({
      flag: { text: "3 to check", count: 3, state: "open" },
      fix: { text: null, count: 2, state: "settled" },
      pencil: false,
    });
  });

  test("two fixes alone fold to a bare count", () => {
    expect(
      rollup([sample("winner_guessed"), sample("score_frozen")], [], point()),
    ).toEqual({
      flag: null,
      fix: { text: null, count: 2, state: "settled" },
      pencil: false,
    });
  });

  test("a settled flag loses its words and the pencil appears", () => {
    const marks = [sample("winner_disputed")];
    expect(rollup(marks, [], point({ status: "edited" }))).toEqual({
      flag: { text: null, count: 1, state: "settled" },
      fix: null,
      pencil: true,
    });
    expect(
      rollup(marks, [], point({ status: "edited", checkedAt: CHECKED_AT })),
    ).toEqual({
      flag: { text: null, count: 1, state: "checked" },
      fix: null,
      pencil: true,
    });
    expect(rollup(marks, [], point({ checkedAt: CHECKED_AT }))).toEqual({
      flag: { text: null, count: 1, state: "checked-as-is" },
      fix: null,
      pencil: false,
    });
  });

  test("a fix on a checked point goes quiet", () => {
    expect(
      rollup(
        [sample("phantom_strokes_dropped")],
        [],
        point({ checkedAt: CHECKED_AT }),
      ),
    ).toEqual({
      flag: null,
      fix: { text: null, count: 1, state: "checked" },
      pencil: false,
    });
  });

  test("the chip is as open as its most open member", () => {
    // One dismissed, one still open: the open one keeps its words.
    expect(
      rollup(
        [sample("service_court_repeat"), sample("winner_disputed")],
        [],
        point({ dismissed: ["missing_point"] }),
      ),
    ).toEqual({
      flag: { text: "Check the ending", count: 2, state: "open" },
      fix: null,
      pencil: false,
    });
    // Dismissed outranks checked as is.
    expect(
      rollup(
        [sample("service_court_repeat"), sample("winner_disputed")],
        [],
        point({ dismissed: ["missing_point"], checkedAt: CHECKED_AT }),
      ).flag,
    ).toEqual({ text: null, count: 2, state: "dismissed" });
  });

  test("the pencil follows any change to the point or its shots", () => {
    const marks = [sample("winner_disputed")];
    expect(rollup(marks, [], point({ status: "added" })).pencil).toBe(true);
    for (const status of ["edited", "added", "deleted"] as const) {
      expect(
        rollup(marks, [], point({ shots: [shot({ status })] })).pencil,
      ).toBe(true);
    }
    expect(
      rollup(
        marks,
        [],
        point({ shots: [shot({ siteRemovalRestoredAt: CHECKED_AT })] }),
      ).pencil,
    ).toBe(true);
    expect(rollup([], [], point({ status: "edited" })).pencil).toBe(true);
  });
});
