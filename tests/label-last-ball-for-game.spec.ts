import { expect, test } from "@playwright/test";
import { lockedGameNeeds } from "@/lib/services/labels/game-boundary";
import type { LabelMark, LabelMarks } from "@/lib/services/labels/marks";
import {
  drawsGhosts,
  lastBallAgainstGame,
  withoutRepeatedLastCall,
  reviewFlag,
  reviewItemQuestion,
} from "@/lib/services/labels/marks-state";
import { reviewStep } from "@/lib/services/labels/review-step";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

// "Was the last ball out?" after a dragged game boundary: a locked game that
// does not add up asks, on each point the game needs won the other way,
// whether the last ball's call was wrong (marks-state.ts
// `lastBallAgainstGame`, raised live by score-marks.ts `lockedGameMarks`).

const MARK = "src/components/admin/labels/label-black-mark.tsx";
const NAMES = { p1: "Lee", p2: "Vargas" };

/** Deuce, ad, deuce…: the side the score expects, so no serve-side mark. */
const side = (index: number) => (index % 2 === 0 ? "deuce" : "ad");

/** An ace by Lee, the server: a point Lee won. */
function ace(id: string, index: number): LabelPoint {
  return labelPoint(id, index, {
    serveSide: side(index),
    winner: "p1",
    ending: "ace",
    endedBy: "p1",
    shots: [
      labelShot(`${id}-s1`, id, {
        hitter: "p1",
        stroke: "first_serve",
        result: "in",
        videoTime: index * 10,
      }),
    ],
  });
}

/**
 * A rally Lee served whose last ball, by `lastHitter`, reads `lastResult`;
 * the stored winner and ending follow the strokes.
 */
function rally(
  id: string,
  index: number,
  lastHitter: LabelSide,
  lastResult: LabelShot["result"],
  /**
   * How the last ball's coordinates read against its stored call: `against`
   * (the default — a landing that reads the other way, which is when the
   * game asks), `with` it, or `none` placed.
   */
  landing: "against" | "with" | "none" = "against",
): LabelPoint {
  const t = index * 10;
  // Lee hits from the near baseline, Vargas from the far one; a ball lands
  // deep in the other half, or a metre past its baseline.
  const reads = (result: "in" | "out") =>
    lastHitter === "p1"
      ? {
          contactX: 0,
          contactY: 1,
          landingX: 0,
          landingY: result === "in" ? 20 : 25,
        }
      : {
          contactX: 0,
          contactY: 22,
          landingX: 0,
          landingY: result === "in" ? 3 : -1.5,
        };
  const missedCall = lastResult === "out" || lastResult === "net";
  const ends =
    landing === "none" || lastResult === null
      ? {}
      : reads((landing === "with") === missedCall ? "out" : "in");
  const shots: LabelShot[] = [
    labelShot(`${id}-s1`, id, {
      hitter: "p1",
      stroke: "first_serve",
      result: "in",
      videoTime: t,
    }),
    labelShot(`${id}-s2`, id, {
      hitter: "p2",
      stroke: "forehand",
      result: "in",
      videoTime: t + 1,
    }),
    labelShot(`${id}-s3`, id, {
      hitter: "p1",
      stroke: "backhand",
      result: lastHitter === "p1" ? lastResult : "in",
      videoTime: t + 2,
      ...(lastHitter === "p1" ? ends : {}),
    }),
    ...(lastHitter === "p2"
      ? [
          labelShot(`${id}-s4`, id, {
            hitter: "p2",
            stroke: "forehand",
            result: lastResult,
            videoTime: t + 3,
            ...ends,
          }),
        ]
      : []),
  ];
  const missed = lastResult === "out" || lastResult === "net";
  const winner: LabelSide | null =
    lastResult === null
      ? "p2"
      : missed
        ? lastHitter === "p1"
          ? "p2"
          : "p1"
        : lastHitter;
  return labelPoint(id, index, {
    serveSide: side(index),
    winner,
    ending: missed ? "error" : "winner",
    endedBy: lastHitter,
    shots,
  });
}

/**
 * Game 1, served by Lee, its start dragged into place (locked): three aces
 * and `third` — a 3–1 game, so unfinished, and Lee (the last point's winner)
 * is the side it needs.
 */
