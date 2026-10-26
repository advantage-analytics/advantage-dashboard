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
import {
  currentReviewItem,
  reviewItemTarget,
} from "@/lib/services/labels/review-target";
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

  test("answering the last ball settles the vendor-ball hints, not the row-read ones", () => {
    const vendorHints = [
      sample("ending_suspect_line"),
      sample("net_hit_contradicts_height"),
      sample("winner_to_error_by_bounce"),
      sample("result_type_unknown"),
    ];
    const statesOf = (p: LabelPoint) =>
      reviewFlag(p, marksOf({ [POINT]: vendorHints }), [p])?.items.find(
        (item) => item.id === 4,
      );
    // Untouched: every hint still asks.
    const untouched = statesOf(wonOnForehand());
    expect(untouched?.state).toBe("open");

    // The last ball's call edited: the four settle and the question closes.
    const edited = wonOnForehand({
      winner: "p2",
      ending: "error",
      endedBy: "p1",
      shots: [
        {
          ...forehand({ landingX: 2, landingY: 20 }),
          result: "out",
          status: "edited",
        },
      ],
    });
    const item = statesOf(edited);
    expect(
      item?.members
        .filter((m) => vendorHints.some((h) => h.code === m.mark.code))
        .map((m) => m.state),
    ).toEqual(["settled", "settled", "settled", "settled"]);

    // A dead-ball tail cut after the last ball answers it too.
    const tail = wonOnForehand({
      shots: [
        forehand({ landingX: 2, landingY: 20 }),
        labelShot("s2", POINT, {
          eventId: 8,
          hitter: "p2",
          stroke: "forehand",
          videoTime: 11,
          status: "deleted",
          deleteReason: "dead_ball_after_point",
        }),
      ],
    });
    expect(statesOf(tail)?.state).toBe("settled");

    // "No landing on the last shot" is read off the rows: an edit that leaves
    // the landing empty has not answered it.
    const unplaced = wonOnForehand({
      shots: [
        {
          ...forehand({ landingX: null, landingY: null }),
          result: "in",
          spin: "topspin",
          status: "edited",
        },
      ],
    });
    const open = statesOf(unplaced)?.members.filter((m) => m.state === "open");
    expect(open?.map((m) => m.mark.code)).toEqual(["last_landing_missing"]);
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

test.describe("currentReviewItem", () => {
  const item = (id: ReviewItemId, state: ReviewItem["state"]): ReviewItem => ({
    id,
    question: REVIEW_ITEM_QUESTION[id],
    tone: "score",
    state,
    members: [{ mark: sample("winner_disputed"), state }],
  });
  const flag = (demoted: boolean, ...items: ReviewItem[]): ReviewFlag => ({
    tone: "data",
    state: "open",
    items,
    demoted,
  });

  test("the first open item in id order; none open, or no flag, is none", () => {
    expect(
      currentReviewItem(
        flag(false, item(1, "settled"), item(3, "open"), item(4, "open")),
      )?.id,
    ).toBe(3);
    expect(currentReviewItem(flag(false, item(2, "checked-as-is")))).toBeNull();
    expect(currentReviewItem(null)).toBeNull();
    // A demoted flag is still asked on the open point.
    expect(currentReviewItem(flag(true, item(4, "open")))?.id).toBe(4);
  });

  test("answered, the next open item is current", () => {
    const before = flag(false, item(2, "open"), item(4, "open"));
    const after = flag(false, item(2, "settled"), item(4, "open"));
    expect(currentReviewItem(before)?.id).toBe(2);
    expect(currentReviewItem(after)?.id).toBe(4);
  });
});

test.describe("reviewItemTarget", () => {
  /**
   * A four-stroke rally, every contact and landing placed: p1's first serve
   * (a), then b, c, d. `d` is the last ball, seeded as it stands.
   */
  const stroke = (
    id: string,
    t: number,
    over: Partial<LabelShot> = {},
  ): LabelShot => {
    const shot = labelShot(id, POINT, {
      eventId: 100 + t,
      hitter: t % 2 === 1 ? "p1" : "p2",
      stroke: "forehand",
      result: "in",
      contactX: 1,
      contactY: 1,
      landingX: 2,
      landingY: 20,
      videoTime: t,
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
  const rally = (...over: [string, Partial<LabelShot>][]) =>
    point({
      shots: [
        stroke("a", 1, { stroke: "first_serve" }),
        stroke("b", 2),
        stroke("c", 3),
        stroke("d", 4),
      ].map((shot) => ({
        ...shot,
        ...Object.assign(
          {},
          ...over.filter(([id]) => id === shot.id).map(([, fields]) => fields),
        ),
      })),
    });
  /** An item of `id` whose members are `marks`, open unless a state is given. */
  const itemOf = (
    id: ReviewItemId,
    ...members: (LabelMark | [LabelMark, ReviewItem["state"]])[]
  ): ReviewItem => {
    const list = members.map((m) =>
      Array.isArray(m)
        ? { mark: m[0], state: m[1] }
        : { mark: m, state: "open" as const },
    );
    return {
      id,
      question: REVIEW_ITEM_QUESTION[id],
      tone: "score",
      state: "open",
      members: list,
    };
  };
  const target = (
    item: ReviewItem | null,
    p: LabelPoint = rally(),
    marks: LabelMarks = marksOf({}),
  ) => reviewItemTarget(item, p, marks, true);
  const at = (shotId: string | null, place: "contact" | "landing" | null) => ({
    shotId,
    place,
  });

  test("1: the stroke before the first open missing-shot slot, no end", () => {
    const slot = (afterShotId: string, n: number): LabelSuggestion => ({
      kind: "missing_shot",
      key: `missing_shot:${n}`,
      pointId: POINT,
      afterShotId,
      hitter: "p2",
      videoTime: null,
    });
    // The slot after b is done (a stroke was added there): c's is the open one.
    const p = rally();
    const done = {
      ...p,
      shots: [
        ...p.shots,
        labelShot("added", POINT, { status: "added", afterEventId: 102 }),
      ],
    };
    const marks = marksOf({}, {}, [slot("b", 102), slot("c", 103)]);
    expect(
      target(itemOf(1, sample("same_player_consecutive")), done, marks),
    ).toEqual(at("c", null));
    // No open slot: no stroke to select.
    expect(target(itemOf(1, sample("same_player_consecutive")))).toEqual(
      at(null, null),
    );
  });

  test("2: the point-ended and serve-after-serve strokes, a re-serve at the first; no end", () => {
    expect(
      target(
        itemOf(2, mark("shot_after_point_end", { shotId: "c", after: ["d"] })),
      ),
    ).toEqual(at("c", null));
    expect(
      target(itemOf(2, mark("serve_after_serve_in", { shotId: "d" }))),
    ).toEqual(at("d", null));
    expect(target(itemOf(2, sample("reserve_after_in")))).toEqual(
      at("a", null),
    );
  });

  test("3: each serve question at its serve, on the landing where a bounce settles it", () => {
    expect(
      target(
        itemOf(
          3,
          mark("serve_in_landing_out", { shotId: "a", landing: "out" }),
        ),
      ),
    ).toEqual(at("a", "landing"));
    expect(
      target(itemOf(3, mark("second_serve_as_first", { shotId: "b" }))),
    ).toEqual(at("b", null));
    expect(target(itemOf(3, sample("first_serve_fault_alone")))).toEqual(
      at("d", "landing"),
    );
    // The last second serve, not the last stroke.
    const seconds = rally(
      ["b", { stroke: "second_serve" }],
      ["c", { stroke: "second_serve" }],
    );
    expect(
      target(itemOf(3, sample("second_serve_called_out")), seconds),
    ).toEqual(at("c", "landing"));
    // No second serve to name: the next open member that names a stroke.
    expect(
      target(
        itemOf(
          3,
          sample("second_serve_called_out"),
          sample("first_serve_fault_alone"),
        ),
      ),
    ).toEqual(at("d", "landing"));
  });

  test("4: the called ball, the last ball, or the ball before the winner — on the landing", () => {
    // The vendor's call is on d; a phantom swing after it is the last stroke.
    const p = rally();
    const phantom = {
      ...p,
      shots: [...p.shots, stroke("e", 5, { result: null })],
    };
    const call = mark("last_call_overruled", {
      vendorCall: "out",
      eventId: 104,
    });
    expect(
      target(itemOf(4, call), phantom, marksOf({ [POINT]: [call] })),
    ).toEqual(at("d", "landing"));
    // No answer to write (the call is on another ball): the last stroke.
    const elsewhere = mark("last_call_overruled", {
      vendorCall: "out",
      eventId: 1,
    });
    expect(
      target(itemOf(4, elsewhere), phantom, marksOf({ [POINT]: [elsewhere] })),
    ).toEqual(at("e", "landing"));
    for (const code of [
      "last_landing_missing",
      "last_shot_unresolved",
      "net_hit_contradicts_height",
      "winner_disputed",
    ] as const) {
      expect(target(itemOf(4, sample(code))), code).toEqual(at("d", "landing"));
    }
    for (const code of [
      "ending_suspect_line",
      "winner_to_error_by_bounce",
    ] as const) {
      expect(target(itemOf(4, sample(code))), code).toEqual(at("c", "landing"));
    }
  });

  test("4: a stale or unreadable ending alone is the last stroke's landing; beside a ball, the ball", () => {
    // The end-of-point question is the last ball's bounce to settle, so the
    // court opens on that landing even when only the ending reads wrong.
    expect(target(itemOf(4, sample("ending_stale")))).toEqual(
      at("d", "landing"),
    );
    expect(target(itemOf(4, sample("result_type_unknown")))).toEqual(
      at("d", "landing"),
    );
    // Listed first, still taken after the line call beside it.
    expect(
      target(itemOf(4, sample("ending_stale"), sample("ending_suspect_line"))),
    ).toEqual(at("c", "landing"));
  });

  test("5 at the last stroke, 6 at the first; no end", () => {
    expect(target(itemOf(5, sample("pick_winner")))).toEqual(at("d", null));
    expect(target(itemOf(5, sample("winner_guessed")))).toEqual(at("d", null));
    for (const code of [
      "score_side_mismatch",
      "service_court_repeat",
      "tiebreak_score_off_six_all",
      "segment_proposal_differs",
    ] as const) {
      expect(target(itemOf(6, sample(code))), code).toEqual(at("a", null));
    }
  });

  test("a stroke with no contact opens on the contact first; an end of none stays none", () => {
    const noContact = rally(["d", { contactX: null, contactY: null }]);
    expect(target(itemOf(4, sample("winner_disputed")), noContact)).toEqual(
      at("d", "contact"),
    );
    expect(target(itemOf(5, sample("pick_winner")), noContact)).toEqual(
      at("d", null),
    );
    // A contact called unclear is not asked for.
    const unclear = rally([
      "d",
      { contactX: null, contactY: null, unclear: ["contact_x", "contact_y"] },
    ]);
    expect(target(itemOf(4, sample("winner_disputed")), unclear)).toEqual(
      at("d", "landing"),
    );
  });

  test("only open members, only live strokes; nothing to select is no target", () => {
    // The answered member is passed over for the open one.
    expect(
      target(
        itemOf(
          4,
          [sample("winner_disputed"), "settled"],
          sample("ending_suspect_line"),
        ),
      ),
    ).toEqual(at("c", "landing"));
    // A deleted last stroke: the one before it is last.
    const deleted = rally(["d", { status: "deleted" }]);
    expect(target(itemOf(5, sample("pick_winner")), deleted)).toEqual(
      at("c", null),
    );
    // A stroke named by a member that is no longer live.
    expect(
      target(itemOf(2, mark("serve_after_serve_in", { shotId: "d" })), deleted),
    ).toEqual(at(null, null));
    expect(target(itemOf(5, sample("pick_winner")), point())).toEqual(
      at(null, null),
    );
    expect(target(null)).toEqual(at(null, null));
  });
});
