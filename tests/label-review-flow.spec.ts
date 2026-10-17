/**
 * The flag flow's pure parts (review-flow.ts) and the replay runner
 * (review-replay.ts): the replay window's maths, a replay that pauses at
 * its stop and lets go on the labeller's own seek, what identifies a step,
 * and the auto-advance decision — within the point, then `]` to the next
 * flagged point, never from a refresh. Hand-built rows; no player names.
 */

import { expect, test } from "@playwright/test";
import { runReplay } from "@/components/admin/labels/review-replay";
import { createVideoClock } from "@/components/admin/labels/video-clock";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import type { ReviewItem } from "@/lib/services/labels/marks-state";
import {
  REPLAY_LEAD_SECONDS,
  REPLAY_SEEK_BACK_SECONDS,
  REPLAY_SEEK_JUMP_SECONDS,
  REPLAY_TAIL_SECONDS,
  advanceAfterAnswer,
  nextStrokeTimeAfter,
  replayTick,
  replayWindow,
  stepKey,
  stepKeyOf,
} from "@/lib/services/labels/review-flow";
import {
  nextReviewStop,
  openReviewItems,
  reviewStep,
} from "@/lib/services/labels/review-step";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
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
): LabelMarks => ({ points, shots, suggestions: [], serveSides: {} });

