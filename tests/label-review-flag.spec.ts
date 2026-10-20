/**
 * The review flag (marks-state.ts `reviewFlag`): one flag per point, its
 * marks folded into six ordered items. Pure, so the fixtures are label rows
 * built by hand; no player names.
 */

import { expect, test } from "@playwright/test";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelMarks,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import { REVIEW_ITEM_QUESTION } from "@/lib/services/labels/marks-copy";
import {
  REVIEW_ITEMS,
  reviewFlag,
  type ReviewFlag,
  type ReviewItem,
  type ReviewItemId,
} from "@/lib/services/labels/marks-state";
import { reviewBlockRows } from "@/lib/services/labels/review-block";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  hintDismissKey,
  pointEndedKey,
} from "@/lib/services/labels/suggestions";
import { labelPoint, labelShot } from "./fixtures/label-session";

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, tier: meta.tier, scope: meta.scope, params } as LabelMark;
}

/** One mark of every code the flag can carry, with plain params. */
const SAMPLES: { [C in LabelMarkCode]: LabelMarkParams[C] } = {
  winner_disputed: { scoreWinner: "p2", lastStrokeWinner: "p1" },
  last_call_overruled: { vendorCall: "out", eventId: 7 },
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
  shot_after_point_end: { shotId: "s1", after: ["s2"] },
  ending_stale: { ending: "error", endedBy: "p2", winner: "p1" },
  second_serve_as_first: { shotId: "s1" },
  last_landing_missing: {},
  last_shot_unresolved: {},
  first_serve_fault_alone: {},
  serve_in_landing_out: { shotId: "s1", landing: "out" },
  serve_after_serve_in: { shotId: "s1" },
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

const sample = <C extends LabelMarkCode>(code: C) => mark(code, SAMPLES[code]);

const marksOf = (
  points: Record<string, LabelMark[]>,
  shots: Record<string, LabelMark[]> = {},
  suggestions: LabelSuggestion[] = [],
): LabelMarks => ({ points, shots, suggestions, serveSides: {} });

const POINT = "pt";

/** A point with no strokes: nothing is read live off its rows. */
const point = (over: Partial<LabelPoint> = {}): LabelPoint =>
  labelPoint(POINT, 0, over);

/** A kept forehand by p1, its seed what it holds. */
const forehand = (over: Partial<LabelShot> = {}): LabelShot => {
  const shot = labelShot("s1", POINT, {
    eventId: 7,
    hitter: "p1",
    stroke: "forehand",
    result: "in",
    videoTime: 10,
    ...over,
  });
  return {
    ...shot,
    seed: {
      hitter: shot.hitter,
      stroke: shot.stroke,
      result: shot.result,
      spin: shot.spin,
      contact_x: shot.contactX,
      contact_y: shot.contactY,
      landing_x: shot.landingX,
      landing_y: shot.landingY,
      video_time: shot.videoTime,
    },
  };
};

/** A point ending on p1's forehand in: a winner, the ending in step with it. */
const wonOnForehand = (over: Partial<LabelPoint> = {}): LabelPoint =>
  point({
    winner: "p1",
    ending: "winner",
    endedBy: "p1",
    shots: [forehand({ landingX: 2, landingY: 20 })],
    ...over,
  });

/** The flag of `own` marks on a bare point, or on `p` when given. */
const flagOf = (
  own: LabelMark[],
  p: LabelPoint = point(),
  marks: LabelMarks = marksOf({ [p.id]: own }),
): ReviewFlag | null => reviewFlag(p, marks, [p]);

const ids = (flag: ReviewFlag | null) => flag?.items.map((item) => item.id);
const codes = (flag: ReviewFlag | null, id: number) =>
  flag?.items
    .find((item) => item.id === id)
    ?.members.map((member) => member.mark.code);

const CHECKED_AT = "2026-10-15T12:00:00.000Z";

test.describe("the item table", () => {
  test("six items in id order, each with its question and its codes", () => {
    expect(REVIEW_ITEMS.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const item of REVIEW_ITEMS) {
      expect(item.question).toBe(REVIEW_ITEM_QUESTION[item.id]);
    }
    expect(REVIEW_ITEMS.map((item) => [...item.codes])).toEqual([
      ["same_player_consecutive"],
      ["shot_after_point_end", "serve_after_serve_in", "reserve_after_in"],
      [
        "second_serve_as_first",
        "first_serve_fault_alone",
        "second_serve_called_out",
        "serve_in_landing_out",
      ],
      [
        "last_call_overruled",
        "winner_disputed",
        "net_hit_contradicts_height",
        "ending_suspect_line",
        "winner_to_error_by_bounce",
        "ending_stale",
        "last_landing_missing",
        "last_shot_unresolved",
        "result_type_unknown",
      ],
      ["pick_winner", "winner_guessed"],
      [
        "score_side_mismatch",
        "service_court_repeat",
        "tiebreak_score_off_six_all",
        "segment_proposal_differs",
      ],
    ]);
  });

  test("every count and hint code belongs to exactly one item; no hidden one does", () => {
    const owners = (code: LabelMarkCode) =>
      REVIEW_ITEMS.filter((item) => item.codes.includes(code)).length;
    for (const [code, meta] of Object.entries(LABEL_MARK_META)) {
      expect(owners(code as LabelMarkCode), code).toBe(
        meta.tier === "hidden" ? 0 : 1,
      );
    }
  });
});

test.describe("the flag", () => {
  test("a deleted point, or one with nothing to ask, has none", () => {
    expect(flagOf([])).toBeNull();
    expect(
      flagOf([sample("winner_disputed")], point({ status: "deleted" })),
    ).toBeNull();
    // A hidden mark is never a member.
    expect(flagOf([sample("phantom_strokes_dropped")])).toBeNull();
  });

  test("items come in id order and only where a member raised them", () => {
    const flag = flagOf([
      sample("score_side_mismatch"),
      sample("winner_disputed"),
      sample("same_player_consecutive"),
    ]);
    expect(ids(flag)).toEqual([1, 4, 6]);
    expect(flag?.items.map((item) => item.question)).toEqual([
      "Missing shot?",
      "How did the last ball end?",
      "Game & serve order",
    ]);
  });

  test("count marks are gathered off the point and its live strokes, hints off the last one", () => {
    const p = wonOnForehand({
      shots: [
        forehand({ id: "s0", eventId: 6, videoTime: 5, status: "deleted" }),
        forehand({ landingX: 2, landingY: 20 }),
      ],
    });
    const flag = reviewFlag(
      p,
      marksOf(
        { [POINT]: [sample("pick_winner")] },
        {
          s0: [sample("winner_disputed")],
          s1: [sample("last_shot_unresolved"), sample("ending_suspect_line")],
        },
      ),
      [p],
    );
    expect(ids(flag)).toEqual([4, 5]);
    // The deleted stroke's mark is not read; the hint on the last one is.
    expect(codes(flag, 4)).toEqual([
      "last_shot_unresolved",
      "ending_suspect_line",
    ]);
  });

  test("a dismissed hint is not a member; a live row read is", () => {
    const dismissed = flagOf(
      [sample("ending_suspect_line"), sample("winner_to_error_by_bounce")],
      point({ dismissed: [hintDismissKey("ending_suspect_line")] }),
    );
    expect(codes(dismissed, 4)).toEqual(["winner_to_error_by_bounce"]);
    // The last stroke has no landing placed: read off the rows, not stored.
    const unplaced = wonOnForehand({ shots: [forehand()] });
    const flag = reviewFlag(unplaced, marksOf({}), [unplaced]);
    expect(codes(flag, 4)).toEqual(["last_landing_missing"]);
    expect(flag?.items[0].members[0].state).toBe("open");
  });

  test('"Net or out?" is dropped while "Was the last ball in?" has its answer', () => {
    const p = wonOnForehand();
    const netHit = { s1: [sample("net_hit_contradicts_height")] };
    expect(codes(reviewFlag(p, marksOf({}, netHit), [p]), 4)).toEqual([
      "net_hit_contradicts_height",
    ]);
    const answered = marksOf(
      { [POINT]: [sample("last_call_overruled")] },
      netHit,
    );
    expect(codes(reviewFlag(p, answered, [p]), 4)).toEqual([
      "last_call_overruled",
    ]);
  });

  test("each member keeps the key its Dismiss stores", () => {
    const flag = flagOf([
      sample("same_player_consecutive"),
      sample("shot_after_point_end"),
      sample("ending_suspect_line"),
      sample("service_court_repeat"),
    ]);
    const keys = Object.fromEntries(
      flag!.items.flatMap((item) =>
        item.members.map((member) => [member.mark.code, member.dismissKey]),
      ),
    );
    expect(keys).toEqual({
      same_player_consecutive: undefined,
      shot_after_point_end: pointEndedKey("s1"),
      ending_suspect_line: hintDismissKey("ending_suspect_line"),
      service_court_repeat: "missing_point",
    });
  });
});

test.describe("tone", () => {
  const tone = (flag: ReviewFlag | null, id: number) =>
    flag?.items.find((item) => item.id === id)?.tone;

  test("item 1 is markTone's call: grey mid-rally, amber near the end", () => {
    const shots = ["a", "b", "c", "d", "e"].map((id, i) =>
      labelShot(id, POINT, { videoTime: i }),
    );
    const p = wonOnForehand({ shots });
    const slot = (afterShotId: string): LabelSuggestion => ({
      kind: "missing_shot",
      key: "missing_shot:1",
      pointId: POINT,
      afterShotId,
      hitter: "p2",
      videoTime: null,
    });
    const own = { [POINT]: [sample("same_player_consecutive")] };
    expect(tone(reviewFlag(p, marksOf(own, {}, [slot("a")]), [p]), 1)).toBe(
      "data",
    );
    expect(tone(reviewFlag(p, marksOf(own, {}, [slot("c")]), [p]), 1)).toBe(
      "score",
    );
  });

  test("item 2 is amber only for a serve replayed after one in", () => {
    expect(tone(flagOf([sample("serve_after_serve_in")]), 2)).toBe("data");
    expect(tone(flagOf([sample("shot_after_point_end")]), 2)).toBe("data");
    expect(
      tone(
        flagOf([sample("serve_after_serve_in"), sample("reserve_after_in")]),
        2,
      ),
    ).toBe("score");
  });

  test("item 3 is amber only for a double fault in question or a fault alone", () => {
    expect(tone(flagOf([sample("second_serve_as_first")]), 3)).toBe("data");
    expect(tone(flagOf([sample("serve_in_landing_out")]), 3)).toBe("data");
    expect(tone(flagOf([sample("second_serve_called_out")]), 3)).toBe("score");
    expect(tone(flagOf([sample("first_serve_fault_alone")]), 3)).toBe("score");
  });

  test("item 4 is amber with a counted member or a contradicted winner, else grey", () => {
    expect(tone(flagOf([sample("ending_suspect_line")]), 4)).toBe("data");
    expect(
      tone(
        flagOf([sample("ending_suspect_line"), sample("winner_disputed")]),
        4,
      ),
    ).toBe("score");
    // The strokes say p1 lost the point on an error; the point says p1 won.
    const contradicted = point({
      winner: "p1",
      ending: "error",
      endedBy: "p1",
      shots: [forehand({ result: "out", landingX: 2, landingY: 30 })],
    });
    const flag = reviewFlag(contradicted, marksOf({}), [contradicted]);
    expect(codes(flag, 4)).toEqual(["ending_stale"]);
    expect(tone(flag, 4)).toBe("score");
  });

  test("items 5 and 6 are the score", () => {
    expect(tone(flagOf([sample("winner_guessed")]), 5)).toBe("score");
    expect(tone(flagOf([sample("pick_winner")]), 5)).toBe("score");
    expect(tone(flagOf([sample("segment_proposal_differs")]), 6)).toBe("score");
    expect(tone(flagOf([sample("tiebreak_score_off_six_all")]), 6)).toBe(
      "score",
    );
  });

  test("the flag is amber if any item is", () => {
    expect(flagOf([sample("same_player_consecutive")])?.tone).toBe("data");
    expect(
      flagOf([sample("same_player_consecutive"), sample("pick_winner")])?.tone,
    ).toBe("score");
  });

  test("a tone speaks for what is open: an answered amber question leaves a grey one grey", () => {
    // The winner settled by an edit; the grey serve hint is still open.
    const across = flagOf(
      [sample("pick_winner"), sample("serve_in_landing_out")],
      point({ status: "edited" }),
    );
    expect(across?.items.map((item) => [item.id, item.state])).toEqual([
      [3, "open"],
      [5, "settled"],
    ]);
    expect(across?.tone).toBe("data");

    // Inside item 4: "Check the ending" settled, "Close to the line" open —
    // grey, and one of the demoted signatures.
    const within = flagOf(
      [sample("winner_disputed"), sample("ending_suspect_line")],
      point({ status: "edited" }),
    );
    expect(tone(within, 4)).toBe("data");
    expect(within?.tone).toBe("data");
    expect(within?.demoted).toBe(true);

    // With nothing open, the tone is every item's again.
    const settled = flagOf(
      [sample("pick_winner")],
      point({ status: "edited" }),
    );
    expect(settled?.state).toBe("settled");
    expect(settled?.tone).toBe("score");
  });
});

test.describe("state", () => {
  test("an item is as open as its most open member, the flag as its most open item", () => {
    // "Same side twice" dismissed through its slot; the score mark still open.
    const dismissed = flagOf(
      [sample("service_court_repeat"), sample("score_side_mismatch")],
      point({ dismissed: ["missing_point"] }),
    );
    expect(dismissed?.items[0].members.map((member) => member.state)).toEqual([
      "dismissed",
      "open",
    ]);
    expect(dismissed?.items[0].state).toBe("open");

    // An edit settles the counted ending mark; the hint beside it, read live
    // off the rows, is still open, and so is the item.
    const edited = flagOf(
      [sample("winner_disputed"), sample("ending_suspect_line")],
      point({ status: "edited" }),
    );
    expect(edited?.items[0].members.map((member) => member.state)).toEqual([
      "settled",
      "open",
    ]);
    expect(edited?.items[0].state).toBe("open");

    // Across items: item 6 dismissed, item 4 open — the flag is open.
    const across = flagOf(
      [sample("service_court_repeat"), sample("ending_suspect_line")],
      point({ dismissed: ["missing_point"] }),
    );
    expect(across?.items.map((item) => [item.id, item.state])).toEqual([
      [4, "open"],
      [6, "dismissed"],
    ]);
    expect(across?.state).toBe("open");

    const settled = flagOf(
      [sample("winner_disputed")],
      point({ status: "edited" }),
    );
    expect(settled?.state).toBe("settled");
  });

  test("a checked point's flag is not open unless its winner is contradicted", () => {
    const checked = flagOf(
      [sample("winner_disputed"), sample("ending_suspect_line")],
      point({ checkedAt: CHECKED_AT }),
    );
    expect(checked?.items[0].members.map((member) => member.state)).toEqual([
      "checked-as-is",
      "checked-as-is",
    ]);
    expect(checked?.state).toBe("checked-as-is");

    const contradicted = point({
      checkedAt: CHECKED_AT,
      winner: "p1",
      ending: "error",
      endedBy: "p1",
      shots: [forehand({ result: "out", landingX: 2, landingY: 30 })],
    });
    const flag = reviewFlag(
      contradicted,
      marksOf({ [POINT]: [sample("ending_suspect_line")] }),
      [contradicted],
    );
    expect(
      flag?.items[0].members.map((member) => [member.mark.code, member.state]),
    ).toEqual([
      ["ending_suspect_line", "checked-as-is"],
      ["ending_stale", "open"],
    ]);
    expect(flag?.state).toBe("open");
    expect(flag?.tone).toBe("score");
  });
});

test.describe("demoted", () => {
  const hints = (...list: LabelMarkCode[]) =>
    flagOf(list.map((code) => sample(code)));

  test("a grey flag open on item 4 alone with one of three signatures", () => {
    for (const signature of [
      ["net_hit_contradicts_height"],
      ["ending_suspect_line"],
      ["ending_suspect_line", "winner_to_error_by_bounce"],
    ] as LabelMarkCode[][]) {
      const flag = hints(...signature);
      expect(flag?.tone, signature.join("+")).toBe("data");
      expect(flag?.state, signature.join("+")).toBe("open");
      expect(flag?.demoted, signature.join("+")).toBe(true);
    }
  });

  test("its neighbours are kept", () => {
    // "Winner or error?" alone is grey, and stays on the row.
    const alone = hints("winner_to_error_by_bounce");
    expect(alone?.tone).toBe("data");
    expect(alone?.demoted).toBe(false);

    // "Net or out?" with the last landing unplaced.
    const unplaced = wonOnForehand({ shots: [forehand()] });
    const withLanding = reviewFlag(
      unplaced,
      marksOf({}, { s1: [sample("net_hit_contradicts_height")] }),
      [unplaced],
    );
    expect(codes(withLanding, 4)).toEqual([
      "net_hit_contradicts_height",
      "last_landing_missing",
    ]);
    expect(withLanding?.tone).toBe("data");
    expect(withLanding?.demoted).toBe(false);

    // A "Then:" line under the question keeps it.
    expect(hints("ending_suspect_line", "ending_stale")?.demoted).toBe(false);

    // Any other item open keeps it, grey or not.
    const twoItems = hints(
      "net_hit_contradicts_height",
      "same_player_consecutive",
    );
    expect(twoItems?.tone).toBe("data");
    expect(twoItems?.demoted).toBe(false);

    // An amber flag is never demoted.
    expect(hints("ending_suspect_line", "winner_disputed")?.demoted).toBe(
      false,
    );
  });

  test("a signature whose item 4 is the only open item, the rest settled, still demotes", () => {
    // The edit settles "Missing shot?" (grey, with no slot near the end);
    // the hint under item 4 is read live off the rows and stays open.
    const flag = flagOf(
      [sample("same_player_consecutive"), sample("ending_suspect_line")],
      point({ status: "edited" }),
    );
    expect(flag?.items.map((item) => [item.id, item.state])).toEqual([
      [1, "settled"],
      [4, "open"],
    ]);
    expect(flag?.demoted).toBe(true);
  });
});

test.describe("reviewBlockRows", () => {
  /** An item in a state, with one member: what the block reads of it. */
  const item = (id: ReviewItemId, state: ReviewItem["state"]): ReviewItem => ({
    id,
    question: REVIEW_ITEM_QUESTION[id],
    tone: "score",
    state,
    members: [{ mark: sample("winner_disputed"), state }],
  });
  const flag = (...items: ReviewItem[]): ReviewFlag => ({
    tone: "score",
    state: "open",
    items,
    demoted: false,
  });
  const drawn = (rows: ReturnType<typeof reviewBlockRows>) =>
    rows.map((row) => [row.id, row.display, row.clearedBy]);

  test("unchanged: every item as it stands, open or not, in id order", () => {
    const before = [item(4, "open"), item(1, "open")];
    expect(
      drawn(reviewBlockRows(before, flag(item(1, "open"), item(4, "open")))),
    ).toEqual([
      [1, "open", null],
      [4, "open", null],
    ]);
    // Nothing held from the open: the flag alone.
    expect(
      drawn(reviewBlockRows(null, flag(item(2, "checked-as-is")))),
    ).toEqual([[2, "done", null]]);
    expect(reviewBlockRows(null, null)).toEqual([]);
  });

  test("answered: an item no longer open collapses to done", () => {
    const before = [item(1, "open"), item(4, "open")];
    const rows = reviewBlockRows(
      before,
      flag(item(1, "settled"), item(4, "open")),
    );
    expect(drawn(rows)).toEqual([
      [1, "done", null],
      [4, "open", null],
    ]);
    expect(rows[0].item.state).toBe("settled");
    expect(
      drawn(
        reviewBlockRows(before, flag(item(1, "dismissed"), item(4, "open"))),
      ),
    ).toEqual([
      [1, "done", null],
      [4, "open", null],
    ]);
  });

  test("cleared: an item gone since the open is put down to the lowest item that changed", () => {
    const before = [item(1, "open"), item(4, "open"), item(5, "open")];
    // Answering 1 took 4 and 5 away with it.
    const rows = reviewBlockRows(before, flag(item(1, "settled")));
    expect(drawn(rows)).toEqual([
      [1, "done", null],
      [4, "cleared", 1],
      [5, "cleared", 1],
    ]);
    // The cleared row keeps the item as it stood, for its question.
    expect(rows[1].item).toBe(before[1]);
    // The lowest of two that changed.
    expect(
      drawn(
        reviewBlockRows(
          [item(2, "open"), item(3, "open"), item(6, "open")],
          flag(item(2, "settled"), item(3, "settled")),
        ),
      ),
    ).toEqual([
      [2, "done", null],
      [3, "done", null],
      [6, "cleared", 2],
    ]);
    // An answer that took its own item away (a split): the lowest gone
    // before it, and none for the first.
    expect(
      drawn(reviewBlockRows([item(2, "open"), item(4, "open")], null)),
    ).toEqual([
      [2, "cleared", null],
      [4, "cleared", 2],
    ]);
  });
});
