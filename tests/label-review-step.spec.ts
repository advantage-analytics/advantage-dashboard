/**
 * The court panel's review column as data (review-step.ts `reviewStep`):
 * the point's first open item, its "n of m", the question and explanation
 * per kind, where the flag lands (stroke, end, add-shot slot), the answers
 * and the writes they carry, what follows, the replay window, the follow-up
 * ordering and the auto-advance (`nextReviewStop`). Pure, hand-built rows;
 * no player names.
 */

import { expect, test } from "@playwright/test";
import {
  deriveEnding,
  endingPatchTo,
} from "@/lib/services/labels/ending-derived";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelMarks,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import {
  CONTACT_EXPLANATION,
  LANDING_EXPLANATION,
  REVIEW_STEP_QUESTION,
  endingWriteFor,
  nextReviewStop,
  openReviewItems,
  reviewStep,
  type ReviewAnswer,
} from "@/lib/services/labels/review-step";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  deriveShotResult,
  landedOnOwnSide,
  shortOfNet,
} from "@/lib/services/labels/shot-derived";
import { labelPoint, labelShot } from "./fixtures/label-session";

const NAMES = { p1: "Alpha", p2: "Bravo" } as const;

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, tier: meta.tier, scope: meta.scope, params } as LabelMark;
}

const marksOf = (
  points: Record<string, LabelMark[]> = {},
  shots: Record<string, LabelMark[]> = {},
  suggestions: LabelSuggestion[] = [],
): LabelMarks => ({ points, shots, suggestions, serveSides: {} });

const POINT = "pt";