function game(third: LabelPoint, locked = true): LabelPoint[] {
  return [
    { ...ace("a", 0), gameStartLocked: locked },
    ace("b", 1),
    third,
    ace("d", 3),
  ];
}

const NO_MARKS: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

const live = (points: LabelPoint[]) =>
  withLiveScoreMarks(NO_MARKS, points, true);

test.describe("Was the last ball out? for a locked game", () => {
  test("lockedGameNeeds names each doubted point with the side its game needs", () => {
    const points = game(rally("c", 2, "p2", "in"));
    expect([...lockedGameNeeds(points, true)]).toEqual([["c", "p1"]]);
    expect([
      ...lockedGameNeeds(game(rally("c", 2, "p2", "in"), false), true),
    ]).toEqual([]);
  });

  test("a winner by the other side asks whether it was out; an error by the needed side asks whether it was in", () => {
    const winner = rally("c", 2, "p2", "in");
    expect(lastBallAgainstGame(winner, "p1", true)).toEqual({
      code: "last_ball_against_game",
      tier: "hint",
      scope: "point",
      params: { shotId: "c-s4", call: "out", gameWinner: "p1" },
    });
    const error = rally("c", 2, "p1", "out");
    expect(lastBallAgainstGame(error, "p1", true)?.params).toEqual({
      shotId: "c-s3",
      call: "in",
      gameWinner: "p1",
    });
    const net = rally("c", 2, "p1", "net");
    expect(lastBallAgainstGame(net, "p1", true)?.params.call).toBe("in");
  });

  test("nothing when the strokes already give the point to that side, or settle nothing", () => {
    // Lee's backhand in, stored as Vargas's point: "Different ending?"'s.
    const stale = { ...rally("c", 2, "p1", "in"), winner: "p2" as const };
    expect(lastBallAgainstGame(stale, "p1", true)).toBeNull();
    // A last ball with no result: no call to flip.
    expect(
      lastBallAgainstGame(rally("c", 2, "p2", null), "p1", true),
    ).toBeNull();
    // A replayed let is no one's point.
    const let_ = {
      ...rally("c", 2, "p2", "in"),
      ending: "let_replayed" as const,
    };
    expect(lastBallAgainstGame(let_, "p1", true)).toBeNull();
  });

  test("only where the landing reads differently from the call: agreeing, or unplaced, it is not asked", () => {
    // Vargas's winner stored in: the game needs Lee, and asks whether it was
    // out only where the ball's own landing reads out.
    expect(
      lastBallAgainstGame(rally("c", 2, "p2", "in", "against"), "p1", true)
        ?.params.call,
    ).toBe("out");
    expect(
      lastBallAgainstGame(rally("c", 2, "p2", "in", "with"), "p1", true),
    ).toBeNull();
    expect(
      lastBallAgainstGame(rally("c", 2, "p2", "in", "none"), "p1", true),
    ).toBeNull();
    // Stored net with a landing that reads out: a miss by both, not asked.
    const netThenOut = rally("c", 2, "p1", "net", "with");
    expect(lastBallAgainstGame(netThenOut, "p1", true)).toBeNull();
    // Lee's error stored out with a landing that reads out too: not asked.
    expect(
      lastBallAgainstGame(rally("c", 2, "p1", "out", "with"), "p1", true),
    ).toBeNull();
  });

  test("never against a call the labeller made: answering “Was the last ball out?” is not asked back as in", () => {
    // Lee's last ball, called out by the labeller (a hint's yes, the Result
    // menu): the game needs Lee, and the opposite call would give it — but
    // the labeller has just said what the ball did.
    const error = rally("c", 2, "p1", "out");
    const called = {
      ...error,
      shots: error.shots.map((shot) =>
        shot.id === "c-s3" ? { ...shot, resultCalled: true } : shot,
      ),
    };
    expect(lastBallAgainstGame(error, "p1", true)).not.toBeNull();
    expect(lastBallAgainstGame(called, "p1", true)).toBeNull();
  });

  test("asked once where the vendor's call already asks the same of the same ball", () => {
    const forGame = (call: "in" | "out"): LabelMark => ({
      code: "last_ball_against_game",
      tier: "hint",
      scope: "point",
      params: { shotId: "c-s4", call, gameWinner: "p1" },
    });
    const lastCall = (vendorCall: "in" | "out", shotId = "c-s4") => ({
      mark: {
        code: "last_call_overruled" as const,
        tier: "count" as const,
        scope: "point" as const,
        params: { vendorCall, eventId: 4 },
      },
      shotId,
    });
    // The same call on the same ball: one question.
    expect(withoutRepeatedLastCall([forGame("out")], lastCall("out"))).toEqual(
      [],
    );
    // Opposite calls disagree, another ball is another question, and with
    // no vendor question the game's stands alone.
    expect(withoutRepeatedLastCall([forGame("out")], lastCall("in"))).toEqual([
      forGame("out"),
    ]);
    expect(
      withoutRepeatedLastCall([forGame("out")], lastCall("out", "c-s3")),
    ).toEqual([forGame("out")]);
    expect(withoutRepeatedLastCall([forGame("out")], null)).toEqual([
      forGame("out"),
    ]);
  });

  test("the live marks carry it on the doubted point only, and only while the game is locked", () => {
    const points = game(rally("c", 2, "p2", "in"));
    const marks = live(points);
    expect(marks.points.c?.map((m) => m.code)).toEqual([
      "last_ball_against_game",
    ]);
    expect(marks.points.a ?? []).toEqual([]);
    expect(live(game(rally("c", 2, "p2", "in"), false)).points.c ?? []).toEqual(
      [],
    );
  });

  test("answered — the ball made out — the game adds up and the question goes", () => {
    const flipped = rally("c", 2, "p2", "out");
    expect(live(game(flipped)).points.c ?? []).toEqual([]);
  });

  test("the review flag asks it as item 4, amber, with Out by the hitter suggested", () => {
    const points = game(rally("c", 2, "p2", "in"));
    const marks = live(points);
    const c = points[2];
    const flag = reviewFlag(c, marks, points)!;
    const item = flag.items.find((i) => i.id === 4)!;
    expect(item.state).toBe("open");
    expect(item.tone).toBe("score");
    expect(flag.tone).toBe("score");
    expect(reviewItemQuestion(item)).toBe("Was the last ball out?");

    // The fixture's strokes are unplaced, so "Shot placement" on the serve
    // comes first in rally order: ask item 4 first, as a jump to it would.
    const step = reviewStep(
      c,
      marks,
      points,
      NAMES,
      drawsGhosts(marks),
      undefined,
      4,
    )!;
    expect(step.item.id).toBe(4);
    const suggested = step.answers.filter((a) => a.kind === "suggested");
    expect(suggested.map((a) => a.label)).toEqual(["Out by Vargas"]);
    expect(suggested[0].writes[0]).toEqual({
      write: "shot",
      shotId: "c-s4",
      patch: { result: "out", result_called: true },
    });
  });

  test("the well offers Yes, make it out, through the console's shot write", () => {
    type Hints = (
      point: LabelPoint,
      marks: LabelMarks,
      names: typeof NAMES,
      edit?: object,
    ) => {
      code: string;
      label: string;
      actions: { label: string; run: () => void }[];
      dismissKey?: string;
    }[];
    const { pointHints } = createLoader().load(MARK) as { pointHints: Hints };
    const points = game(rally("c", 2, "p2", "in"));
    const marks = live(points);
    const calls: unknown[][] = [];
    const hints = pointHints(points[2], marks, NAMES, {
      onPatchShot: (...args: unknown[]) => calls.push(args),
    });
    const hint = hints.find((h) => h.code === "last_ball_against_game")!;
    expect(hint.label).toBe("Was the last ball out?");
    expect(hint.dismissKey).toBe("hint:last_ball_against_game");
    expect(hint.actions.map((a) => a.label)).toEqual(["Yes, make it out"]);
    hint.actions[0].run();
    expect(calls).toEqual([["c-s4", { result: "out", result_called: true }]]);

    // Dismissed, it is not asked again.
    const dismissed = {
      ...points[2],
      dismissed: ["hint:last_ball_against_game"],
    };
    expect(
      pointHints(dismissed, marks, NAMES, { onPatchShot: () => {} }).some(
        (h) => h.code === "last_ball_against_game",
      ),
    ).toBe(false);
  });
});