/** A kept stroke at `time`, seeded with what it holds. */
const stroke = (
  id: string,
  n: number,
  pointId: string,
  over: Partial<LabelShot> = {},
): LabelShot => {
  const odd = n % 2 === 1;
  const shot = labelShot(id, pointId, {
    eventId: 100 + n,
    hitter: odd ? "p1" : "p2",
    stroke: n === 1 ? "first_serve" : "forehand",
    result: "in",
    contactX: 1,
    contactY: odd ? 1 : 22,
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

/** A four-stroke rally at 11…14 s, won by p2 on a forehand in. */
const rally = (id = "pt", over: Partial<LabelPoint> = {}): LabelPoint =>
  labelPoint(id, 0, {
    winner: "p2",
    ending: "winner",
    endedBy: "p2",
    shots: [
      stroke("a", 1, id),
      stroke("b", 2, id),
      stroke("c", 3, id),
      stroke("d", 4, id),
    ],
    ...over,
  });

test.describe("replayWindow", () => {
  test("half a second before the first stroke, one second after the last", () => {
    const point = rally();
    expect(
      replayWindow(point, { fromShotId: "b", toShotId: "d" }, [point], true),
    ).toEqual({
      start: 12 - REPLAY_LEAD_SECONDS,
      stop: 14 + REPLAY_TAIL_SECONDS,
    });
  });

  test("stops at the next stroke anywhere in the match when that comes sooner", () => {
    const point = rally();
    const next = labelPoint("nx", 1, {
      shots: [stroke("e", 1, "nx", { videoTime: 14.4 })],
    });
    expect(
      replayWindow(
        point,
        { fromShotId: "a", toShotId: "d" },
        [point, next],
        true,
      ),
    ).toEqual({ start: 11 - REPLAY_LEAD_SECONDS, stop: 14.4 });
    // A deleted point's strokes are not on the film's clock.
    expect(
      nextStrokeTimeAfter([point, { ...next, status: "deleted" }], 14, true),
    ).toBeNull();
    expect(nextStrokeTimeAfter([point, next], 14, true)).toBe(14.4);
    expect(nextStrokeTimeAfter([point], 12, true)).toBe(13);
  });

  test("never before zero, never a stop before its start, null without times", () => {
    const early = labelPoint("e", 0, {
      shots: [stroke("a", 1, "e", { videoTime: 0.2 })],
    });
    expect(
      replayWindow(early, { fromShotId: "a", toShotId: "a" }, [early], true),
    ).toEqual({ start: 0, stop: 0.2 + REPLAY_TAIL_SECONDS });
    const untimed = rally("u");
    untimed.shots[3] = { ...untimed.shots[3], videoTime: null };
    expect(
      replayWindow(
        untimed,
        { fromShotId: "a", toShotId: "d" },
        [untimed],
        true,
      ),
    ).toBeNull();
    expect(
      replayWindow(
        untimed,
        { fromShotId: "x", toShotId: "a" },
        [untimed],
        true,
      ),
    ).toBeNull();
  });
});

test.describe("replayTick", () => {
  const window = { start: 10, stop: 15 };
  test("runs through the window, stops at the stop", () => {
    expect(replayTick(window, null, 3)).toBe("run");
    expect(replayTick(window, null, 10)).toBe("run");
    expect(replayTick(window, 10, 10.3)).toBe("run");
    expect(replayTick(window, 14.8, 15)).toBe("stop");
    expect(replayTick(window, 14.8, 15.4)).toBe("stop");
  });
  test("a tick that is a seek lets go: back, or a jump ahead", () => {
    expect(replayTick(window, 12, 12 - REPLAY_SEEK_BACK_SECONDS - 0.01)).toBe(
      "cancel",
    );
    expect(replayTick(window, 12, 12 + REPLAY_SEEK_JUMP_SECONDS + 0.01)).toBe(
      "cancel",
    );
    // The first tick after the replay's own seek is never one.
    expect(replayTick(window, null, 40)).toBe("stop");
    expect(replayTick(window, null, 2)).toBe("run");
  });
});

test.describe("runReplay", () => {
  function fakePlayer() {
    const calls: string[] = [];
    const clock = createVideoClock(null);
    const deps = {
      seekTo: (at: number) => calls.push(`seek ${at}`),
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      clock,
    };
    return { calls, clock, deps };
  }

  test("seeks once, plays, and pauses when the clock reaches the stop", () => {
    const { calls, clock, deps } = fakePlayer();
    const handle = runReplay({ start: 11.5, stop: 15 }, deps);
    expect(calls).toEqual(["seek 11.5", "play"]);
    for (const t of [11.5, 11.9, 12.4, 13, 13.5, 14, 14.5]) clock.set(t);
    expect(handle.running()).toBe(true);
    expect(calls).toHaveLength(2);
    clock.set(15.1);
    expect(calls).toEqual(["seek 11.5", "play", "pause"]);
    expect(handle.running()).toBe(false);
    // Nothing more once it is done, whatever the clock does.
    clock.set(16);
    clock.set(3);
    expect(calls).toHaveLength(3);
  });

  test("the labeller's own seek lets the replay go without a pause", () => {
    const { calls, clock, deps } = fakePlayer();
    const handle = runReplay({ start: 11.5, stop: 15 }, deps);
    clock.set(11.5);
    clock.set(12);
    // A scrub back to the serve.
    clock.set(9);
    expect(handle.running()).toBe(false);
    clock.set(15.5);
    expect(calls).toEqual(["seek 11.5", "play"]);
  });

  test("cancel lets it go; the film is not touched", () => {
    const { calls, clock, deps } = fakePlayer();
    const handle = runReplay({ start: 11.5, stop: 15 }, deps);
    clock.set(12);
    handle.cancel();
    expect(handle.running()).toBe(false);
    clock.set(15.5);
    expect(calls).toEqual(["seek 11.5", "play"]);
  });
});

test.describe("stepKey and advanceAfterAnswer", () => {
  const item = (
    id: ReviewItem["id"],
    members: { code: LabelMarkCode; shotId?: string; open?: boolean }[],
  ): ReviewItem =>
    ({
      id,
      question: "",
      tone: "score",
      state: "open",
      members: members.map(({ code, shotId, open = true }) => ({
        mark: mark(
          code,
          (shotId === undefined
            ? {}
            : { shotId }) as LabelMarkParams[typeof code],
        ),
        state: open ? "open" : "answered",
      })),
    }) as ReviewItem;

  test("a step is its point, its item and its open members", () => {
    const a = stepKey(
      "pt",
      item(4, [{ code: "last_landing_missing", shotId: "d" }]),
    );
    expect(a).toBe("pt/4:last_landing_missing@d");
    // Order and answered members do not count.
    expect(
      stepKey(
        "pt",
        item(4, [
          { code: "ending_stale", open: false },
          { code: "last_landing_missing", shotId: "d" },
        ]),
      ),
    ).toBe(a);
    expect(
      stepKey(
        "pt",
        item(4, [
          { code: "winner_disputed" },
          { code: "last_landing_missing", shotId: "d" },
        ]),
      ),
    ).toBe("pt/4:last_landing_missing@d,winner_disputed@");
    expect(stepKey("other", item(4, [{ code: "winner_disputed" }]))).not.toBe(
      stepKey("pt", item(4, [{ code: "winner_disputed" }])),
    );
    expect(stepKeyOf("pt", null)).toBe("");
  });

  test("the same step stays; another one advances; none left is done", () => {
    expect(advanceAfterAnswer("pt/4:a@d", "pt/4:a@d")).toBe("stay");
    expect(advanceAfterAnswer("pt/4:a@d", "pt/2:b@e")).toBe("advance");
    // The item still open but asking something else is a step to land on.
    expect(advanceAfterAnswer("pt/4:a@d,b@", "pt/4:b@")).toBe("advance");
    expect(advanceAfterAnswer("pt/4:a@d", "")).toBe("done");
    // Nothing open before and after: a refresh moves nothing.
    expect(advanceAfterAnswer("", "")).toBe("stay");
  });

  test("within the point first, then the next flagged point is `]`'s", () => {
    // A lone first serve that missed, its landing unknown: the serve
    // question, then the last bounce.
    const lone = labelPoint("pt", 0, {
      winner: "p2",
      shots: [
        stroke("a", 1, "pt", {
          result: "out",
          landingX: null,
          landingY: null,
        }),
      ],
    });
    const other = rally("nx", { pointIndex: 1 });
    const marks = marksOf({
      pt: [mark("first_serve_fault_alone", {})],
      nx: [
        mark("winner_disputed", { scoreWinner: "p2", lastStrokeWinner: "p1" }),
      ],
    });
    const points = [lone, other];
    const items = openReviewItems(lone, marks, points);
    expect(items.map((i) => i.id)).toEqual([3, 4]);
    const first = reviewStep(lone, marks, points, NAMES, true);
    expect(first?.item.id).toBe(3);
    expect(first?.index).toBe(1);
    expect(first?.total).toBe(2);
    const before = stepKeyOf("pt", first);
    // Item 3 answered: item 4 is the point's step, so the console lands on
    // it rather than leaving the point.
    expect(advanceAfterAnswer(before, stepKey("pt", items[1]))).toBe("advance");
    expect(nextReviewStop(points, marks, "pt", 1)?.pointId).toBe("pt");
    // Both answered: done here, and `]` finds the next flagged point.
    expect(advanceAfterAnswer(stepKey("pt", items[1]), "")).toBe("done");
    const cleared = { ...lone, checkedAt: "2026-10-16T00:00:00Z" };
    const next = nextReviewStop([cleared, other], marks, "pt", 1);
    expect(next?.pointId).toBe("nx");
    expect(next?.item.id).toBe(4);
  });
});
