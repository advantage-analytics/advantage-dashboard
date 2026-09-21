import { expect, test } from "@playwright/test";

import {
  scoreboardCells,
  setOutcome,
} from "@/components/dashboard/matches/match-detail/report-scoreboard";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The rail scoreboard's set-winner ink rule (F8; spec decisions #6). Pure and
 * offline — nothing here draws a digit, only decides which one is darker.
 */

/** A set as `useMatchSides().sets` hands it over — already you-first. */
function set(
  you: number,
  opp: number,
  tiebreak?: [number, number],
): ScoreLineSet {
  return {
    player1: you,
    player2: opp,
    player1Tiebreak: tiebreak ? tiebreak[0] : null,
    player2Tiebreak: tiebreak ? tiebreak[1] : null,
  };
}

test.describe("setOutcome", () => {
  test("more games than the opponent is a set you won", () => {
    expect(setOutcome(set(6, 4))).toBe("you");
  });

  test("fewer games than the opponent is a set you lost", () => {
    expect(setOutcome(set(3, 6))).toBe("opp");
  });

  test("a tiebreak set resolves by games alone", () => {
    // 7-6(5): decided on games; the tiebreak's own points never enter it —
    // reading them would put whoever scored more tiebreak points ahead even
    // when they lost the set.
    expect(setOutcome(set(7, 6, [7, 5]))).toBe("you");
  });

  test("equal games is level", () => {
    expect(setOutcome(set(6, 6))).toBe("level");
  });
});

/**
 * `scoreboardCells` — the shared row derivation behind BOTH scoreboards (the
 * report's rail and the fullscreen court viewer's slab). Final review #10:
 * the viewer used to hand-copy this, and it is the one widget where a
 * flipped `player1`/`player2` looks entirely correct on screen while
 * attributing the whole score to the wrong player (guardrails §4).
 */
test.describe("scoreboardCells", () => {
  // 6-4, 3-6, 7-6(5) as `useMatchSides().sets` hands it over: you-first.
  const SETS: ScoreLineSet[] = [set(6, 4), set(3, 6), set(7, 6, [7, 5])];

  test("the 'you' row reads the you-first slot of every set", () => {
    expect(scoreboardCells(SETS, "you").map((c) => c.digit)).toEqual([6, 3, 7]);
  });

  test("the 'opp' row reads the other slot — the two rows never share a digit source", () => {
    expect(scoreboardCells(SETS, "opp").map((c) => c.digit)).toEqual([4, 6, 6]);
  });

  test("subject = player 2: a viewer who is player 2 still reads their own games first", () => {
    // `getMatchSides` orients `sets` for the VIEWER, so a player-2 viewer's
    // own games already sit in `player1`. The derivation must therefore be
    // indifferent to who player 1 is in the database — it only ever applies
    // `side` to an already-oriented set. Same numbers, opposite real people.
    const asPlayer2: ScoreLineSet[] = [set(4, 6), set(6, 3), set(6, 7, [5, 7])];
    expect(scoreboardCells(asPlayer2, "you").map((c) => c.digit)).toEqual([
      4, 6, 6,
    ]);
    expect(scoreboardCells(asPlayer2, "opp").map((c) => c.digit)).toEqual([
      6, 3, 7,
    ]);
    // …and the dimming follows the viewer, not the database: they lost sets
    // 1 and 3 here.
    expect(scoreboardCells(asPlayer2, "you").map((c) => c.lostSet)).toEqual([
      true,
      false,
      true,
    ]);
  });

  test("only the losing row's digit is dimmed, per set", () => {
    expect(scoreboardCells(SETS, "you").map((c) => c.lostSet)).toEqual([
      false,
      true,
      false,
    ]);
    expect(scoreboardCells(SETS, "opp").map((c) => c.lostSet)).toEqual([
      true,
      false,
      true,
    ]);
  });

  test("a level set has no loser, so neither row dims", () => {
    // `ScoreLineSet` carries no "unfinished" flag, so an unfinished set
    // arrives as equal games — the closest thing the data model can express,
    // and it must not print one player as having lost it.
    const level = [set(3, 3)];
    expect(scoreboardCells(level, "you")[0].lostSet).toBe(false);
    expect(scoreboardCells(level, "opp")[0].lostSet).toBe(false);
    expect(scoreboardCells(level, "you")[0].tiebreak).toBeNull();
    expect(scoreboardCells(level, "opp")[0].tiebreak).toBeNull();
  });

  test("the tiebreak digit sits on the loser's row only, and is the loser's points", () => {
    const you = scoreboardCells(SETS, "you");
    const opp = scoreboardCells(SETS, "opp");
    // Set 3 is 7-6(5) to you: the raised 5 belongs beside the opponent's 6.
    expect(you[2].tiebreak).toBeNull();
    expect(opp[2].tiebreak).toBe(5);
    // A non-tiebreak set has none on either row.
    expect(you[0].tiebreak).toBeNull();
    expect(opp[0].tiebreak).toBeNull();
  });

  test("no played sets is an empty list, never a fabricated 0-0", () => {
    expect(scoreboardCells([], "you")).toEqual([]);
    expect(scoreboardCells([], "opp")).toEqual([]);
  });
});