/** A kept stroke, seeded with what it holds. */
const stroke = (
  id: string,
  n: number,
  over: Partial<LabelShot> = {},
  pointId = POINT,
): LabelShot => {
  const odd = n % 2 === 1;
  const shot = labelShot(id, pointId, {
    eventId: 100 + n,
    // p1 serves from the near end, p2 answers from the far end.
    hitter: odd ? "p1" : "p2",
    stroke: n === 1 ? "first_serve" : "forehand",
    result: "in",
    contactX: 1,
    contactY: odd ? 1 : 22,
    // The serve crosses the centre line into the box; the rest land deep.
    landingX: n === 1 ? -2 : 2,
    landingY: n === 1 ? 17 : odd ? 20 : 3,
    videoTime: 10 + n,
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

/** A four-stroke rally won by p2 on a forehand in, the ending in step. */
const rally = (
  over: Partial<LabelPoint> = {},
  ...edits: [string, Partial<LabelShot>][]
): LabelPoint =>
  labelPoint(POINT, 0, {
    winner: "p2",
    ending: "winner",
    endedBy: "p2",
    shots: [stroke("a", 1), stroke("b", 2), stroke("c", 3), stroke("d", 4)].map(
      (shot) => ({
        ...shot,
        ...Object.assign(
          {},
          ...edits.filter(([id]) => id === shot.id).map(([, f]) => f),
        ),
      }),
    ),
    ...over,
  });

const step = (
  point: LabelPoint,
  marks: LabelMarks = marksOf(),
  points: readonly LabelPoint[] = [point],
) => reviewStep(point, marks, points, NAMES, true);

const labels = (answers: readonly ReviewAnswer[]) =>
  answers.map((answer) => answer.label);
const answer = (answers: readonly ReviewAnswer[], id: string) => {
  const found = answers.find((a) => a.id === id);
  if (!found) throw new Error(`no answer ${id}`);
  return found;
};

test.describe("n of m and the order", () => {
  test("null with nothing open; the first open item is 1 of m", () => {
    expect(step(rally())).toBeNull();
    // A serve question and the last bounce missing: two open items.
    const lone = labelPoint(POINT, 0, {
      winner: "p2",
      shots: [
        stroke("a", 1, { result: "out", landingX: null, landingY: null }),
      ],
    });
    const s = step(
      lone,
      marksOf({ [POINT]: [mark("first_serve_fault_alone", {})] }),
    );
    expect(s?.item.id).toBe(3);
    expect([s?.index, s?.total]).toEqual([1, 2]);
    expect(s?.then).toBe("Then: add the second serve");
  });

  test("the point-ended follow-up is asked after the ending, not before it", () => {
    // c reads out by its landing and d follows: "Did the point end here?"
    // (item 2) is open beside item 4.
    const p = rally({}, ["c", { landingY: 25 }]);
    const marks = marksOf({
      [POINT]: [
        mark("winner_disputed", { scoreWinner: "p2", lastStrokeWinner: "p1" }),
      ],
    });
    expect(openReviewItems(p, marks, [p]).map((item) => item.id)).toEqual([
      4, 2,
    ]);
    const s = step(p, marks);
    expect(s?.item.id).toBe(4);
    expect(s?.total).toBe(2);
    expect(s?.then).toBe("Then: split or remove the shots after");
    // Without item 4, the follow-up stands where it is.
    const alone = rally({}, ["c", { landingY: 25 }]);
    expect(openReviewItems(alone, marksOf(), [alone]).map((i) => i.id)).toEqual(
      [2],
    );
  });
});

test.describe("the console's queue (keep)", () => {
  test("an item an edit settled is asked again while the queue keeps it", () => {
    // An edit anywhere on the point settles its counted marks.
    const p = rally({ status: "edited" });
    const marks = marksOf({
      [POINT]: [
        mark("winner_disputed", { scoreWinner: "p2", lastStrokeWinner: "p1" }),
        mark("winner_guessed", {}),
      ],
    });
    expect(openReviewItems(p, marks, [p])).toEqual([]);
    const kept = openReviewItems(p, marks, [p], [4, 5]);
    expect(kept.map((item) => [item.id, item.state])).toEqual([
      [4, "open"],
      [5, "open"],
    ]);
    // Answered (out of the queue): no longer asked.
    expect(openReviewItems(p, marks, [p], [5]).map((i) => i.id)).toEqual([5]);
  });

  test("a dismissed item stays gone whatever the queue says", () => {
    const p = rally({ status: "edited", dismissed: ["hint:winner_guessed"] });
    const marks = marksOf({ [POINT]: [mark("winner_guessed", {})] });
    expect(openReviewItems(p, marks, [p], [5])).toEqual([]);
  });
});

test.describe("question and explanation per kind", () => {
  test("a missing contact asks where it was hit", () => {
    const p = rally({}, ["d", { contactX: null, contactY: null }]);
    const s = step(
      p,
      marksOf({
        [POINT]: [
          mark("winner_disputed", {
            scoreWinner: "p2",
            lastStrokeWinner: "p1",
          }),
        ],
      }),
    );
    expect(s?.question).toBe(REVIEW_STEP_QUESTION.contact);
    expect(s?.explanation).toBe(CONTACT_EXPLANATION);
    expect(s?.target).toEqual({ shotId: "d", place: "contact", slot: null });
  });

  test("a missing landing asks where it landed", () => {
    const p = rally({}, ["d", { landingX: null, landingY: null }]);
    const s = step(p);
    expect(s?.item.id).toBe(4);
    expect(s?.question).toBe(REVIEW_STEP_QUESTION.landing);
    expect(s?.explanation).toBe(LANDING_EXPLANATION);
    expect(s?.target).toEqual({ shotId: "d", place: "landing", slot: null });
  });

  test("a lone first serve asks how the serve ended, and names who lost it", () => {
    const serve = stroke("a", 1, { result: "out" });
    const marks = marksOf({ [POINT]: [mark("first_serve_fault_alone", {})] });
    const lost = step(
      labelPoint(POINT, 0, { winner: "p2", shots: [serve] }),
      marks,
    );
    expect(lost?.question).toBe(REVIEW_STEP_QUESTION.serve);
    expect(lost?.explanation).toBe(
      "A lone first serve ended the point and Alpha lost it. Click where it bounced, or say what happened.",
    );
    const open = step(labelPoint(POINT, 0, { shots: [serve] }), marks);
    expect(open?.explanation).toBe(
      "A lone first serve ended the point. Click where it bounced, or say what happened.",
    );
  });

  test("an end-of-point item asks how the last ball ended, by the hitter's side", () => {
    const s = step(
      rally(),
      marksOf({
        [POINT]: [
          mark("winner_disputed", {
            scoreWinner: "p2",
            lastStrokeWinner: "p1",
          }),
        ],
      }),
    );
    expect(s?.question).toBe(REVIEW_STEP_QUESTION.lastBall);
    expect(s?.explanation).toBe(
      "Click where it bounced. A bounce on Bravo’s own side means it never cleared the net.",
    );
  });

  test("any other item keeps its own question and its first member's hover", () => {
    const s = step(rally(), marksOf({ [POINT]: [mark("pick_winner", {})] }));
    expect(s?.question).toBe("Who won?");
    expect(s?.explanation).toBe(
      "The score, the last shot and the next serve don’t agree on who won. Watch the clip and choose.",
    );
  });
});

test.describe("targets", () => {
  test("a missing shot targets its open slot, and Dismiss stores the slot's key", () => {
    const slot: LabelSuggestion = {
      kind: "missing_shot",
      key: "missing_shot:102",
      pointId: POINT,
      afterShotId: "b",
      hitter: "p1",
      videoTime: null,
    };
    const s = step(
      rally(),
      marksOf(
        { [POINT]: [mark("same_player_consecutive", { hitter: "p2" })] },
        {},
        [slot],
      ),
    );
    expect(s?.item.id).toBe(1);
    expect(s?.target).toEqual({
      shotId: "b",
      place: null,
      slot: { afterShotId: "b", hitter: "p1", kind: null },
    });
    expect(labels(s!.answers)).toEqual([
      "Add the shot",
      "Dismiss",
      "Looks right",
    ]);
    expect(answer(s!.answers, "add-shot").writes).toEqual([
      {
        write: "addShot",
        slot: { afterShotId: "b", hitter: "p1", kind: null },
      },
    ]);
    expect(answer(s!.answers, "dismiss").writes).toEqual([
      { write: "dismiss", keys: ["missing_shot:102"] },
    ]);
    expect(answer(s!.answers, "looks-right").writes).toEqual([
      { write: "check" },
    ]);
  });

  test("a lone first serve targets its landing and the second serve's slot", () => {
    const p = labelPoint(POINT, 0, {
      winner: "p2",
      shots: [stroke("a", 1, { result: "out", landingY: 25 })],
    });
    const s = step(
      p,
      marksOf({ [POINT]: [mark("first_serve_fault_alone", {})] }),
    );
    expect(s?.target).toEqual({
      shotId: "a",
      place: "landing",
      slot: { afterShotId: "a", hitter: "p1", kind: "second_serve" },
    });
    expect(labels(s!.answers)).toEqual([
      "Out",
      "Net",
      "In",
      "Add the second serve",
      "Dismiss",
      "Looks right",
    ]);
    // In makes it an ace, won by the server: the serve's result and the
    // ending the strokes then derive. Out settles nothing beyond the serve.
    expect(answer(s!.answers, "in").writes).toEqual([
      { write: "shot", shotId: "a", patch: { result: "in" } },
      {
        write: "point",
        patch: { ending: "ace", ended_by: "p1", winner: "p1" },
      },
    ]);
    expect(answer(s!.answers, "out").writes).toEqual([
      { write: "shot", shotId: "a", patch: { result: "out" } },
    ]);
    expect(answer(s!.answers, "add-second-serve").writes).toEqual([
      {
        write: "addShot",
        slot: { afterShotId: "a", hitter: "p1", kind: "second_serve" },
      },
    ]);
  });

  test("a serve typed first after a fault is retyped", () => {
    const p = rally(
      { winner: "p2", ending: "winner", endedBy: "p2" },
      ["a", { result: "out", landingY: 25 }],
      ["b", { hitter: "p1", stroke: "first_serve", contactY: 1, landingY: 18 }],
      ["c", { hitter: "p2", contactY: 22, landingY: 3 }],
      ["d", { hitter: "p1", contactY: 1, landingY: 20 }],
    );
    const s = step(p);
    expect(s?.item.id).toBe(3);
    expect(answer(s!.answers, "second-serve").writes).toEqual([
      { write: "shot", shotId: "b", patch: { stroke: "second_serve" } },
    ]);
  });
});

test.describe("end-of-point answers", () => {
  const disputed = () =>
    marksOf({
      [POINT]: [
        mark("winner_disputed", { scoreWinner: "p2", lastStrokeWinner: "p1" }),
      ],
    });

  test("named by the last ball's hitter, each writing the result and the derived ending", () => {
    const p = rally();
    const s = step(p, disputed());
    expect(labels(s!.answers)).toEqual([
      "Winner by Bravo",
      "Out by Bravo",
      "Net by Bravo",
      "Dismiss",
      "Looks right",
    ]);
    for (const result of ["in", "out", "net"] as const) {
      const a = answer(s!.answers, result);
      const after = {
        ...p,
        shots: p.shots.map((shot) =>
          shot.id === "d" ? { ...shot, result } : shot,
        ),
      };
      const expected = endingPatchTo(p, deriveEnding(after, true)!);
      expect(a.writes[0]).toEqual({
        write: "shot",
        shotId: "d",
        patch: { result },
      });
      expect(a.writes[1]).toEqual(
        expected ? { write: "point", patch: expected } : undefined,
      );
    }
    // In is what the point holds: nothing moves. Out and net are an error
    // by the hitter, won by the other side.
    expect(answer(s!.answers, "in").writes).toHaveLength(1);
    expect(answer(s!.answers, "out").writes[1]).toEqual({
      write: "point",
      patch: { ending: "error", ended_by: "p2", winner: "p1" },
    });
    expect(endingWriteFor(p, "d", "net", true)).toEqual({
      ending: "error",
      ended_by: "p2",
      winner: "p1",
    });
  });

  test("the vendor's call is the suggested answer; without one, the ball's own reading", () => {
    const p = rally();
    const call = step(
      p,
      marksOf({
        [POINT]: [
          mark("last_call_overruled", { vendorCall: "out", eventId: 104 }),
        ],
      }),
    );
    expect(call?.answers.map((a) => [a.id, a.kind])).toEqual([
      ["in", "plain"],
      ["out", "suggested"],
      ["net", "plain"],
      ["dismiss", "dismiss"],
      ["looks-right", "plain"],
    ]);
    expect(answer(call!.answers, "dismiss").writes).toEqual([
      { write: "dismiss", keys: ["hint:last_call_overruled"] },
    ]);
    // d lands long: out by its landing.
    const long = step(rally({}, ["d", { landingY: -1 }]), disputed());
    expect(answer(long!.answers, "out").kind).toBe("suggested");
    expect(answer(long!.answers, "in").kind).toBe("plain");
  });

  test("a ball that came down on the hitter's own side offers Didn’t clear, suggested", () => {
    // d is hit from the far end (y = 22) and comes down there (y = 15).
    const p = rally({}, ["d", { landingY: 15 }]);
    const s = step(p, disputed());
    expect(s?.explanation).toBe(
      "Click where it bounced. A bounce on Bravo’s own side means it never cleared the net.",
    );
    expect(labels(s!.answers)).toEqual([
      "Winner by Bravo",
      "Out by Bravo",
      "Net by Bravo",
      "Didn’t clear by Bravo",
      "Dismiss",
      "Looks right",
    ]);
    const short = answer(s!.answers, "short");
    expect(short.kind).toBe("suggested");
    expect(answer(s!.answers, "net").kind).toBe("plain");
    expect(short.detail).toBe(
      "Bounced on Bravo’s side, 3.1 m short of the net",
    );
    expect(short.writes).toEqual([
      { write: "shot", shotId: "d", patch: { result: "net" } },
      {
        write: "point",
        patch: { ending: "error", ended_by: "p2", winner: "p1" },
      },
    ]);
  });

  test("the replay runs from about three strokes before the last through the last", () => {
    expect(step(rally(), disputed())?.replay).toEqual({
      fromShotId: "a",
      toShotId: "d",
    });
    const five = rally();
    five.shots.push(stroke("e", 5));
    expect(step(five, disputed())?.replay).toEqual({
      fromShotId: "b",
      toShotId: "e",
    });
    // Not an ending question: no replay.
    expect(
      step(rally(), marksOf({ [POINT]: [mark("pick_winner", {})] }))?.replay,
    ).toBeNull();
  });

  test("item 5 offers the other winner as a point patch", () => {
    const s = step(rally(), marksOf({ [POINT]: [mark("pick_winner", {})] }));
    expect(labels(s!.answers)).toEqual([
      "Won by Alpha",
      "Dismiss",
      "Looks right",
    ]);
    expect(answer(s!.answers, "won-p1").writes).toEqual([
      { write: "point", patch: { winner: "p1" } },
    ]);
  });
});

test.describe("the follow-up", () => {
  test("Split here and Remove the N shots after, as the hint writes them", () => {
    // c reads out by its landing but is stored in: Remove marks it out, and
    // the stroke after goes with that write.
    const storedIn = rally({}, ["c", { landingY: 25 }]);
    const s = step(storedIn);
    expect(s?.item.id).toBe(2);
    expect(labels(s!.answers)).toEqual([
      "Split here",
      "Remove the 1 shot after",
      "Dismiss",
      "Looks right",
    ]);
    expect(answer(s!.answers, "split").writes).toEqual([
      { write: "dismiss", keys: ["point_ended:c"] },
      { write: "split", shotId: "d" },
    ]);
    expect(answer(s!.answers, "remove-after").writes).toEqual([
      { write: "shot", shotId: "c", patch: { result: "out" } },
    ]);
    // Stored out already: only the strokes after are left to go.
    const storedOut = rally({}, ["c", { landingY: 25, result: "out" }]);
    expect(answer(step(storedOut)!.answers, "remove-after").writes).toEqual([
      { write: "removeAfter", shotId: "c" },
    ]);
    expect(answer(step(storedOut)!.answers, "dismiss").writes).toEqual([
      { write: "dismiss", keys: ["point_ended:c"] },
    ]);
  });
});

test.describe("nextReviewStop", () => {
  const flagged = (id: string, index: number) =>
    labelPoint(id, index, {
      winner: "p2",
      ending: "winner",
      endedBy: "p2",
      shots: [1, 2].map((n) => stroke(`${id}-${n}`, n, {}, id)),
    });
  const quiet = (id: string, index: number) =>
    labelPoint(id, index, {
      winner: "p2",
      ending: "winner",
      endedBy: "p2",
      shots: [1, 2].map((n) => stroke(`${id}-${n}`, n, {}, id)),
    });
  const points = [flagged("p1", 0), quiet("p2", 1), flagged("p3", 2)];
  const marks = marksOf({
    p1: [mark("pick_winner", {})],
    p3: [
      mark("winner_disputed", { scoreWinner: "p2", lastStrokeWinner: "p1" }),
    ],
  });

  test("stays on a point with an open item, else steps to the next flagged point", () => {
    expect(nextReviewStop(points, marks, "p1", 1)).toMatchObject({
      pointId: "p1",
      item: { id: 5 },
    });
    expect(nextReviewStop(points, marks, "p2", 1)).toMatchObject({
      pointId: "p3",
      item: { id: 4 },
    });
    expect(nextReviewStop(points, marks, "p2", -1)).toMatchObject({
      pointId: "p1",
    });
    // Wraps round the match; from no point, forward starts at the top.
    const checked = points.map((p) =>
      p.id === "p3" ? { ...p, checkedAt: "2026-10-16T00:00:00Z" } : p,
    );
    expect(nextReviewStop(checked, marks, "p3", 1)).toMatchObject({
      pointId: "p1",
    });
    expect(nextReviewStop(points, marks, null, 1)).toMatchObject({
      pointId: "p1",
    });
    expect(nextReviewStop(points, marksOf(), "p2", 1)).toBeNull();
  });
});

test.describe("the shank reading", () => {
  test("a landing on the hitter's side is allowed and reads net, as deriveShotResult has it", () => {
    const far = { contactX: 1, contactY: 22, landingX: 2, landingY: 15 };
    expect(landedOnOwnSide(far)).toBe(true);
    expect(shortOfNet(far)).toBeCloseTo(3.12, 2);
    expect(
      deriveShotResult({
        stroke: "forehand",
        contact_x: 1,
        contact_y: 22,
        landing_x: 2,
        landing_y: 15,
      }),
    ).toBe("net");
    // On the net line, and from the near end.
    expect(landedOnOwnSide({ ...far, landingY: 11.885 })).toBe(true);
    expect(
      landedOnOwnSide({ contactX: 0, contactY: 1, landingX: 0, landingY: 5 }),
    ).toBe(true);
    // Across the net: not a shank, and no distance to say.
    expect(landedOnOwnSide({ ...far, landingY: 3 })).toBe(false);
    expect(shortOfNet({ ...far, landingY: 3 })).toBeNull();
    // An end missing: nothing to read.
    expect(landedOnOwnSide({ ...far, contactY: null })).toBe(false);
    expect(landedOnOwnSide({})).toBe(false);
  });
});
